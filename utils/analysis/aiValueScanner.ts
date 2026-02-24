import { GoogleGenerativeAI } from '@google/generative-ai';

const VALUE_PROMPT = `
Você é um especialista em análise de documentos de compras públicas (Pesquisa de Preços / Mapa Comparativo).
Sua tarefa é ler o texto do documento e identificar o VALOR TOTAL ESTIMADO da contratação.

O valor geralmente aparece como "Total Geral", "Valor Total", "Média Total", "Valor Estimado", "Total Estimado" ou ao final de uma tabela de preços.
Se houver múltiplos cenários (ex: Menor Preço, Média), prefira o valor da "Média" ou "Média Saneada", a menos que o documento indique explicitamente outro método (ex: Menor Preço).
Se houver apenas um valor total claro, use-o.

Retorne APENAS um JSON com o valor numérico (ponto flutuante) e o trecho do texto onde encontrou.
Exemplo de Saída:
{
  "valor": 15400.50,
  "metodo": "Média Saneada",
  "trecho": "Total Geral Estimado: R$ 15.400,50"
}

Se não encontrar o valor com segurança, retorne null no campo valor.

TEXTO DO DOCUMENTO:
`;

export const extractEstimatedValue = async (text: string): Promise<{ valor: number | null, metodo?: string, trecho?: string }> => {
    const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!rawApiKey) {
        console.error("Gemini API Key missing");
        return { valor: null };
    }

    try {
        const apiKey = rawApiKey.trim();
        const genAI = new GoogleGenerativeAI(apiKey);
        const preferredModel = import.meta.env.VITE_GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
        const fallbackModels = [preferredModel, "gemini-2.5-flash", "gemini-1.5-flash"];

        let responseText = '';
        let lastError: unknown = null;
        for (const modelName of fallbackModels) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(VALUE_PROMPT + text.substring(0, 30000)); // Limit text size to avoid token limits if PDF is huge
                responseText = result.response.text();
                break;
            } catch (err) {
                lastError = err;
            }
        }

        if (!responseText) {
            throw lastError || new Error('Nenhum modelo respondeu.');
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

        const data = JSON.parse(jsonStr);
        return {
            valor: typeof data.valor === 'number' ? data.valor : null,
            metodo: data.metodo,
            trecho: data.trecho
        };
    } catch (error) {
        console.error("Erro ao extrair valor estimado:", error);
        return { valor: null };
    }
};
