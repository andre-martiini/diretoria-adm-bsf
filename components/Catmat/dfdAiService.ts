import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ExtractedNeed {
  tipo: 'CATMAT' | 'CATSER';
  necessidade: string;
  termos_busca: string;
  valor_estimado: number;
}

export interface SelectedCandidate {
  codigo_selecionado: string;
  descricao_selecionada: string;
  justificativa: string;
}

const getGenAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Chave de API do Gemini não encontrada.');
  return new GoogleGenerativeAI(apiKey);
};

export const extractNeeds = async (text: string): Promise<ExtractedNeed[]> => {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  const prompt = `Leia o problema relatado no Documento de Formalização de Demanda:
"${text}"

Identifique TODOS os materiais ou serviços que precisam ser adquiridos ou contratados. A mesma demanda pode conter tanto múltiplos materiais quanto múltiplos serviços simultaneamente, extraia cada um deles como um item separado do array retornado. Seja detalhista e objetivo.

Retorne APENAS um array JSON válido, sem crases markdown, correspondente às necessidades identificadas. Siga EXATAMENTE este formato:
[
  { 
    "tipo": "CATMAT" ou "CATSER", 
    "necessidade": "descrição curta do item que precisa ser comprado/contratado", 
    "termos_busca": "3 a 5 palavras-chave principais para busca no catálogo do SIASG",
    "valor_estimado": 0.0 // Extraia um valor numérico em reais se o usuário forneceu uma estimativa. Caso não forneça, retorne 0.
  }
]`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    const responseText = result.response.text().trim();
    return JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '')) as ExtractedNeed[];
  } catch (err) {
    console.error("Erro ao extrair necessidades da IA:", err);
    return [];
  }
};

export const selectBestCandidate = async (need: string, candidates: any[]): Promise<SelectedCandidate | null> => {
  if (!candidates || candidates.length === 0) return null;

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

  // Prepara lista curta de candidatos para o prompt
  const candidateList = candidates.map(c => {
    const code = c.codigoMaterial || c.codigoServico;
    const desc = c.descricaoMaterial || c.descricaoServico;
    return `Código: ${code} - Descrição: ${desc}`;
  }).join('\\n');

  const prompt = `Para a necessidade "${need}", encontre a melhor opção nesta lista de catálogos do SIASG:
${candidateList}

Retorne APENAS um objeto JSON válido, sem crases markdown, com o seguinte formato:
{ 
  "codigo_selecionado": "código numérico", 
  "descricao_selecionada": "descrição completa do catálogo", 
  "justificativa": "1 frase curta rigorosamente técnica explicando o motivo da escolha em terceira pessoa" 
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    const responseText = result.response.text().trim();
    return JSON.parse(responseText.replace(/```json/g, '').replace(/```/g, '')) as SelectedCandidate;
  } catch (err) {
    console.error("Erro ao selecionar melhor candidato pela IA:", err);
    return null;
  }
};
