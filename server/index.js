
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis do arquivo .env.local na raiz do projeto
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');

import { scrapeSIPACProcess, scrapeSIPACDocumentContent, downloadSIPACDocument } from './sipacService.js';
import { summarizeDespachos, processFileForDataLake, chatWithAI } from './aiService.js';
import { searchKnowledgeBase } from './searchService.js';
import admin from 'firebase-admin';



// Initialize Firebase Admin
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'diretoria-adm-bsf.firebasestorage.app'
  });
} else {
  try {
    admin.initializeApp({
      storageBucket: 'diretoria-adm-bsf.firebasestorage.app'
    });
  } catch (e) {
    console.warn('[FIREBASE] Could not initialize Firebase Admin.', e.message);
  }
}

const db_admin = admin.apps.length ? admin.firestore() : null;
const bucket = admin.apps.length ? admin.storage().bucket() : null;

/**
 * Função para sincronizar documentos no Data Lake (Storage + Firestore)
 */
async function syncProcessDocuments(protocol, processId, documentos) {
  if (!db_admin || !bucket) {
    console.warn(`[DATA LAKE] Firebase not initialized. Skipping document sync for ${protocol}`);
    return;
  }

  console.log(`[DATA LAKE] Iniciando sincronização de ${documentos.length} documentos para ${protocol}...`);

  for (const doc of documentos) {
    const cleanProtocol = protocol.replace(/[^\d]/g, '');
    if (!doc.url) continue;

    try {
      // 1. CHECAGEM DE ECONOMIA: Verifica se já temos ESSE documento (Ordem + Tipo) salvo
      if (db_admin) {
        const existingQuery = await db_admin.collection('contratacoes')
          .doc(cleanProtocol)
          .collection('arquivos')
          .where('sipacMetadata.ordem', '==', doc.ordem)
          .where('sipacMetadata.tipo', '==', doc.tipo)
          .limit(1)
          .get();

        if (!existingQuery.empty) {
          const existingDoc = existingQuery.docs[0].data();
          if (existingDoc.status !== 'ERROR') {
            console.log(`[DATA LAKE] ⏩ Pulando documento já existente: #${doc.ordem} - ${doc.tipo}`);
            continue; // Pula apenas se NÃO estiver em erro
          }
          console.log(`[DATA LAKE] 🔄 Retentando documento que falhou anteriormente: #${doc.ordem} - ${doc.tipo}`);
        }
      }

      // 2. Download do documento (Somente se for novo)
      const { buffer, contentType, fileName, fileHash, sizeBytes } = await downloadSIPACDocument(doc.url);

      // 3. Controle de Duplicidade (Hash)
      const fileQuery = await db_admin.collection('contratacoes')
        .doc(cleanProtocol)
        .collection('arquivos')
        .where('fileHash', '==', fileHash)
        .get();

      if (!fileQuery.empty) {
        const existingDoc = fileQuery.docs[0];
        const existingData = existingDoc.data();

        if (existingData.status !== 'ERROR') {
          console.log(`[DATA LAKE] Documento ${fileName} já existe (Hash match). Atualizando 'lastSeen'.`);
          await existingDoc.ref.update({
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
          });
          continue;
        }
        console.log(`[DATA LAKE] 🔄 Retentando via Hash documento que falhou anteriormente: ${fileName}`);
      }

      // 4. Upload para Cloud Storage
      const storagePath = `contratacoes/${cleanProtocol}/documentos/${fileName}`;

      // Forçamos o bucket correto com o domínio exibido no seu console
      const targetBucket = admin.storage().bucket('diretoria-adm-bsf.firebasestorage.app');
      const file = targetBucket.file(storagePath);


      await file.save(buffer, {
        metadata: {
          contentType: contentType,
          metadata: {
            originalName: fileName,
            fileHash: fileHash,
            protocol: protocol
          }
        }
      });

      // 4. Registrar metadados no Firestore
      const downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      await db_admin.collection('contratacoes')
        .doc(processId)
      // 5. Salva referências no Firestore
      if (db_admin) {
        await db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(fileHash).set({
          fileName,
          storagePath,
          downloadUrl: `https://storage.googleapis.com/diretoria-adm-bsf.firebasestorage.app/${storagePath}`,
          sizeBytes,
          fileHash,
          contentType,
          sipacMetadata: {
            ordem: doc.ordem,
            tipo: doc.tipo,
            data: doc.data,
            unidadeOrigem: doc.unidadeOrigem
          },
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSeen: admin.firestore.FieldValue.serverTimestamp(),
          status: "PENDING",
        });
      }

      console.log(`[DATA LAKE] ✅ Documento catalogado: ${fileName}`);

      // 6. DISPARA O PROCESSAMENTO DE IA (BACKGROUND)
      // Não usamos await para não travar a sincronização dos outros arquivos
      processFileForDataLake(storagePath, cleanProtocol, fileHash)
        .catch(e => console.error(`[AI-LAKE TRIGGER ERROR] ${fileName}:`, e.message));

      // Adiciona um pequeno delay (1.5 segundos) para não ser banido pelo firewall do SIPAC por excesso de requisições

      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (err) {
      console.error(`[DATA LAKE] ❌ Erro ao processar documento do processo ${protocol}:`, err.message);

      // REGISTRA O ERRO NO FIRESTORE PARA O FRONT-END SABER
      if (db_admin) {
        try {
          await db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(`${doc.ordem}-${doc.tipo.replace(/\//g, '-')}`).set({
            status: 'ERROR',
            errorMessage: err.message,
            sipacMetadata: {
              ordem: doc.ordem,
              tipo: doc.tipo,
              data: doc.data,
              unidadeOrigem: doc.unidadeOrigem
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error(`[DATA LAKE] Falha ao registrar log de erro:`, e.message);
        }
      }
    }
  }

}

// Prevenção de crash global
process.on('uncaughtException', (err) => {
  console.error('[FATAL ERROR] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint para metadados
app.get('/api/pncp/pca/:cnpj/:ano/meta', async (req, res) => {
  const { cnpj, ano } = req.params;
  const { sequencial = 12 } = req.query;
  try {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pca/${ano}/${sequencial}`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para itens
app.get('/api/pncp/pca/:cnpj/:ano', async (req, res) => {
  const { cnpj, ano } = req.params;
  const { pagina = 1, tamanhoPagina = 100, sequencial = 12 } = req.query;
  try {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pca/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para SIPAC Scraping
app.get('/api/sipac/processo', async (req, res) => {
  const protocolo = req.query.protocolo;
  if (!protocolo) return res.status(400).json({ error: 'Protocolo é obrigatório' });

  let formattedProtocol = protocolo;
  if (protocolo.replace(/[^\d]/g, '').length === 17) {
    const p = protocolo.replace(/[^\d]/g, '');
    formattedProtocol = `${p.slice(0, 5)}.${p.slice(5, 11)}/${p.slice(11, 15)}-${p.slice(15)}`;
  }

  console.log(`[SIPAC] Buscando processo: ${formattedProtocol}`);
  try {
    const data = await scrapeSIPACProcess(formattedProtocol);

    const processId = formattedProtocol.replace(/[^\d]/g, '');
    if (data.documentos && data.documentos.length > 0) {
      syncProcessDocuments(formattedProtocol, processId, data.documentos).catch(err => {
        console.error(`[BACKGROUND SYNC ERROR] ${formattedProtocol}:`, err);
      });
    }
    res.json(data);
  } catch (error) {
    console.error(`[SIPAC ERROR]`, error);
    res.status(500).json({ error: error.message });
  }
});

// app.post('/api/sipac/processo/resumo-ai', ... ) DESATIVADO


// Endpoint para gerar URL segura (Signed URL) para visualização
app.get('/api/lake/document/url', async (req, res) => {
  const { path: storagePath } = req.query;
  if (!storagePath) return res.status(400).json({ error: 'Caminho do arquivo é obrigatório' });

  try {
    const targetBucket = admin.storage().bucket('diretoria-adm-bsf.firebasestorage.app');
    const file = targetBucket.file(storagePath);

    // Gera uma URL V4 que é o padrão mais moderno e seguro
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    res.json({ url });
  } catch (error) {
    console.error('[SIGNED URL ERROR]', error);
    res.status(500).json({ error: 'Não foi possível gerar o link de visualização' });
  }
});

// Endpoint para gerar resumo com IA
app.post('/api/sipac/processo/resumo-ai', async (req, res) => {
  const { processoInfo, documentos } = req.body;
  if (!processoInfo || !documentos) return res.status(400).json({ error: 'Dados incompletos' });

  const despachos = documentos.filter(d => d.tipo.toUpperCase().includes('DESPACHO') && d.url);
  if (despachos.length === 0) {
    return res.json({
      resumoFlash: "Consulte os detalhes para trâmites manuais.",
      relatorioDetalhado: "Não foram encontrados despachos digitais."
    });
  }

  try {
    const despachosComTexto = [];
    for (const d of despachos) {
      try {
        const texto = await scrapeSIPACDocumentContent(d.url);
        despachosComTexto.push({ ...d, texto });
      } catch (err) {
        console.warn(`[AI] Erro no despacho ${d.ordem}:`, err.message);
      }
    }
    if (despachosComTexto.length === 0) throw new Error('Falha na extração de textos');
    const result = await summarizeDespachos(processoInfo, despachosComTexto);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de Chat inteligente (RAG)
app.post('/api/ai/chat', async (req, res) => {
  const { processId, query, history } = req.body;

  if (!processId || !query) {
    return res.status(400).json({ error: 'ProcessId e Query são obrigatórios' });
  }

  try {
    const cleanId = String(processId).replace(/[^\d]/g, '');
    const db = admin.firestore();

    // 1. Salvar pergunta do usuário no histórico
    await db.collection('contratacoes').doc(cleanId).collection('chat_history').add({
      role: 'user',
      content: query,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // 2. Chamar lógica de RAG
    const result = await chatWithAI(cleanId, query, history || []);

    res.json(result);
  } catch (error) {
    console.error(`[REST CHAT ERROR]`, error.response?.data || error.message);
    res.status(500).json({ error: 'Falha ao processar resposta da IA' });
  }
});

const CNPJ_IFES_BSF = '10838653000106';
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

async function performAutomaticSync() {
  const YEARS_MAP = { '2026': '12', '2025': '12', '2024': '15', '2023': '14', '2022': '20' };
  console.log(`[${new Date().toISOString()}] 🚀 Iniciando Sincronização PNCP...`);
  for (const [year, seq] of Object.entries(YEARS_MAP)) {
    try {
      const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ_IFES_BSF}/pca/${year}/${seq}/itens?pagina=1&tamanhoPagina=1000`;
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = response.data.data || (Array.isArray(response.data) ? response.data : []);
      if (data.length > 0) {
        if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
        const filePath = path.join(PUBLIC_DATA_DIR, `pca_${year}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ data, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[SYNC] ✅ Saved: ${year}`);
      }
    } catch (error) {
      console.error(`[SYNC] ❌ Error ${year}:`, error.message);
    }
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

setInterval(() => { }, 60000);
