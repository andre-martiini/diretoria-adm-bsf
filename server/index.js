
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import MiniSearch from 'minisearch';
import { PDFParse } from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente
dotenv.config({ path: path.join(__dirname, 'deploy.env') });
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');

import { scrapeSIPACProcess, scrapeSIPACDocumentContent, downloadSIPACDocument } from './sipacService.js';
import { analyzeProcessDFD } from './dfdService.js';
// Removed aiService imports as requested
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
// Removed storage bucket reference as we are not using it anymore

/**
 * Função para sincronizar documentos (Apenas Metadados) no Firestore
 */
const buildSipacDocumentId = (doc) => `${doc.ordem}-${String(doc.tipo || 'DOCUMENTO').replace(/[\/\\]/g, '-')}`;

const stripHtml = (html) => String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();

async function extractDocumentText(url) {
  const { buffer, contentType, fileName, fileHash, sizeBytes } = await downloadSIPACDocument(url);
  const lowerName = String(fileName || '').toLowerCase();
  const lowerType = String(contentType || '').toLowerCase();
  const isPdf = lowerType.includes('application/pdf') || lowerName.endsWith('.pdf');
  const isHtml = lowerType.includes('text/html') || lowerName.endsWith('.html') || lowerName.endsWith('.htm');

  let text = '';
  let sourceKind = 'unknown';

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText({ parsePageInfo: false });
      text = String(parsed?.text || '').replace(/\s+\n/g, '\n').trim();
      await parser.destroy();
      sourceKind = 'pdf';
    } catch (pdfErr) {
      console.warn(`[OCR] Falha ao extrair texto PDF: ${pdfErr?.message || pdfErr}`);
    }
  } else if (isHtml) {
    text = stripHtml(buffer.toString('utf8'));
    sourceKind = 'html';
  } else {
    text = stripHtml(buffer.toString('utf8'));
    sourceKind = 'text';
  }

  if (!text || text.length < 30) {
    try {
      const scraped = await scrapeSIPACDocumentContent(url);
      const fallbackText = String(scraped || '').replace(/\s+/g, ' ').trim();
      if (fallbackText.length > text.length) {
        text = fallbackText;
        sourceKind = sourceKind === 'pdf' ? 'pdf+html-fallback' : 'html-scrape';
      }
    } catch (fallbackErr) {
      console.warn(`[OCR] Fallback HTML falhou: ${fallbackErr?.message || fallbackErr}`);
    }
  }

  return {
    text,
    sourceKind,
    contentType: contentType || null,
    fileName: fileName || null,
    fileHash: fileHash || null,
    sizeBytes: Number(sizeBytes || 0)
  };
}

async function syncSingleDocumentOcr(cleanProtocol, doc) {
  if (!db_admin || !doc?.url) return;

  const docId = buildSipacDocumentId(doc);
  const docRef = db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(docId);

  try {
    const existingSnap = await docRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};

    if (existing?.ocrStatus === 'READY' && typeof existing?.ocrText === 'string' && existing.ocrText.length > 30) {
      return;
    }

    await docRef.set({
      ocrStatus: 'PROCESSING',
      ocrError: null,
      ocrUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const extracted = await extractDocumentText(doc.url);
    const ocrText = String(extracted.text || '').trim();

    await docRef.set({
      ocrStatus: ocrText.length > 0 ? 'READY' : 'ERROR',
      ocrText,
      ocrChars: ocrText.length,
      ocrSource: extracted.sourceKind,
      ocrContentType: extracted.contentType,
      ocrFileName: extracted.fileName,
      ocrFileHash: extracted.fileHash,
      ocrFileSizeBytes: extracted.sizeBytes,
      ocrError: ocrText.length > 0 ? null : 'Texto nao encontrado no documento.',
      ocrUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    await docRef.set({
      ocrStatus: 'ERROR',
      ocrError: error?.message || String(error),
      ocrUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
}

async function syncProcessDocumentsOCR(protocol, documentos) {
  if (!db_admin || !Array.isArray(documentos) || documentos.length === 0) return;

  const cleanProtocol = String(protocol || '').replace(/[^\d]/g, '');
  const validDocs = documentos.filter(d => !!d?.url);

  for (const doc of validDocs) {
    await syncSingleDocumentOcr(cleanProtocol, doc);
  }
}

async function backfillAllDocumentsOCR(maxDocs = 1000) {
  if (!db_admin) return { processed: 0 };

  let processed = 0;
  const contractsSnap = await db_admin.collection('contratacoes').get();
  for (const contractDoc of contractsSnap.docs) {
    if (processed >= maxDocs) break;
    const filesSnap = await contractDoc.ref.collection('arquivos').get();
    for (const fileDoc of filesSnap.docs) {
      if (processed >= maxDocs) break;
      const fileData = fileDoc.data();
      if (!fileData?.originalUrl) continue;

      await syncSingleDocumentOcr(contractDoc.id, {
        url: fileData.originalUrl,
        ordem: fileData?.sipacMetadata?.ordem || '0',
        tipo: fileData?.sipacMetadata?.tipo || fileDoc.id
      });
      processed += 1;
    }
  }
  return { processed };
}

async function syncProcessDocuments(protocol, processId, documentos) {
  if (!db_admin) {
    console.warn(`[DATA SYNC] Firebase not initialized. Skipping document sync for ${protocol}`);
    return;
  }

  console.log(`[DATA SYNC] Sincronizando metadados de ${documentos.length} documentos para ${protocol}...`);

  const cleanProtocol = protocol.replace(/[^\d]/g, '');

  for (const doc of documentos) {
    if (!doc.url) continue;

    try {
      const docId = buildSipacDocumentId(doc);

      await db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(docId).set({
        fileName: `Documento ${doc.ordem} - ${doc.tipo}`,
        originalUrl: doc.url, // Store the SIPAC URL
        sipacMetadata: {
          ordem: doc.ordem,
          tipo: doc.tipo,
          data: doc.data,
          unidadeOrigem: doc.unidadeOrigem
        },
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        status: "AVAILABLE", // Mark as available for client-side fetch
        ocrStatus: "PENDING",
      }, { merge: true });

      console.log(`[DATA SYNC] ✅ Metadados salvos: #${doc.ordem} - ${doc.tipo}`);

    } catch (err) {
      console.error(`[DATA SYNC] ❌ Erro ao salvar metadados do documento ${doc.ordem}:`, err.message);
    }
  }

  // OCR completo em background para todos os documentos do processo.
  syncProcessDocumentsOCR(protocol, documentos).catch((err) => {
    console.error(`[OCR SYNC ERROR] ${protocol}:`, err?.message || err);
  });
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

// Endpoint para metadados PNCP
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

// Endpoint para itens PNCP (PCA)
// Endpoint para itens PNCP (PCA) - Updated to use /pcas/ (plural) and optional sequencial
app.get('/api/pncp/pca/:cnpj/:ano', async (req, res) => {
  const { cnpj, ano } = req.params;
  const { pagina = 1, tamanhoPagina = 100, sequencial } = req.query;
  try {
    // User suggestion: GET /v1/orgaos/{cnpj}/pcas/{ano}/itens
    // We prioritize this pattern. If sequencial is provided, we might append it, 
    // but the user instruction suggests checking the year-based item list directly.

    let url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pcas/${ano}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;

    // Fallback/Legacy support: if specifically requested via some logic, we could keep the old one,
    // but the user strongly implies the current one is broken/wrong for DFDs.
    // If we need consistency with the existing sequencial logic which might be "12" for "2026":
    // The previous URL was .../pca/${ano}/${sequencial}/itens.
    // Let's try the user's recommended URL first.

    console.log(`[PNCP PROXY] Fetching items from: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error(`[PNCP PROXY ERROR] Url: ${req.url} - Msg: ${error.message}`);
    if (error.response) {
      // If the year-based endpoint fails (404), maybe we DO need the sequencial?
      if (error.response.status === 404 && sequencial) {
        console.log(`[PNCP PROXY] Retrying with sequencial...`);
        try {
          const urlSeq = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pcas/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
          const responseSeq = await axios.get(urlSeq, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            }
          });
          return res.json(responseSeq.data);
        } catch (errSeq) {
          console.error(`[PNCP PROXY RETRY ERROR]`, errSeq.message);
        }
      }
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// --- NOVOS ENDPOINTS PROXY PARA CONSULTA PÚBLICA (Resolvendo CORS/User-Agent) ---

// Proxy para listar compras (Contratações)
app.get('/api/pncp/consulta/compras', async (req, res) => {
  const { ano, pagina = 1, tamanhoPagina = 100 } = req.query;
  const CNPJ = '10838653000106'; // IFES BSF

  if (!ano) {
    return res.status(400).json({ error: 'Parametro ano e obrigatorio' });
  }

  const endpoints = [
    `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ}/compras?ano=${ano}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`,
    `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras?ano=${ano}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`
  ];

  const upstreamErrors = [];
  for (const url of endpoints) {
    try {
      console.log(`[PNCP PROXY] Buscando compras: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      return res.json(response.data);
    } catch (error) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.message;
      upstreamErrors.push({ url, status, message });
      console.warn(`[PNCP PROXY WARN] ${status} em ${url}: ${message}`);
    }
  }

  res.json({
    data: [],
    message: 'Falha temporaria ao consultar PNCP; retornando lista vazia.',
    upstreamErrors
  });
});

// Proxy para itens de uma compra específica
app.get('/api/pncp/consulta/itens', async (req, res) => {
  const { ano, sequencial, pagina = 1, tamanhoPagina = 100 } = req.query;
  const CNPJ = '10838653000106'; // IFES BSF

  if (!ano || !sequencial) return res.status(400).json({ error: 'Ano e Sequencial são obrigatórios' });

  // Endpoint de itens na API de Consulta:
  // https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
  // Se este endpoint também der 404, significa que a estrutura de itens também é diferente.
  // Testaremos este primeiro, pois a documentação sugere paridade em sub-recursos ou uso de 'contratacoes/{id}/itens'.
  // Mas como não temos o ID interno da contratação facilmente, tentaremos o caminho hierárquico se estiver disponível.
  // SE FALHAR: Vamos tentar buscar pelo ID da contratação que virá na busca anterior.
  // Por enquanto, mantemos a tentativa hierárquica na consulta, se existir. 
  // Na verdade, a API de consulta geralmente usa IDs. Vamos assumir que a rota hierárquica padrão
  // de orgaos/cnpj/compras/ano/seq/itens AINDA É VÁLIDA na consulta ou teremos que mudar a estratégia.
  //
  // CORREÇÃO: A URL pública de itens costuma ser:
  // https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao/{ano}/{sequencial}/itens?cnpjOrgao=... (Hipótese)
  // OU
  // https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens (que deu 404 antes?)
  // O erro 404 anterior foi em .../compras (lista). Talvez o item específico funcione?
  // Vamos tentar a rota `contratacoes` que parece ser a principal da v1 consulta.
  // Mas vamos manter a URL antiga neste step e observar o log, pois não tenho certeza absoluta da URL de itens.
  // Porém, para garantir, vamos usar a URL que o Swagger geralmente aponta para GET /itens.

  const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;

  console.log(`[PNCP PROXY] Buscando itens: ${url}`);
  try {
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error(`[PNCP PROXY ERROR] Itens`, error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para Análise Automática de DFD (Auto Linker)
app.post('/api/sipac/analyze-dfd', async (req, res) => {
  try {
    const processId = req.body?.processId;
    if (!processId) return res.status(400).json({ error: 'ID do processo é obrigatório' });

    const result = await analyzeProcessDFD(processId);
    res.json(result);
  } catch (error) {
    console.error('[DFD ANALYZE ERROR]', error);
    res.status(500).json({ error: error?.message || 'Falha interna na análise do DFD' });
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

// PROXY Endpoint para PDF
app.get('/api/proxy/pdf', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

  try {
    const { buffer, contentType, fileName } = await downloadSIPACDocument(url);

    res.setHeader('Content-Type', contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName || 'document.pdf'}"`);
    res.send(buffer);

  } catch (error) {
    console.error(`[PROXY ERROR]`, error);
    const message = error?.message || 'Erro desconhecido';
    if (message.includes('Could not find Chrome')) {
      return res.status(503).json({
        error: 'Navegador para scraping não encontrado no servidor',
        details: 'Instale Chrome/Edge no sistema ou execute: npm --prefix server run postinstall'
      });
    }
    res.status(500).json({ error: 'Falha ao obter documento: ' + message });
  }
});

// Endpoint para conteúdo de documento (HTML/Texto)
app.get('/api/sipac/documento/conteudo', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

  console.log(`[CONTENT ENPOINT] Request for: ${url.substring(0, 100)}...`);
  try {
    const text = await scrapeSIPACDocumentContent(url);
    if (!text) {
      console.warn(`[CONTENT ENPOINT] Scraper returned empty for: ${url.substring(0, 50)}`);
      return res.json({ text: '', error: 'Conteúdo vazio ou bloqueado' });
    }
    console.log(`[CONTENT ENPOINT] Extracted ${text.length} chars`);
    res.json({ text });
  } catch (error) {
    console.error(`[CONTENT ENPOINT ERROR] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para OCR de documento (retorna do Firestore ou gera sob demanda)
app.get('/api/sipac/documento/ocr', async (req, res) => {
  const { url, protocolo, ordem, tipo } = req.query;
  if (!url) return res.status(400).json({ error: 'URL e obrigatoria' });
  if (!db_admin) return res.status(500).json({ error: 'Firebase Admin nao inicializado' });

  const cleanProtocol = String(protocolo || '').replace(/[^\d]/g, '');
  const safeDoc = {
    url: String(url),
    ordem: String(ordem || '0'),
    tipo: String(tipo || 'DOCUMENTO')
  };
  const docId = buildSipacDocumentId(safeDoc);
  const docRef = cleanProtocol
    ? db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(docId)
    : null;

  try {
    if (docRef) {
      const snap = await docRef.get();
      const existing = snap.exists ? snap.data() : null;
      if (existing?.ocrStatus === 'READY' && typeof existing?.ocrText === 'string') {
        return res.json({
          text: existing.ocrText,
          status: existing.ocrStatus,
          chars: Number(existing.ocrChars || existing.ocrText.length || 0),
          source: existing.ocrSource || null,
          fromCache: true
        });
      }
    }

    if (docRef) {
      await syncSingleDocumentOcr(cleanProtocol, safeDoc);
      const refreshed = await docRef.get();
      const data = refreshed.exists ? refreshed.data() : null;
      return res.json({
        text: data?.ocrText || '',
        status: data?.ocrStatus || 'ERROR',
        chars: Number(data?.ocrChars || 0),
        source: data?.ocrSource || null,
        fromCache: false,
        error: data?.ocrError || null
      });
    }

    // Fallback sem protocolo: extrai e retorna, sem persistir em coleção de processo.
    const extracted = await extractDocumentText(String(url));
    return res.json({
      text: extracted.text || '',
      status: extracted.text ? 'READY' : 'ERROR',
      chars: Number((extracted.text || '').length),
      source: extracted.sourceKind,
      fromCache: false
    });
  } catch (error) {
    console.error('[OCR ENDPOINT ERROR]', error);
    return res.status(500).json({ error: error?.message || String(error) });
  }
});

// Endpoint para backfill global de OCR nos documentos já sincronizados.
app.post('/api/sipac/ocr/reindex', async (req, res) => {
  const maxDocs = Number(req.body?.maxDocs || req.query?.maxDocs || 1000);
  if (!db_admin) return res.status(500).json({ error: 'Firebase Admin nao inicializado' });

  backfillAllDocumentsOCR(maxDocs).then((result) => {
    console.log(`[OCR BACKFILL] Finalizado. Documentos processados: ${result.processed}`);
  }).catch((error) => {
    console.error('[OCR BACKFILL] Falha:', error);
  });

  return res.json({
    started: true,
    maxDocs
  });
});


const CNPJ_IFES_BSF = '10838653000106';
const PUBLIC_DATA_DIR = fs.existsSync(path.join(__dirname, 'data', 'public_data'))
  ? path.join(__dirname, 'data', 'public_data')
  : path.join(__dirname, '..', 'public', 'data');
const PROCUREMENT_DATA_DIR = fs.existsSync(path.join(__dirname, 'data', 'dados_abertos_compras'))
  ? path.join(__dirname, 'data', 'dados_abertos_compras')
  : path.join(__dirname, '..', 'dados_abertos_compras');

function readJsonFileSafely(filePath, context) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[JSON READ ERROR] ${context}: ${filePath} - ${error.message}`);
    return null;
  }
}

/**
 * Sincroniza dados de contratações (compras) do PNCP para os anos especificados
 * Salva em arquivos JSON no diretório dados_abertos_compras
 */
async function syncProcurementData() {
  const YEARS = ['2022', '2023', '2024', '2025', '2026'];
  console.log(`[${new Date().toISOString()}] 🛒 Iniciando Sincronização de Contratações PNCP...`);

  // Garante que o diretório existe
  if (!fs.existsSync(PROCUREMENT_DATA_DIR)) {
    fs.mkdirSync(PROCUREMENT_DATA_DIR, { recursive: true });
  }

  for (const year of YEARS) {
    try {
      console.log(`[PROCUREMENT SYNC] Buscando contratações de ${year}...`);

      let purchases = [];
      let fetchSuccess = false;

      // Tenta múltiplos endpoints
      const endpoints = [
        `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ_IFES_BSF}/compras?ano=${year}&pagina=1&tamanhoPagina=500`,
        `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ_IFES_BSF}/compras?ano=${year}&pagina=1&tamanhoPagina=500`
      ];

      for (const url of endpoints) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json'
            },
            timeout: 10000
          });

          purchases = response.data.data || response.data || [];
          if (purchases.length > 0) {
            fetchSuccess = true;
            console.log(`[PROCUREMENT SYNC] ✅ Endpoint funcionou: ${url.split('?')[0]}`);
            break;
          }
        } catch (endpointError) {
          // Continua tentando outros endpoints
          continue;
        }
      }

      if (purchases.length > 0) {
        // Para cada compra, buscar os itens detalhados
        console.log(`[PROCUREMENT SYNC] Encontradas ${purchases.length} contratações em ${year}. Buscando itens...`);

        for (const purchase of purchases) {
          try {
            // Buscar itens da compra
            const itemsUrl = `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ_IFES_BSF}/compras/${year}/${purchase.numeroCompra}/itens?pagina=1&tamanhoPagina=100`;
            const itemsResponse = await axios.get(itemsUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
              },
              timeout: 5000
            });

            purchase.itens = itemsResponse.data.data || [];

            // Pequeno delay para não sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (itemError) {
            console.warn(`[PROCUREMENT SYNC] ⚠️ Erro ao buscar itens da compra ${purchase.numeroCompra}:`, itemError.message);
            purchase.itens = [];
          }
        }

        // Salvar arquivo JSON
        const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
        const fileData = {
          metadata: {
            extractedAt: new Date().toISOString(),
            cnpj: CNPJ_IFES_BSF,
            year: year,
            totalPurchases: purchases.length
          },
          data: purchases
        };

        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
        console.log(`[PROCUREMENT SYNC] ✅ Salvo: contratacoes_${year}.json (${purchases.length} contratações)`);
      } else {
        // Verifica se já existe um arquivo local
        const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
        if (fs.existsSync(filePath)) {
          console.log(`[PROCUREMENT SYNC] ℹ️ Usando dados existentes para ${year} (API não retornou dados)`);
        } else {
          console.log(`[PROCUREMENT SYNC] ℹ️ Nenhuma contratação encontrada para ${year}`);
        }
      }

      // Delay entre anos para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Verifica se já existe um arquivo local
        const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
        if (fs.existsSync(filePath)) {
          console.log(`[PROCUREMENT SYNC] ℹ️ API indisponível para ${year}, mantendo dados existentes`);
        } else {
          console.log(`[PROCUREMENT SYNC] ℹ️ Nenhuma contratação publicada para ${year} (404)`);
        }
      } else if (error.response && error.response.status === 400) {
        console.error(`[PROCUREMENT SYNC] ⚠️ Requisição inválida para ${year}:`, error.response.data?.message || error.message);
      } else {
        console.error(`[PROCUREMENT SYNC] ❌ Erro ao sincronizar ${year}:`, error.message);
        if (error.response) {
          console.error(`[PROCUREMENT SYNC] Status: ${error.response.status}`);
        }
      }
    }
  }

  console.log(`[PROCUREMENT SYNC] 🎉 Sincronização de contratações concluída!`);
}

async function performAutomaticSync() {
  // Sync PCA data
  const YEARS_MAP = { '2026': '12', '2025': '12', '2024': '15', '2023': '14', '2022': '20' };
  console.log(`[${new Date().toISOString()}] 🚀 Iniciando Sincronização PNCP (PCA)...`);
  for (const [year, seq] of Object.entries(YEARS_MAP)) {
    try {
      const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ_IFES_BSF}/pca/${year}/${seq}/itens?pagina=1&tamanhoPagina=1000`;
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = response.data.data || (Array.isArray(response.data) ? response.data : []);
      if (data.length > 0) {
        if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
        const filePath = path.join(PUBLIC_DATA_DIR, `pca_${year}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ data, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[PCA SYNC] ✅ Salvo: pca_${year}.json (${data.length} itens)`);
      } else {
        console.log(`[PCA SYNC] ℹ️ Nenhum item encontrado para ${year}`);
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`[PCA SYNC] ℹ️ PCA ${year} ainda não publicado no PNCP (404)`);
      } else {
        console.error(`[PCA SYNC] ❌ Erro ao sincronizar PCA ${year}:`, error.message);
      }
    }
  }

  // Sync Procurement/Contracting data
  await syncProcurementData();
}

import { onRequest } from "firebase-functions/v2/https";

// Exporta como Cloud Function (Gen 2) com memória ajustada para Puppeteer
export const api = onRequest({
  memory: '2GiB',
  timeoutSeconds: 300,
  region: 'us-central1',
  invoker: 'public'
}, app);

// Endpoint para ler dados brutos da integração Compras.gov/PNCP (Legacy - mantido para compatibilidade)
app.get('/api/integration/procurement-data', async (req, res) => {
  try {
    const COMPRAS_GOV_PATH = path.join(PROCUREMENT_DATA_DIR, 'compras_gov_result.json');
    if (fs.existsSync(COMPRAS_GOV_PATH)) {
      const data = JSON.parse(fs.readFileSync(COMPRAS_GOV_PATH, 'utf8'));
      return res.json(data);
    }
    res.status(404).json({ error: 'Arquivo de integração não encontrado' });
  } catch (error) {
    console.error('[INTEGRATION DATA ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obter dados de contratações de um ano específico
app.get('/api/procurement/year/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);

    if (fs.existsSync(filePath)) {
      const data = readJsonFileSafely(filePath, `/api/procurement/year/${year}`);
      if (data) {
        return res.json(data);
      }
      return res.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          year,
          warning: `Arquivo local invalido para ${year}`
        },
        data: []
      });
    }

    res.status(404).json({
      error: `Dados de contratações para ${year} não encontrados`,
      message: 'Execute a sincronização primeiro usando /api/procurement/sync'
    });
  } catch (error) {
    console.error('[PROCUREMENT DATA ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obter todos os dados de contratações (todos os anos)
app.get('/api/procurement/all', async (req, res) => {
  try {
    const YEARS = ['2022', '2023', '2024', '2025', '2026'];
    const allData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        cnpj: CNPJ_IFES_BSF,
        years: YEARS,
        skippedYears: []
      },
      data: []
    };

    for (const year of YEARS) {
      const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
      if (fs.existsSync(filePath)) {
        const yearData = readJsonFileSafely(filePath, `/api/procurement/all/${year}`);
        if (yearData?.data) {
          allData.data.push(...yearData.data);
        } else {
          allData.metadata.skippedYears.push(year);
        }
      }
    }

    res.json(allData);
  } catch (error) {
    console.error('[PROCUREMENT ALL DATA ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para forçar sincronização manual
app.post('/api/procurement/sync', async (req, res) => {
  try {
    console.log('[MANUAL SYNC] Iniciando sincronização manual de contratações...');
    for (const year of YEARS) {
      const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        status[year] = {
          exists: true,
          lastUpdated: data.metadata?.extractedAt || stats.mtime,
          totalPurchases: data.metadata?.totalPurchases || 0,
          fileSize: stats.size
        };
      } else {
        status[year] = {
          exists: false,
          lastUpdated: null,
          totalPurchases: 0
        };
      }
    }

    res.json(status);
  } catch (error) {
    console.error('[PROCUREMENT STATUS ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// --- MÓDULO GOOGLE DE COMPRAS IFES ---

const CATALOGO_DOC_PATH = fs.existsSync(path.join(__dirname, 'data', 'historico_compras_ifes_completo.json'))
  ? path.join(__dirname, 'data', 'historico_compras_ifes_completo.json')
  : path.join(__dirname, '..', 'historico_compras_ifes_completo.json');

const CART_DOC_PATH = fs.existsSync(path.join(__dirname, 'data', 'carrinho_ifes_local.json'))
  ? path.join(__dirname, 'data', 'carrinho_ifes_local.json')
  : path.join(__dirname, '..', 'carrinho_ifes_local.json');

const PUBLIC_DATA_DIR_PATH = fs.existsSync(path.join(__dirname, 'data', 'public_data'))
  ? path.join(__dirname, 'data', 'public_data')
  : path.join(__dirname, '..', 'public', 'data');

const PROCUREMENT_DATA_DIR_PATH = fs.existsSync(path.join(__dirname, 'data', 'dados_abertos_compras'))
  ? path.join(__dirname, 'data', 'dados_abertos_compras')
  : path.join(__dirname, '..', 'dados_abertos_compras');

// --- IN-MEMORY CACHE FOR CATALOG & INTELLIGENT SEARCH ---
let CACHED_CATALOG = [];
let CATALOG_MAP = new Map(); // Permite busca O(1) por ID
let MINI_SEARCH = new MiniSearch({
  fields: ['descricao_busca', 'codigo_catmat_completo', 'descricao_tecnica', 'keywords'], // Campos indexados
  storeFields: ['id'], // Campos retornados na busca (usamos o ID para pegar o objeto completo no MAP)
  searchOptions: {
    boost: { descricao_busca: 2, codigo_catmat_completo: 3, keywords: 1.5 },
    fuzzy: 0.2, // Permite erros de digitação (Levenshtein distance)
    prefix: true // Permite busca por prefixo ("cade" acha "cadeira")
  }
});
let IS_CATALOG_LOADED = false;

/**
 * Loads and processes catalog items from all available sources into memory.
 * Implementa AGREGACAO INTELIGENTE: Itens com mesmo CATMAT são agrupados para estatísticas.
 */
function loadCatalogIntoMemory() {
  console.log('[CATALOG LOAD] Iniciando carregamento do catálogo com Indexação Inteligente...');
  const startTime = Date.now();
  const tempMap = new Map(); // Map temporário para agregação (Chave: CATMAT/Código Único)

  // Função auxiliar para normalizar e agregar itens
  const processAndAggregateItem = (sourceItem, sourceName, weightBoost = 0) => {
    // Normalização de campos
    let catmat = String(sourceItem.codigo_catmat || sourceItem.codigo_catmat_completo || sourceItem.codigoItem || sourceItem.codigo_item || '').trim();
    if (!catmat || catmat === 'undefined') return;

    // Padronizar ID como apenas números e hífens
    const normalizedId = catmat.replace(/\//g, '-');

    const desc = (sourceItem.descricao_resumida || sourceItem.descricao || sourceItem.descricao_busca || '').toUpperCase();
    const descTec = (sourceItem.descricao_detalhada || sourceItem.descricao_tecnica || sourceItem.descricao || '').toUpperCase();
    const price = parseFloat(sourceItem.valor_unitario || sourceItem.valorUnitario || sourceItem.valor_referencia || 0);
    const unit = (sourceItem.unidade_fornecimento || sourceItem.unidadeFornecimento || sourceItem.unidade_padrao || 'UNIDADE').toUpperCase();

    // Filtros de qualidade básica
    if (price <= 0 || unit === '-' || !desc) return;

    if (!tempMap.has(normalizedId)) {
      // Novo Item no Catálogo Mestre
      tempMap.set(normalizedId, {
        id: normalizedId,
        codigo_catmat_completo: catmat,
        familia_id: catmat.split('-')[0] || '0000',
        tipo_item: (sourceItem.tipo || sourceItem.nomeClassificacao === 'Serviço') ? 'SERVICO' : 'MATERIAL',
        descricao_busca: desc,
        descricao_tecnica: descTec,
        unidade_padrao: unit,
        valor_referencia: price,
        frequencia_uso: 1 + weightBoost,
        uasg_origem_exemplo: sourceItem.uasg_nome || sourceItem.nomeUnidade || sourceItem.unidadeOrgaoNomeUnidade || sourceName,

        // Dados estatísticos para agregação
        stats: {
          price_sum: price,
          price_count: 1,
          min_price: price,
          max_price: price,
          sources: [sourceName]
        },
        // Set de descrições para indexação rica
        all_descriptions: new Set([desc, descTec])
      });
    } else {
      // Item existente: Agregar dados
      const existing = tempMap.get(normalizedId);

      // Atualizar estatísticas de preço
      existing.stats.price_sum += price;
      existing.stats.price_count += 1;
      existing.stats.min_price = Math.min(existing.stats.min_price, price);
      existing.stats.max_price = Math.max(existing.stats.max_price, price);

      // Atualizar valor de referência (Média)
      existing.valor_referencia = existing.stats.price_sum / existing.stats.price_count;

      // Incrementar relevância
      existing.frequencia_uso += (1 + weightBoost);

      // Adicionar fonte se nova
      if (!existing.stats.sources.includes(sourceName)) {
        existing.stats.sources.push(sourceName);
      }

      // Enriquecer descrições para busca
      existing.all_descriptions.add(desc);
      existing.all_descriptions.add(descTec);

      // Se a nova descrição técnica for maior/melhor, usamos ela como principal para exibição
      if (descTec.length > existing.descricao_tecnica.length) {
        existing.descricao_tecnica = descTec;
      }
    }
  };

  // 1. Carrega Histórico Base (Peso 1)
  if (fs.existsSync(CATALOGO_DOC_PATH)) {
    try {
      const rawData = JSON.parse(fs.readFileSync(CATALOGO_DOC_PATH, 'utf8'));
      (rawData.historico || []).forEach(item => processAndAggregateItem(item, 'HISTORICO_BASE', 0));
    } catch (e) { console.error('[CATALOG LOAD] Erro histórico:', e.message); }
  }

  // 2. Carrega PCA (Peso 2 - Planejamento recente é relevante)
  if (fs.existsSync(PUBLIC_DATA_DIR_PATH)) {
    try {
      const files = fs.readdirSync(PUBLIC_DATA_DIR_PATH).filter(f => f.startsWith('pca_') && f.endsWith('.json'));
      files.forEach(file => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_DIR_PATH, file), 'utf8'));
          const year = file.match(/pca_(\d+)/)?.[1] || 'PCA';
          (content.data || []).forEach(item => processAndAggregateItem(item, `PCA_${year}`, 2));
        } catch (e) {}
      });
    } catch (e) { console.error('[CATALOG LOAD] Erro PCA:', e.message); }
  }

  // 3. Carrega Contratações Recentes (Peso 3 - Compras reais recentes são muito relevantes)
  if (fs.existsSync(PROCUREMENT_DATA_DIR_PATH)) {
      try {
          const files = fs.readdirSync(PROCUREMENT_DATA_DIR_PATH).filter(f => f.startsWith('contratacoes_') && f.endsWith('.json'));
          files.forEach(file => {
             try {
                const content = JSON.parse(fs.readFileSync(path.join(PROCUREMENT_DATA_DIR_PATH, file), 'utf8'));
                const year = file.match(/contratacoes_(\d+)/)?.[1] || 'RECENTE';
                (content.data || []).forEach(purchase => {
                    if (purchase.itens) {
                        purchase.itens.forEach(item => processAndAggregateItem(item, `COMPRA_${year}`, 3));
                    }
                });
             } catch (e) {}
          });
      } catch (e) { console.error('[CATALOG LOAD] Erro Contratações:', e.message); }
  }

  // Finalização: Prepara objetos para Cache e Indexação
  CATALOG_MAP = tempMap;
  CACHED_CATALOG = Array.from(tempMap.values()).map(item => {
    // Flatten para o frontend e cria campo keywords para o MiniSearch
    item.keywords = Array.from(item.all_descriptions).join(' ');
    delete item.all_descriptions; // Limpa memória
    return item;
  });

  // Reconstruir Índice de Busca
  MINI_SEARCH.removeAll();
  MINI_SEARCH.addAll(CACHED_CATALOG);

  IS_CATALOG_LOADED = true;
  const duration = (Date.now() - startTime) / 1000;
  console.log(`[CATALOG LOAD] Indexação concluída em ${duration}s. Itens únicos (Agrupados): ${CACHED_CATALOG.length}`);
}

// Initial load
loadCatalogIntoMemory();

/**
 * Importa e higieniza os dados do JSON para o Firestore
 */
app.post('/api/catalog/import', async (req, res) => {
  if (!db_admin) return res.status(500).json({ error: 'Firebase Admin não inicializado' });

  try {
    if (!fs.existsSync(CATALOGO_DOC_PATH)) {
      return res.status(404).json({ error: 'Arquivo histórico não encontrado para importação.' });
    }

    const rawData = JSON.parse(fs.readFileSync(CATALOGO_DOC_PATH, 'utf8'));
    const items = rawData.historico || [];

    console.log(`[CATALOG IMPORT] Iniciando processamento de ${items.length} itens...`);

    const catalogMap = new Map();

    for (const item of items) {
      // 1. Sanitização (Filtros de Qualidade)
      if (!item.valor_unitario || item.valor_unitario <= 0) continue;
      if (!item.unidade_fornecimento || item.unidade_fornecimento === "-" || item.unidade_fornecimento.trim() === "") continue;

      const catmatCompleto = item.codigo_catmat;
      const familiaId = catmatCompleto.split('-')[0];

      if (catalogMap.has(catmatCompleto)) {
        // 2. Deduplicação Inteligente (Ranking)
        const existing = catalogMap.get(catmatCompleto);
        existing.frequencia_uso += 1;
        // Média ponderada simplificada ou apenas manter a média
        existing.valor_referencia = (existing.valor_referencia + item.valor_unitario) / 2;
      } else {
        catalogMap.set(catmatCompleto, {
          codigo_catmat_completo: catmatCompleto,
          familia_id: familiaId,
          tipo_item: item.tipo || "MATERIAL",
          descricao_busca: item.descricao_resumida.toUpperCase(),
          descricao_tecnica: item.descricao_detalhada,
          unidade_padrao: item.unidade_fornecimento,
          valor_referencia: item.valor_unitario,
          frequencia_uso: 1,
          uasg_origem_exemplo: item.uasg_nome,
          data_importacao: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    console.log(`[CATALOG IMPORT] Sanitização concluída. ${catalogMap.size} itens únicos para salvar.`);

    // Batch upload para o Firestore
    const batchSize = 400;
    const itemsArray = Array.from(catalogMap.values());

    for (let i = 0; i < itemsArray.length; i += batchSize) {
      const batch = db_admin.batch();
      const chunk = itemsArray.slice(i, i + batchSize);

      chunk.forEach(item => {
        const docId = item.codigo_catmat_completo.replace(/\//g, '-');
        const docRef = db_admin.collection('catalogo_mestre').doc(docId);
        batch.set(docRef, item, { merge: true });
      });

      await batch.commit();
      console.log(`[CATALOG IMPORT] Batch ${Math.floor(i / batchSize) + 1} enviado.`);
    }

    res.json({
      success: true,
      processed: items.length,
      imported: catalogMap.size
    });

  } catch (error) {
    console.error('[CATALOG IMPORT ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Motor de Busca (Backend API) - Google de Compras
 * Implementa busca Full-Text com Fuzzy Matching e Ranking
 */
app.get('/api/catalog/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);

  const searchTerm = q.trim();
  console.log(`[CATALOG SEARCH] Buscando por: "${searchTerm}"`);

  // Garante que o índice está carregado
  if (!IS_CATALOG_LOADED) {
    console.warn('[CATALOG SEARCH] Índice não carregado. Tentando carregar agora...');
    loadCatalogIntoMemory();
  }

  try {
    // 1. Busca Exata/Fuzzy via MiniSearch
    let searchResults = MINI_SEARCH.search(searchTerm, {
      boost: { codigo_catmat_completo: 10, descricao_busca: 3, keywords: 1 },
      fuzzy: 0.25,
      prefix: true,
      combineWith: 'AND' // Tenta ser preciso primeiro
    });

    // 2. Fallback: Se não achar nada, tenta 'OR' para achar pelo menos um dos termos
    if (searchResults.length === 0) {
      console.log(`[CATALOG SEARCH] Nenhum resultado exato/AND para "${searchTerm}". Tentando fuzzy/OR...`);
      searchResults = MINI_SEARCH.search(searchTerm, {
        boost: { descricao_busca: 2 },
        fuzzy: 0.35,
        prefix: true,
        combineWith: 'OR'
      });
    }

    console.log(`[CATALOG SEARCH] Encontrados ${searchResults.length} resultados brutos para "${searchTerm}"`);

    // 3. Hidratação dos resultados (Recupera objetos completos)
    const results = searchResults
      .slice(0, 100)
      .map(hit => {
        const item = CATALOG_MAP.get(hit.id);
        if (!item) return null;
        // Retorna o item enriquecido com metadados do match
        return {
          ...item,
          _score: hit.score,
          _match: hit.match
        };
      })
      .filter(item => item !== null);

    console.log(`[CATALOG SEARCH] Retornando ${results.length} itens para o cliente.`);
    return res.json(results);
  } catch (error) {
    console.error('[CATALOG SEARCH ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Carrinho de Demandas
 */
app.post('/api/cart/add', async (req, res) => {
  const { userId, itemId, quantidade, justificativa, prioridade } = req.body;

  try {
    let itemData = null;

    // 1. Check Memory Cache first
    if (IS_CATALOG_LOADED) {
        itemData = CACHED_CATALOG.find(i => i.id === itemId);
    }

    // 2. Tenta buscar item do Firestore ou fallback local
    if (!itemData && db_admin) {
      try {
        const itemDoc = await db_admin.collection('catalogo_mestre').doc(itemId).get();
        if (itemDoc.exists) itemData = itemDoc.data();
      } catch (e) { }
    }

    // 3. Last resort: File read (Old method)
    if (!itemData && fs.existsSync(CATALOGO_DOC_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CATALOGO_DOC_PATH, 'utf8'));
      const item = raw.historico.find(h => h.codigo_catmat.replace(/\//g, '-') === itemId || h.codigo_catmat === itemId);
      if (item) {
        itemData = {
          descricao_busca: item.descricao_resumida.toUpperCase(),
          unidade_padrao: item.unidade_fornecimento,
          valor_referencia: item.valor_unitario,
          codigo_catmat_completo: item.codigo_catmat
        };
      }
    }

    if (!itemData) return res.status(404).json({ error: 'Item não encontrado no catálogo' });

    const cartItem = {
      usuario_id: userId || 'anonimo',
      item_id: itemId,
      item_detalhes: {
        descricao: itemData.descricao_busca,
        unidade: itemData.unidade_padrao,
        valor_referencia: itemData.valor_referencia,
        catmat: itemData.codigo_catmat_completo
      },
      quantidade: Number(quantidade),
      valor_total_estimado: Number(quantidade) * itemData.valor_referencia,
      justificativa_usuario: justificativa,
      prioridade: prioridade || 'MEDIA',
      status: 'RASCUNHO',
      createdAt: new Date().toISOString()
    };

    // Tenta salvar no Firestore se disponível
    if (db_admin) {
      try {
        const docRef = await db_admin.collection('carrinho_demanda').add({
          ...cartItem,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.json({ success: true, cartId: docRef.id });
      } catch (e) {
        console.warn('[CART] Erro ao salvar no Firestore, usando fallback local.');
      }
    }

    // Fallback Local
    let cart = [];
    if (fs.existsSync(CART_DOC_PATH)) {
      cart = JSON.parse(fs.readFileSync(CART_DOC_PATH, 'utf8'));
    }
    const newId = `local-${Date.now()}`;
    cart.unshift({ id: newId, ...cartItem });
    fs.writeFileSync(CART_DOC_PATH, JSON.stringify(cart, null, 2));

    res.json({ success: true, cartId: newId });

  } catch (error) {
    console.error('[CART ADD ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cart', async (req, res) => {
  try {
    // Tenta Firestore
    if (db_admin) {
      try {
        const snapshot = await db_admin.collection('carrinho_demanda')
          .orderBy('createdAt', 'desc')
          .get();
        const items = [];
        snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
        if (items.length > 0) return res.json(items);
      } catch (e) {
        console.warn('[CART] Firestore indisponível para consulta do carrinho.');
      }
    }

    // Fallback Local
    if (fs.existsSync(CART_DOC_PATH)) {
      const cart = JSON.parse(fs.readFileSync(CART_DOC_PATH, 'utf8'));
      return res.json(cart);
    }

    res.json([]);
  } catch (error) {
    console.error('[CART GET ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/cart/:id', async (req, res) => {
  const { id } = req.params;
  try {
    if (db_admin && !id.startsWith('local-')) {
      try {
        await db_admin.collection('carrinho_demanda').doc(id).delete();
        return res.json({ success: true });
      } catch (e) { }
    }

    // Fallback/Local Delete
    if (fs.existsSync(CART_DOC_PATH)) {
      let cart = JSON.parse(fs.readFileSync(CART_DOC_PATH, 'utf8'));
      cart = cart.filter(item => item.id !== id);
      fs.writeFileSync(CART_DOC_PATH, JSON.stringify(cart, null, 2));
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Executa servidor local apenas se NÃO estivermos no ambiente Cloud Functions
if (!process.env.FUNCTION_TARGET && !process.env.FIREBASE_CONFIG) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

    // Executa sincronização inicial após 5 segundos (dá tempo do servidor iniciar completamente)
    setTimeout(() => {
      console.log('[AUTO SYNC] Iniciando sincronização automática...');
      performAutomaticSync().catch(err => {
        console.error('[AUTO SYNC ERROR]', err);
      });
    }, 5000);

    // Sincronização periódica a cada 6 horas (21600000 ms)
    setInterval(() => {
      console.log('[PERIODIC SYNC] Executando sincronização periódica...');
      performAutomaticSync().catch(err => {
        console.error('[PERIODIC SYNC ERROR]', err);
      });
    }, 21600000); // 6 horas
  });
}

setInterval(() => { }, 60000);

