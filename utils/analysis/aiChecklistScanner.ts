import { GoogleGenerativeAI } from '@google/generative-ai';
import { DocumentChecklistAIAnalysis } from '../../types';

export interface ChecklistRuleContext {
  id: string;
  nome: string;
}

interface AnalyzeChecklistDocParams {
  ordem: string;
  tipo: string;
  ocrText: string;
  rules: ChecklistRuleContext[];
}

const OCR_CHAR_LIMIT = 24000;
const MODEL_RETRY_LIMIT = 2;
const CIRCUIT_BREAKER_MS = 60_000;
let geminiUnavailableUntil = 0;

const extractJsonObject = (text: string): any => {
  const match = text.match(/\{[\s\S]*\}/);
  const raw = match ? match[0] : text;
  return JSON.parse(raw);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractStatusCode = (error: any): number | null => {
  const fromStatus = Number(error?.status || error?.response?.status);
  if (Number.isFinite(fromStatus) && fromStatus > 0) {
    return fromStatus;
  }

  const message = String(error?.message || error || '');
  const match = message.match(/\b(429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
};

const isRetryableStatus = (status: number | null) => status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

export const analyzeDocumentChecklistWithAI = async ({
  ordem,
  tipo,
  ocrText,
  rules
}: AnalyzeChecklistDocParams): Promise<DocumentChecklistAIAnalysis> => {
  if (Date.now() < geminiUnavailableUntil) {
    const seconds = Math.ceil((geminiUnavailableUntil - Date.now()) / 1000);
    throw new Error(`Servico IA temporariamente indisponivel (aguarde ${seconds}s e tente novamente).`);
  }

  const apiKeyRaw = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKeyRaw) {
    throw new Error('VITE_GEMINI_API_KEY nao configurada para analise IA do checklist.');
  }

  const snippet = String(ocrText || '').slice(0, OCR_CHAR_LIMIT);
  if (!snippet.trim()) {
    return {
      documentOrder: String(ordem || ''),
      documentType: String(tipo || ''),
      summary: 'Sem OCR suficiente para analise.',
      analyzedChars: 0,
      source: 'ocr-ai',
      matchedRules: []
    };
  }

  const rulesList = rules.map((r) => `- ${r.id}: ${r.nome}`).join('\n');

  const prompt = `
Voce e um analista de processos de contratacao publica.
Recebera um trecho do OCR de UM documento e precisa:
1) gerar um resumo curto e objetivo desse documento;
2) indicar quais itens do checklist ele provavelmente atende.

IMPORTANTE:
- Use somente os IDs de regra permitidos abaixo.
- Se nao houver evidencia suficiente, nao marque a regra.
- Baseie-se no texto OCR recebido.
- O texto pode estar truncado para as primeiras paginas.

REGRAS PERMITIDAS:
${rulesList}

RETORNE APENAS JSON VALIDO neste formato:
{
  "summary": "resumo em ate 3 frases",
  "matchedRules": [
    {
      "ruleId": "id_da_regra",
      "confidence": "alta|media|baixa",
      "justification": "trecho curto explicando a evidencia"
    }
  ]
}

METADADOS DO DOCUMENTO:
- ordem: ${ordem}
- tipo: ${tipo}

OCR (possivelmente parcial):
${snippet}
`;

  const genAI = new GoogleGenerativeAI(apiKeyRaw.trim());
  const preferredModel = import.meta.env.VITE_GEMINI_MODEL?.trim() || 'gemini-2.5-flash-lite';
  const models = [preferredModel, 'gemini-2.5-flash', 'gemini-1.5-flash'];
  const validRuleIds = new Set(rules.map((r) => r.id));

  let responseText = '';
  let lastError: unknown = null;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= MODEL_RETRY_LIMIT; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        responseText = result.response.text();
        if (responseText) break;
      } catch (error) {
        lastError = error;
        const status = extractStatusCode(error);
        const retryable = isRetryableStatus(status);
        const hasAttemptsLeft = attempt < MODEL_RETRY_LIMIT;
        if (!retryable || !hasAttemptsLeft) {
          break;
        }

        const delayMs = 600 * Math.pow(2, attempt - 1);
        await sleep(delayMs);
      }
    }

    if (responseText) {
      break;
    }
  }

  if (!responseText) {
    const status = extractStatusCode(lastError);
    if (isRetryableStatus(status)) {
      geminiUnavailableUntil = Date.now() + CIRCUIT_BREAKER_MS;
    }
    throw (lastError || new Error('Falha ao obter resposta de modelo para checklist.'));
  }

  let parsed: any = {};
  try {
    parsed = extractJsonObject(responseText);
  } catch {
    parsed = {};
  }

  const rawMatches = Array.isArray(parsed?.matchedRules) ? parsed.matchedRules : [];
  const matchedRules = rawMatches
    .map((match: any) => ({
      ruleId: String(match?.ruleId || '').trim(),
      confidence: String(match?.confidence || '').toLowerCase(),
      justification: String(match?.justification || '').trim()
    }))
    .filter((match: any) => validRuleIds.has(match.ruleId))
    .map((match: any) => ({
      ruleId: match.ruleId,
      confidence: (match.confidence === 'alta' || match.confidence === 'media' || match.confidence === 'baixa')
        ? match.confidence
        : undefined,
      justification: match.justification || undefined
    }));

  return {
    documentOrder: String(ordem || ''),
    documentType: String(tipo || ''),
    summary: String(parsed?.summary || '').trim() || `Resumo gerado a partir do OCR do documento ${tipo}.`,
    analyzedChars: snippet.length,
    source: 'ocr-ai',
    matchedRules
  };
};
