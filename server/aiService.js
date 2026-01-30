import { VertexAI } from '@google-cloud/vertexai';
import { createRequire } from 'module';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Define o caminho para o arquivo de credenciais
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');
console.log(`[AI-AUTH] Verificando chave em: ${serviceAccountPath}`);
if (fs.existsSync(serviceAccountPath)) {
    console.log(`[AI-AUTH] ✅ Arquivo de credenciais encontrado.`);
} else {
    console.warn(`[AI-AUTH] ⚠️ Arquivo de credenciais NÃO encontrado em ${serviceAccountPath}`);
}

// Configuração Vertex AI - Passando credenciais diretamente para evitar erros de ambiente
const project = process.env.PROJECT_ID || 'diretoria-adm-bsf';
const location = 'global';

const vertexAI = new VertexAI({
    project,
    location,
    apiEndpoint: 'aiplatform.googleapis.com',
    googleAuthOptions: fs.existsSync(serviceAccountPath) ? { keyFilename: serviceAccountPath } : undefined
});

// Client regional para Embeddings (us-central1) pois modelos de vetorização não suportam endpoint global
const vertexAIEmbed = new VertexAI({
    project,
    location: 'us-central1',
    googleAuthOptions: fs.existsSync(serviceAccountPath) ? { keyFilename: serviceAccountPath } : undefined
});

/**
 * IMPLEMENTAÇÃO LOCAL DO RECURSIVE CHARACTER TEXT SPLITTER
 * Removemos a dependência do 'langchain' para evitar erros de importação (ERR_PACKAGE_PATH_NOT_EXPORTED)
 * Esta classe replica a lógica de dividir o texto respeitando parágrafos e pontuação.
 */
class RecursiveCharacterTextSplitter {
    constructor({ chunkSize = 1000, chunkOverlap = 200, separators = ["\n\n", "\n", ".", "!", "?", " ", ""] }) {
        this.chunkSize = chunkSize;
        this.chunkOverlap = chunkOverlap;
        this.separators = separators;
    }

    async createDocuments([text]) {
        const chunks = this.splitText(text, this.separators);
        return chunks.map(chunk => ({ pageContent: chunk }));
    }

    splitText(text, separators) {
        const finalChunks = [];
        let separator = separators[0];
        let nextSeparators = separators.slice(1);

        // Se não temos mais separadores, cortamos na força bruta (caractere)
        if (!separator) {
            return this.splitByCharacter(text);
        }

        let segments = text.split(separator);
        let currentChunk = "";

        for (let segment of segments) {
            // Se o segmento sozinho já é grande, precisamos dividi-lo mais (sub-separadores)
            if (segment.length > this.chunkSize && nextSeparators.length > 0) {
                const subChunks = this.splitText(segment, nextSeparators);
                for (let sub of subChunks) {
                    this.accumulate(sub, separator, finalChunks, currentChunk);
                }
            } else {
                // Caso contrário, tentamos acumular
                if (currentChunk.length + segment.length + separator.length > this.chunkSize) {
                    if (currentChunk.trim().length > 0) finalChunks.push(currentChunk.trim());
                    currentChunk = segment; // Começa novo chunk com overlap (simplificado aqui)
                } else {
                    currentChunk += (currentChunk.length > 0 ? separator : "") + segment;
                }
            }
        }

        if (currentChunk.trim().length > 0) finalChunks.push(currentChunk.trim());

        return finalChunks;
    }

    splitByCharacter(text) {
        const chunks = [];
        for (let i = 0; i < text.length; i += (this.chunkSize - this.chunkOverlap)) {
            chunks.push(text.slice(i, i + this.chunkSize));
        }
        return chunks;
    }

    accumulate(segment, separator, finalChunks, currentChunk) {
        // Lógica simplificada de acumulação
        if (currentChunk.length + segment.length + separator.length > this.chunkSize) {
            if (currentChunk.trim().length > 0) finalChunks.push(currentChunk.trim());
            return segment;
        } else {
            return currentChunk + (currentChunk.length > 0 ? separator : "") + segment;
        }
    }
}

/**
 * Orchestrator: Pega um arquivo do Storage, extrai, chunka e vetoriza.
 */
export async function processFileForDataLake(storagePath, processId, fileId) {
    console.log(`[AI-LAKE] 🤖 Iniciando processamento inteligente: ${storagePath}`);
    const db = admin.firestore();
    const bucket = admin.storage().bucket('diretoria-adm-bsf.firebasestorage.app');

    try {
        // 1. Atualiza status para PROCESSING
        await db.collection('contratacoes').doc(processId).collection('arquivos').doc(fileId).update({
            status: 'PROCESSING',
            processingStartedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Download do buffer
        const [buffer] = await bucket.file(storagePath).download();

        // 3. Extração de Texto (Tática Híbrida)
        let extractedText = "";
        try {
            const pdfData = await pdf(buffer);
            extractedText = pdfData.text;
        } catch (e) {
            console.warn(`[AI-LAKE] pdf-parse falhou, tentando Gemini OCR...`);
        }

        // Se o texto for muito curto ou falhar, usamos o Gemini 1.5 Flash para OCR direto no PDF
        if (extractedText.trim().length < 100) {
            console.log(`[AI-LAKE] Documento parece ser imagem ou digitalização. Usando Gemini Vision/OCR...`);
            extractedText = await extractTextWithGemini(buffer, storagePath);
        }

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error("Não foi possível extrair nenhum texto do documento.");
        }

        // 4. Chunking Profissional (Implementação Local Robusta)
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
            separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
        });

        const chunks = await splitter.createDocuments([extractedText]);
        console.log(`[AI-LAKE] Texto fragmentado em ${chunks.length} pedaços (Recursive Splitter).`);

        // 5. Vetorização e Salvamento - BYPASS SDK (REST API)
        console.log(`[AI-LAKE] Gerando embeddings via REST API (us-central1)...`);

        // Setup Auth para REST
        const auth = new GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });
        const authToken = await auth.getAccessToken();

        let savedChunks = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i].pageContent;

            // Chamada REST Direta para Vertex AI Embeddings
            const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/text-embedding-004:predict`;

            const restResponse = await axios.post(url, {
                instances: [{ content: chunkText }]
            }, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const embedding = restResponse.data.predictions[0].embeddings.values;

            // Salvar no Firestore
            await db.collection('contratacoes')
                .doc(processId)
                .collection('arquivos')
                .doc(fileId)
                .collection('chunks')
                .add({
                    text: chunkText,
                    embedding: admin.firestore.FieldValue.vector(embedding),
                    chunkIndex: i,
                    processoId: processId,
                    fileId: fileId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

            savedChunks++;
            if (i % 5 === 0) console.log(`[AI-LAKE] Progresso: ${i + 1}/${chunks.length} chunks vetorizados...`);
        }

        // 6. Finalização com Sucesso
        await db.collection('contratacoes').doc(processId).collection('arquivos').doc(fileId).update({
            status: 'COMPLETED',
            totalChunks: savedChunks,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[AI-LAKE] ✅ Processamento CONCLUÍDO para ${storagePath}`);

    } catch (error) {
        console.error(`[AI-LAKE] ❌ ERRO no processamento do arquivo:`, error.message);

        // Tenta registrar o erro no Firestore
        try {
            if (db && processId && fileId) {
                await db.collection('contratacoes').doc(processId).collection('arquivos').doc(fileId).update({
                    status: 'ERROR',
                    errorMessage: error.message,
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (e) {
            console.error('[AI-LAKE] Fatal: não foi possível salvar log de erro no DB.', e);
        }
    }
}

async function extractTextWithGemini(buffer, fileName) {
    const model = vertexAI.getGenerativeModel({
        model: 'gemini-3-flash-preview'
    });

    const isHtml = fileName.toLowerCase().endsWith('.html') || fileName.toLowerCase().endsWith('.htm');
    const base64Data = buffer.toString('base64');

    const request = {
        contents: [
            {
                role: 'user',
                parts: isHtml ? [
                    { text: `Abaixo está o conteúdo de um arquivo HTML extraído do SIPAC. Extraia e transcreva todo o texto relevante:\n\n${buffer.toString('utf-8')}` }
                ] : [
                    { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
                    { text: "Transcreva todo o texto deste documento PDF de forma fiel. Se houver tabelas, tente manter a estrutura lógica." }
                ]
            }
        ],
        thinkingConfig: {
            includeThoughts: true,
            thinkingLevel: 'HIGH'
        },
        generationConfig: {
            temperature: 0,
            mediaResolution: 'MEDIA_RESOLUTION_HIGH'
        }
    };

    const response = await model.generateContent(request);
    return response.response.candidates[0].content.parts[0].text;
}

/**
 * Função legado/opcional para resumo de despachos.
 * Mantida para evitar quebra de contratos de importação no index.js
 */
export async function summarizeDespachos(processoInfo, documentos) {
    console.log(`[AI] Gerando resumo (Gemini 3 REST) para ${documentos.length} despachos...`);

    const context = `
    Processo: ${processoInfo.protocolo}
    Objeto: ${processoInfo.assunto || 'Não informado'}
    Unidade Atual: ${processoInfo.unidadeAtual || 'Não informado'}
    `;

    const despachosMarkdown = documentos.map(d => `
    --- DESPACHO (${d.data} - ${d.unidadeOrigem}) ---
    ${d.texto}
    `).join('\n');

    const prompt = `
    Você é um assistente especializado em gestão pública.
    Com base nas informações do processo abaixo e nos textos dos despachos, gere:
    1. Um "Resumo Flash" de uma frase curta e impactante sobre o status atual.
    2. Um "Relatório Detalhado" em markdown, descrevendo o histórico e os próximos passos sugeridos.

    INFO PROCESSO:
    ${context}

    DESPACHOS:
    ${despachosMarkdown}
    `;

    try {
        // Setup Auth para REST
        const auth = new GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });
        const authToken = await auth.getAccessToken();

        // URL Global para Gemini 3 (v1beta1 para experimental features)
        const url = `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/global/publishers/google/models/gemini-3-flash-preview:streamGenerateContent`;

        const restResponse = await axios.post(url, {
            contents: {
                role: 'user',
                parts: [{ text: prompt }]
            },
            // Sintaxe exata do Manual Gemini 3
            generation_config: {
                temperature: 0.1,
                max_output_tokens: 8192
            }
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Como usamos streamGenerateContent, tratamos o array de retorno
        // (Simplificado para pegar o primeiro bloco de texto válido)
        let fullText = "";
        if (Array.isArray(restResponse.data)) {
            fullText = restResponse.data
                .map(chunk => chunk.candidates?.[0]?.content?.parts?.[0]?.text || "")
                .join("");
        } else {
            fullText = restResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        const flashmatch = fullText.match(/Resumo Flash[:\*]*\s*([^\n\.]+)/i);
        const flash = flashmatch ? flashmatch[1].trim() : "Análise concluída com sucesso.";

        return {
            resumoFlash: flash,
            relatorioDetalhado: fullText
        };
    } catch (error) {
        console.error('[AI SUMMARY REST ERROR]', error.response?.data || error.message);
        throw error;
    }
}

/**
 * INTERFACE DE CHAT (RAG - Retrieval Augmented Generation)
 * Busca trechos relevantes no Data Lake e responde usando Gemini 3.
 */
export async function chatWithAI(processId, userQuery, history = []) {
    console.log(`[AI-CHAT] 💬 Pergunta recebida para o processo ${processId}: ${userQuery}`);
    const db = admin.firestore();

    try {
        // 1. GERA EMBEDDING DA PERGUNTA (via REST)
        const auth = new GoogleAuth({
            keyFile: serviceAccountPath,
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });
        const authToken = await auth.getAccessToken();

        const embedUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/text-embedding-004:predict`;
        const embedResponse = await axios.post(embedUrl, {
            instances: [{ content: userQuery }]
        }, {
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' }
        });

        const queryVector = embedResponse.data.predictions[0].embeddings.values;

        // 2. BUSCA SEMÂNTICA NO FIRESTORE (Vector Search)
        // Buscamos em todos os chunks que pertencem a este processo
        console.log(`[AI-CHAT] 🔍 Buscando fragmentos relevantes no Firestore...`);
        const chunksSnapshot = await db.collectionGroup('chunks')
            .where('processoId', '==', processId)
            .findNearest({
                vectorField: 'embedding',
                queryVector: queryVector,
                distanceMeasure: 'COSINE',
                limit: 8
            })
            .get();

        const contextChunks = chunksSnapshot.docs.map(doc => {
            const data = doc.data();
            // Tenta formatar o ID do arquivo para ficar legível (Ex: "1-OFICIO" -> "Documento #1 (OFICIO)")
            let docLabel = data.fileId;
            if (/^\d+-/.test(data.fileId)) {
                const parts = data.fileId.split('-');
                const order = parts[0];
                const type = parts.slice(1).join(' ').replace(/_/g, ' ');
                docLabel = `Documento #${order} (${type})`;
            }

            return `[${docLabel}] Conteúdo: ${data.text}`;
        });

        if (contextChunks.length === 0) {
            console.warn(`[AI-CHAT] ⚠️ Nenhum contexto encontrado para este processo.`);
        }

        // 3. MONTAGEM DO PROMPT PARA O GEMINI 3
        const contextText = contextChunks.join('\n\n');
        const systemPrompt = `
# PERSONA
Você é o "Consultor de Processos", um assistente de IA especializado em Direito Administrativo e Licitações Públicas. Sua função é auxiliar gestores a extrair informações precisas de processos complexos.

# INSTRUÇÕES DE RESPOSTA
1. **Fundamentação Obrigatória:** Responda EXCLUSIVAMENTE com base no CONTEXTO fornecido abaixo. Ignore seu conhecimento externo, a menos que o documento cite explicitamente uma lei.
2. **Estrutura da Resposta (Prioridade Executiva):**
   - Inicie com uma **Resposta Direta** e objetiva em negrito.
   - Em seguida, apresente o **Detalhamento** ou a lista de requisitos usando bullet points.
   - Se houver divergência entre documentos (ex: um Edital original e uma Retificação posterior), aponte a discrepância explicitamente.
3. **Citação de Fontes:** Toda afirmação factual (datas, valores, prazos, multas) deve vir acompanhada da referência entre colchetes com o formato "Documento {NÚMERO} ({TIPO})". Exemplo: "O prazo é de 5 dias [Documento 1 (EDITAL)]".
4. **Tratamento de Ausências:** Se a informação não estiver no contexto, NÃO TENTE INFERIR. Responda: "A informação solicitada não consta nos trechos recuperados para esta análise."

# CONTEXTO DOS DOCUMENTOS (RAG):
${contextText}
`;

        // 4. CHAMADA AO GEMINI 3 FLASH PREVIEW (REST API)
        // Usamos v1beta1 para garantir suporte a funcionalidades experimentais como thinking_config
        const chatUrl = `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/global/publishers/google/models/gemini-3-flash-preview:streamGenerateContent`;

        // Converte o histórico para o formato do Gemini
        const contents = history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        // Adiciona a pergunta atual com o prompt de sistema injetado no contexto
        contents.push({
            role: 'user',
            parts: [{ text: `CONTEXTO DO PROCESSO:\n${contextText}\n\nPERGUNTA: ${userQuery}` }]
        });

        const restResponse = await axios.post(chatUrl, {
            contents: contents,
            system_instruction: {
                parts: [{ text: systemPrompt }]
            },
            // Re-habilitando thinking_config com v1beta1
            generation_config: {
                temperature: 0,
                max_output_tokens: 4000
            }
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        let fullResponse = "";
        if (Array.isArray(restResponse.data)) {
            fullResponse = restResponse.data
                .map(chunk => chunk.candidates?.[0]?.content?.parts?.[0]?.text || "")
                .join("");
        } else {
            fullResponse = restResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }

        // 5. SALVAR NO HISTÓRICO (Opcional - pode ser feito no index.js ou aqui)
        await db.collection('contratacoes').doc(processId).collection('chat_history').add({
            role: 'assistant',
            content: fullResponse,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            contextCount: contextChunks.length
        });

        const sources = chunksSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                fileId: data.fileId,
                preview: data.text.slice(0, 150) + '...'
            };
        });

        // Deduplicate sources by fileId
        const uniqueSources = [...new Map(sources.map(item => [item.fileId, item])).values()];

        return {
            answer: fullResponse,
            citations: contextChunks.length,
            sources: uniqueSources
        };

    } catch (error) {
        console.error(`[AI-CHAT ERROR]`, error.response?.data || error.message);
        throw error;
    }
}
