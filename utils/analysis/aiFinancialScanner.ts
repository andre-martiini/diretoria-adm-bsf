import { GoogleGenerativeAI } from '@google/generative-ai';
import { FinancialEvent } from '../../types';

const INITIAL_PROMPT = `
Você é um Auditor Financeiro especializado em documentos SIPAC e Notas de Empenho (NE).
Sua tarefa é analisar o texto de um documento e extrair o Valor Total Empenhado.

Regras de Ouro:
1. FOCO TOTAL: Identifique o valor principal da Nota de Empenho (geralmente rotulado como "Valor Total", "Total do Empenho" ou similar).
2. TIPOS PERMITIDOS:
   - EMPENHO: Autorização principal de despesa.
   - ANULACAO: Documento que cancela ou estorna um valor empenhado anteriormente.
3. IGNORE: Não extraia valores de impostos, datas de vencimento como valores financeiros, ou números de protocolos.
4. FORMATO: A data deve ser YYYY-MM-DD. O valor deve ser um número (float).

Responda EXCLUSIVAMENTE em formato JSON:
[
  {
    "value": number,
    "date": "YYYY-MM-DD",
    "type": "EMPENHO" | "ANULACAO",
    "documentTitle": string
  }
]
`;

export const analyzeDocumentsWithAI = async (
    documents: { title: string; text: string }[]
): Promise<Partial<FinancialEvent>[]> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Gemini API Key (VITE_GEMINI_API_KEY) not found in environment.");
        return [];
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey.trim());
        // Com o SDK atualizado, o 2.0 Flash Lite é a melhor opção custo-benefício
        const modelName = "gemini-2.0-flash-lite";

        let model = genAI.getGenerativeModel({ model: modelName });
        const combinedContext = documents.map(d => `[DOCUMENTO: ${d.title}]\n${d.text}`).join('\n\n---\n\n');
        const fullPrompt = `${INITIAL_PROMPT}\n\nTEXTO PARA ANÁLISE:\n${combinedContext}`;

        let result;
        try {
            result = await model.generateContent(fullPrompt);
        } catch (fetchError: any) {
            console.warn(`[AI] Erro no modelo ${modelName}: ${fetchError.message}. Tentando fallback de estabilidade...`);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            result = await model.generateContent(fullPrompt);
        }

        const responseText = result.response.text();

        // Clean markdown JSON formatting if present
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const cleanJson = jsonMatch ? jsonMatch[0] : responseText;

        return JSON.parse(cleanJson);
    } catch (error) {
        console.error("AI Financial Analysis failed:", error);
        return [];
    }
};
