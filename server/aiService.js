import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env.local da raiz do projeto
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const apiKey = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

export async function summarizeDespachos(processoInfo, despachos) {
    if (!apiKey) {
        console.error("[AI] Gemini API Key not found!");
        return { short: "Erro: API Key não configurada.", detailed: "Erro: API Key não configurada." };
    }

    if (!despachos || despachos.length === 0) {
        return { short: "Sem despachos.", detailed: "Não há despachos suficientes para análise." };
    }

    const context = `
    Você é um sistema de análise de processos dupla. Sua missão é gerar dois tipos de resumo baseados nos textos dos despachos fornecidos.

    DADOS DO PROCESSO:
    - Número: ${processoInfo.numeroProcesso}
    - Assunto: ${processoInfo.assuntoDescricao}
    - Unidade de Origem: ${processoInfo.unidadeOrigem}

    TEXTOS DOS DESPACHOS (CRONOLÓGICO):
    ${despachos.map((d, i) => `--- DESPACHO ${i + 1} (${d.tipo} - ${d.data}) ---\n${d.texto}`).join('\n\n')}

    --- TAREFA 1: GERAÇÃO DO RESUMO "FLASH" (Para listagem rápida) ---
    INSTRUÇÃO:
    Atue como um analista de processos administrativos.
    Escreva **apenas um parágrafo** coeso (sem tópicos) seguindo estritamente esta estrutura lógica:
    1. **O Objeto:** Comece definindo o que está sendo tratado (aquisição de X, contratação de Y).
    2. **O Financeiro:** Cite o valor total **Empenhado** (garantido) e, SOMENTE SE HOUVER menção explícita no texto (notas fiscais, recebimento, pagamento), cite o valor **Executado/Pago**. Se não houver valores, ignore.
    3. **O Status Real:** Conclua com a situação do último despacho (ex: aguardando entrega, encerrado, em cotação, suspenso).
    **Regra de Ouro:** Priorize a informação do despacho mais recente.

    --- TAREFA 2: GERAÇÃO DO RELATÓRIO "AUDITOR" (Para detalhamento profundo) ---
    INSTRUÇÃO:
    Você é um Auditor de Processos Públicos. Analise o histórico e gere um Relatório de Situação.
    REGRAS DE ANÁLISE:
    1. **Cronologia Reversa:** O despacho mais recente define a verdade atual.
    2. **Inteligência Financeira:** Diferencie Valor Empenhado de Valor Executado.
    3. **Flexibilidade:** Sintetize a evolução.

    FORMATO DA TAREFA 2 (RELATÓRIO):
    ## 1. Resumo Executivo
    [Parágrafo único sintetizando: Objeto + Valores Finais + Status do último despacho.]

    ## 2. Evolução do Processo
    [Narre a história focando nas decisões relevantes]
    - **Início:** ...
    - **Trâmites Principais:** ...
    - **Situação Atual:** ...

    ## 3. Quadro Financeiro e Administrativo
    | Dado | Informação Extraída |
    | :--- | :--- |
    | **Objeto Final** | ... |
    | **Valor Total EMPENHADO** | ... |
    | **Valor Total EXECUTADO** | ... |
    | **Empresas/Favorecidos** | ... |
    | **Fonte/Orçamento** | ... |

    ## 4. Pontos de Atenção (Opcional)
    [Apenas se houver algo atípico]

    --- SAÍDA OBRIGATÓRIA ---
    Retorne APENAS um objeto JSON (sem blocos de código markdown) com o seguinte formato:
    {
      "resumoFlash": "Texto gerado na Tarefa 1",
      "relatorioDetalhado": "Texto gerado na Tarefa 2 (formatado em Markdown)",
      "analise_ia_estruturada": {
        "parecer_risco": "Baixo | Médio | Alto",
        "proxima_etapa_sugerida": "Frase curta descrevendo a ação imediata necessária",
        "pendencias_detectadas": ["Item 1", "Item 2", ...]
      }
    }
    `;

    try {
        const result = await model.generateContent(context);
        const response = await result.response;
        const text = response.text().trim();

        // Limpeza básica caso venha com markdown json block
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

        return JSON.parse(cleanText);
    } catch (error) {
        console.error("[AI ERROR]", error);
        // Fallback manco para não quebrar o front
        return {
            resumoFlash: "Erro na geração do resumo.",
            relatorioDetalhado: "Não foi possível processar o relatório detalhado devido a um erro técnico."
        };
    }
}
