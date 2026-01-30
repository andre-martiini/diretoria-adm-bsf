import { VertexAI } from '@google-cloud/vertexai';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Configuração Vertex AI
const project = process.env.PROJECT_ID || 'diretoria-adm-bsf';
const location = 'global';
const apiEndpoint = 'aiplatform.googleapis.com';
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');
console.log(`[SEARCH-AUTH] Verificando chave em: ${serviceAccountPath}`);
if (fs.existsSync(serviceAccountPath)) {
    console.log(`[SEARCH-AUTH] ✅ Arquivo de credenciais encontrado.`);
} else {
    console.warn(`[SEARCH-AUTH] ⚠️ Arquivo de credenciais NÃO encontrado.`);
}

const vertexAI = new VertexAI({
    project,
    location,
    apiEndpoint,
    googleAuthOptions: fs.existsSync(serviceAccountPath) ? { keyFilename: serviceAccountPath } : undefined
});


/**
 * Realiza uma busca semântica na base de conhecimento.
 * @param {string} query A pergunta do usuário.
 * @param {string} processId (Opcional) Filtrar por um processo específico.
 */
export async function searchKnowledgeBase(query, processId = null) {
    const db = admin.firestore();
    const generativeModel = vertexAI.preview.getGenerativeModel({ model: 'text-embedding-004' });

    console.log(`[AI-SEARCH] 🔍 Buscando por: "${query}"...`);

    // 1. Converter a pergunta em vetor
    const result = await generativeModel.embedContent({ content: { role: 'user', parts: [{ text: query }] } });
    const queryVector = result.embeddings[0].values;

    // 2. Buscar candidatos
    // Nota: Em produção com milhões de registros, usaríamos Vector Index.
    // Para < 10k chunks, busca em memória/query é viável e MUITO mais simples de manter.

    let chunksRef = db.collectionGroup('chunks');
    if (processId) {
        // Se for busca em um processo específico, filtramos antes
        // Nota: CollectionGroup queries requerem índice se usar filtro.
        // Vamos buscar na coleção específica do processo para evitar necessidade de índice global complexo agora.
        chunksRef = db.collection('contratacoes').doc(processId).collection('arquivos');
        // A arquitetura atual salva chunks dentro de arquivos. 
        // Para buscar em TODO o processo, teríamos que iterar arquivos.
        // Vamos manter a busca GLOBAL por enquanto, que é mais poderosa.
    }

    // Buscando os últimos 500 chunks para comparar (limite de segurança)
    // Numa v2, implementaremos Firestore Vector Search nativo
    const snapshot = await db.collectionGroup('chunks').limit(500).get();

    const candidates = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        // data.embedding é um objeto VectorValue do Firestore. Precisamos do array.
        const vector = data.embedding.toArray();

        const similarity = cosineSimilarity(queryVector, vector);

        if (similarity > 0.6) { // Filtro de relevância mínima
            candidates.push({
                id: doc.id,
                text: data.text,
                similarity: similarity,
                metadata: {
                    page: data.pageNumber,
                    fileId: data.fileId,
                    processoId: data.processoId
                }
            });
        }
    });

    // Ordenar por similaridade
    candidates.sort((a, b) => b.similarity - a.similarity);

    return candidates.slice(0, 5); // Retorna Top 5
}

// Função matemática simples para similaridade de cosseno
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
