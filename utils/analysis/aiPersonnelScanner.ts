import { GoogleGenerativeAI } from '@google/generative-ai';

const PERSONNEL_PROMPT = `
Você é um especialista em análise de documentos administrativos do IFES (Instituto Federal do Espírito Santo).
Sua tarefa é ler o texto de uma PORTARIA de designação de equipe de planejamento e extrair os nomes dos membros da equipe.

Analise o texto fornecido abaixo e identifique os nomes das pessoas designadas para a EQUIPE DE PLANEJAMENTO.
O texto geralmente segue o padrão: "RESOLVE Art. 1º Designar os servidores abaixo relacionados, para comporem a equipe de planejamento... a) NOME, matrícula... b) NOME, matrícula...".

Retorne APENAS um JSON contendo uma lista de strings com os nomes completos encontrados.
Exemplo de Saída:
{
  "membros": ["Fulano da Silva", "Ciclano Souza", "Beltrano Pereira"]
}

Se não encontrar nenhum nome ou não for uma portaria de equipe de planejamento, retorne uma lista vazia.
Ignore o nome do Diretor Geral que assina a portaria (geralmente no final ou no início como autoridade). Foque nos DESIGNADOS.

TEXTO DA PORTARIA:
`;

export const extractPlanningTeam = async (text: string): Promise<string[]> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Gemini API Key missing");
        return [];
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const result = await model.generateContent(PERSONNEL_PROMPT + text);
        const responseText = result.response.text();

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

        const data = JSON.parse(jsonStr);
        return data.membros || [];
    } catch (error) {
        console.error("Erro ao extrair equipe:", error);
        return [];
    }
};
