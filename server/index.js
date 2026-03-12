
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import MiniSearch from 'minisearch';
import { PDFParse } from 'pdf-parse';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import archiver from 'archiver';
import { PassThrough } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variÃ¡veis de ambiente
dotenv.config({ path: path.join(__dirname, 'deploy.env') });
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');

import { scrapeSIPACProcess, scrapeSIPACDocumentContent, downloadSIPACDocument } from './sipacService.js';
import { analyzeProcessDFD } from './dfdService.js';
import { MANUAL_GOV_CONTRACTS } from './data/dados_abertos_compras/manualGovContracts.js';
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

const turndownService = new TurndownService({ headingStyle: 'atx' });
turndownService.use(gfm);

/**
 * FunÃ§Ã£o para sincronizar documentos (Apenas Metadados) no Firestore
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
    // Usar Turndown para preservar estrutura (tabelas, listas) em Markdown
    try {
      const htmlContent = buffer.toString('utf8');
      text = turndownService.turndown(htmlContent);
      sourceKind = 'html-markdown';
    } catch (tdError) {
      console.warn(`[OCR] Falha no Turndown, usando stripHtml: ${tdError.message}`);
      text = stripHtml(buffer.toString('utf8'));
      sourceKind = 'html-fallback';
    }
  } else {
    // Tenta converter qualquer texto plano também, se possível, ou mantém stripHtml para segurança
    text = stripHtml(buffer.toString('utf8'));
    sourceKind = 'text';
  }

  if (!text || text.length < 30) {
    try {
      const scraped = await scrapeSIPACDocumentContent(url);
      // Se o scraped for HTML, idealmente deveríamos passar pelo Turndown também,
      // mas o scrapeSIPACDocumentContent geralmente retorna texto já limpo ou HTML parcial.
      // Vamos assumir texto limpo por enquanto ou aplicar turndown se parecer HTML.
      let fallbackText = String(scraped || '');
      if (fallbackText.includes('<') && fallbackText.includes('>')) {
         fallbackText = turndownService.turndown(fallbackText);
      } else {
         fallbackText = fallbackText.replace(/\s+/g, ' ').trim();
      }

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

      console.log(`[DATA SYNC] âœ… Metadados salvos: #${doc.ordem} - ${doc.tipo}`);

    } catch (err) {
      console.error(`[DATA SYNC] âŒ Erro ao salvar metadados do documento ${doc.ordem}:`, err.message);
    }
  }

  // OCR completo em background para todos os documentos do processo.
  syncProcessDocumentsOCR(protocol, documentos).catch((err) => {
    console.error(`[OCR SYNC ERROR] ${protocol}:`, err?.message || err);
  });
}

// PrevenÃ§Ã£o de crash global
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

// --- NOVOS ENDPOINTS PROXY PARA CONSULTA PÃšBLICA (Resolvendo CORS/User-Agent) ---

// Proxy para listar compras (ContrataÃ§Ãµes)
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

// Proxy para itens de uma compra especÃ­fica
app.get('/api/pncp/consulta/itens', async (req, res) => {
  const { ano, sequencial, pagina = 1, tamanhoPagina = 100 } = req.query;
  const CNPJ = '10838653000106'; // IFES BSF

  if (!ano || !sequencial) return res.status(400).json({ error: 'Ano e Sequencial sÃ£o obrigatÃ³rios' });

  // Endpoint de itens na API de Consulta:
  // https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
  // Se este endpoint tambÃ©m der 404, significa que a estrutura de itens tambÃ©m Ã© diferente.
  // Testaremos este primeiro, pois a documentaÃ§Ã£o sugere paridade em sub-recursos ou uso de 'contratacoes/{id}/itens'.
  // Mas como nÃ£o temos o ID interno da contrataÃ§Ã£o facilmente, tentaremos o caminho hierÃ¡rquico se estiver disponÃ­vel.
  // SE FALHAR: Vamos tentar buscar pelo ID da contrataÃ§Ã£o que virÃ¡ na busca anterior.
  // Por enquanto, mantemos a tentativa hierÃ¡rquica na consulta, se existir. 
  // Na verdade, a API de consulta geralmente usa IDs. Vamos assumir que a rota hierÃ¡rquica padrÃ£o
  // de orgaos/cnpj/compras/ano/seq/itens AINDA Ã‰ VÃLIDA na consulta ou teremos que mudar a estratÃ©gia.
  //
  // CORREÃ‡ÃƒO: A URL pÃºblica de itens costuma ser:
  // https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao/{ano}/{sequencial}/itens?cnpjOrgao=... (HipÃ³tese)
  // OU
  // https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens (que deu 404 antes?)
  // O erro 404 anterior foi em .../compras (lista). Talvez o item especÃ­fico funcione?
  // Vamos tentar a rota `contratacoes` que parece ser a principal da v1 consulta.
  // Mas vamos manter a URL antiga neste step e observar o log, pois nÃ£o tenho certeza absoluta da URL de itens.
  // PorÃ©m, para garantir, vamos usar a URL que o Swagger geralmente aponta para GET /itens.

  const endpoints = [
    `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`,
    `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`
  ];

  const upstreamErrors = [];
  for (const url of endpoints) {
    try {
      console.log(`[PNCP PROXY] Buscando itens: ${url}`);
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

  return res.json({
    data: [],
    message: 'Falha temporaria ao consultar itens no PNCP; retornando lista vazia.',
    upstreamErrors
  });
});

// Endpoint para AnÃ¡lise AutomÃ¡tica de DFD (Auto Linker)
app.post('/api/sipac/analyze-dfd', async (req, res) => {
  try {
    const processId = req.body?.processId;
    if (!processId) return res.status(400).json({ error: 'ID do processo Ã© obrigatÃ³rio' });

    const result = await analyzeProcessDFD(processId);
    res.json(result);
  } catch (error) {
    console.error('[DFD ANALYZE ERROR]', error);
    res.status(500).json({ error: error?.message || 'Falha interna na anÃ¡lise do DFD' });
  }
});

// Endpoint para SIPAC Scraping
app.get('/api/sipac/processo', async (req, res) => {
  const protocolo = req.query.protocolo;
  const summaryOnly = String(req.query.summaryOnly || '').toLowerCase() === 'true' || String(req.query.summaryOnly || '') === '1';
  if (!protocolo) return res.status(400).json({ error: 'Protocolo Ã© obrigatÃ³rio' });

  let formattedProtocol = protocolo;
  if (protocolo.replace(/[^\d]/g, '').length === 17) {
    const p = protocolo.replace(/[^\d]/g, '');
    formattedProtocol = `${p.slice(0, 5)}.${p.slice(5, 11)}/${p.slice(11, 15)}-${p.slice(15)}`;
  }

  console.log(`[SIPAC] Buscando processo: ${formattedProtocol}`);
  try {
    const data = await scrapeSIPACProcess(formattedProtocol);
    const payload = summaryOnly ? buildSipacSummaryPayload(data) : { ...data, summaryOnly: false };

    const processId = formattedProtocol.replace(/[^\d]/g, '');
    if (!summaryOnly && data.documentos && data.documentos.length > 0) {
      syncProcessDocuments(formattedProtocol, processId, data.documentos).catch(err => {
        console.error(`[BACKGROUND SYNC ERROR] ${formattedProtocol}:`, err);
      });
    }
    res.json(payload);
  } catch (error) {
    console.error(`[SIPAC ERROR]`, error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para Exportar Dossiê (ZIP com Markdown + YAML) para Gemini
app.post('/api/sipac/processo/exportar-gemini', async (req, res) => {
  const { protocolo, documentos } = req.body;

  if (!documentos || !Array.isArray(documentos) || documentos.length === 0) {
    return res.status(400).json({ error: 'Nenhum documento fornecido.' });
  }

  const cleanProtocol = String(protocolo || 'processo_sem_numero').replace(/[^\w\d]/g, '_');
  const filename = `Dossie_${cleanProtocol}.zip`;

  // Configurar headers para download do ZIP
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', {
    zlib: { level: 9 } // Nível máximo de compressão
  });

  // Pipe do archive para a resposta
  archive.pipe(res);

  // Tratamento de erro do archive
  archive.on('error', (err) => {
    console.error('[EXPORT ZIP ERROR]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  });

  // Aviso de finalização (opcional)
  archive.on('end', () => {
    console.log(`[EXPORT ZIP] Arquivo ${filename} enviado com sucesso.`);
  });

  // Consolidar em 2 arquivos no ZIP:
  // 1) dossie_consolidado.md (conteudo completo de todos os docs)
  // 2) manifesto_dossie.json (metadados e status de extracao)
  const dossierStream = new PassThrough();
  archive.append(dossierStream, { name: 'dossie_consolidado.md' });

  const manifest = {
    processo: String(protocolo || ''),
    geradoEm: new Date().toISOString(),
    totalDocumentosInformados: documentos.length,
    documentosComConteudo: 0,
    documentosComErro: 0,
    documentos: []
  };

  dossierStream.write(`# Dossie Consolidado do Processo ${String(protocolo || '')}\n\n`);
  dossierStream.write(`Gerado em: ${manifest.geradoEm}\n\n`);
  dossierStream.write(`Total de documentos informados: ${documentos.length}\n\n`);
  dossierStream.write(`Este arquivo consolida o conteudo de todos os documentos em um unico Markdown.\n\n`);

  for (const doc of documentos) {
    const safeOrdem = String(doc?.ordem || '00').padStart(2, '0');
    const tipo = String(doc?.tipo || 'DOCUMENTO');
    const data = String(doc?.data || '');
    const origem = String(doc?.unidadeOrigem || '');
    const url = String(doc?.url || '');

    dossierStream.write(`---\n`);
    dossierStream.write(`## Documento ${safeOrdem} - ${tipo}\n\n`);
    dossierStream.write(`- Ordem: ${String(doc?.ordem || '')}\n`);
    dossierStream.write(`- Tipo: ${tipo}\n`);
    dossierStream.write(`- Data: ${data}\n`);
    dossierStream.write(`- Unidade de origem: ${origem}\n`);
    dossierStream.write(`- URL: ${url || '(nao informada)'}\n`);

    if (!url) {
      manifest.documentosComErro += 1;
      manifest.documentos.push({
        ordem: String(doc?.ordem || ''),
        tipo,
        data,
        unidadeOrigem: origem,
        url: '',
        status: 'ERRO',
        erro: 'Documento sem URL para extracao.'
      });
      dossierStream.write(`- Status: ERRO\n\n`);
      dossierStream.write(`> Erro ao extrair: Documento sem URL para extracao.\n\n`);
      continue;
    }

    try {
      console.log(`[EXPORT ZIP] Processando doc ${safeOrdem} - ${tipo}`);
      const extraction = await extractDocumentText(url);
      const markdownContent = String(extraction.text || '(Conteudo vazio ou nao extraido)');

      manifest.documentosComConteudo += 1;
      manifest.documentos.push({
        ordem: String(doc?.ordem || ''),
        tipo,
        data,
        unidadeOrigem: origem,
        url,
        status: 'OK',
        fonteExtracao: extraction.sourceKind,
        contentType: extraction.contentType || '',
        fileName: extraction.fileName || '',
        sizeBytes: Number(extraction.sizeBytes || 0),
        fileHash: extraction.fileHash || '',
        charsExtraidos: markdownContent.length
      });

      dossierStream.write(`- Status: OK\n`);
      dossierStream.write(`- Fonte da extracao: ${String(extraction.sourceKind || 'unknown')}\n`);
      dossierStream.write(`- Nome do arquivo: ${String(extraction.fileName || '')}\n`);
      dossierStream.write(`- Content-Type: ${String(extraction.contentType || '')}\n`);
      dossierStream.write(`- Tamanho (bytes): ${Number(extraction.sizeBytes || 0)}\n`);
      dossierStream.write(`- Hash: ${String(extraction.fileHash || '')}\n`);
      dossierStream.write(`- Caracteres extraidos: ${markdownContent.length}\n\n`);
      dossierStream.write(`${markdownContent}\n\n`);
    } catch (error) {
      const errorMessage = error?.message || String(error);
      manifest.documentosComErro += 1;
      manifest.documentos.push({
        ordem: String(doc?.ordem || ''),
        tipo,
        data,
        unidadeOrigem: origem,
        url,
        status: 'ERRO',
        erro: errorMessage
      });
      console.error(`[EXPORT ZIP] Falha no doc ${doc?.ordem}:`, errorMessage);
      dossierStream.write(`- Status: ERRO\n\n`);
      dossierStream.write(`> Erro ao extrair documento: ${errorMessage}\n\n`);
    }
  }

  dossierStream.end();
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifesto_dossie.json' });
  await archive.finalize();
  return;

  // Iterar e processar documentos
  for (const doc of documentos) {
    if (!doc.url) continue;

    const safeOrdem = String(doc.ordem || '00').padStart(2, '0');
    const safeTipo = String(doc.tipo || 'doc').replace(/[^\w\d\s-]/g, '').trim().replace(/\s+/g, '_');
    const docFilename = `${safeOrdem}_${safeTipo}.md`;

    try {
      console.log(`[EXPORT ZIP] Processando: ${docFilename}`);

      // Extrair texto (agora em Markdown via Turndown se for HTML)
      const extraction = await extractDocumentText(doc.url);
      const markdownContent = extraction.text || '(Conteúdo vazio ou não extraído)';

      // Montar Frontmatter YAML
      const yamlHeader = `---
Processo: "${protocolo || ''}"
Documento: "${doc.tipo || ''}"
Ordem: "${doc.ordem || ''}"
Data: "${doc.data || ''}"
Origem: "${doc.unidadeOrigem || ''}"
Fonte: "${extraction.sourceKind}"
---

`;

      // Adicionar arquivo ao ZIP
      archive.append(yamlHeader + markdownContent, { name: docFilename });

    } catch (error) {
      console.error(`[EXPORT ZIP] Falha no doc ${doc.ordem}:`, error.message);
      // Adicionar arquivo de erro para não quebrar o fluxo
      archive.append(`Erro ao extrair documento: ${error.message}`, { name: `${safeOrdem}_ERRO.txt` });
    }
  }

  // Finalizar o ZIP
  await archive.finalize();
});

// PROXY Endpoint para PDF
app.get('/api/proxy/pdf', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL Ã© obrigatÃ³ria' });

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
        error: 'Navegador para scraping nÃ£o encontrado no servidor',
        details: 'Instale Chrome/Edge no sistema ou execute: npm --prefix server run postinstall'
      });
    }
    res.status(500).json({ error: 'Falha ao obter documento: ' + message });
  }
});

// Endpoint para conteÃºdo de documento (HTML/Texto)
app.get('/api/sipac/documento/conteudo', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL Ã© obrigatÃ³ria' });

  console.log(`[CONTENT ENPOINT] Request for: ${url.substring(0, 100)}...`);
  try {
    const text = await scrapeSIPACDocumentContent(url);
    if (!text) {
      console.warn(`[CONTENT ENPOINT] Scraper returned empty for: ${url.substring(0, 50)}`);
      return res.json({ text: '', error: 'ConteÃºdo vazio ou bloqueado' });
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

  const cleanProtocol = String(protocolo || '').replace(/[^\d]/g, '');
  const safeDoc = {
    url: String(url),
    ordem: String(ordem || '0'),
    tipo: String(tipo || 'DOCUMENTO')
  };
  const docId = buildSipacDocumentId(safeDoc);
  const docRef = db_admin && cleanProtocol
    ? db_admin.collection('contratacoes').doc(cleanProtocol).collection('arquivos').doc(docId)
    : null;

  try {
    let firestoreWarning = null;

    if (docRef) {
      try {
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
      } catch (firestoreReadErr) {
        firestoreWarning = firestoreReadErr?.message || String(firestoreReadErr);
        console.warn('[OCR ENDPOINT] Firestore indisponivel para leitura de cache:', firestoreWarning);
      }
    }

    const extracted = await extractDocumentText(String(url));
    const text = String(extracted.text || '').trim();
    const payload = {
      text,
      status: text ? 'READY' : 'ERROR',
      chars: Number(text.length),
      source: extracted.sourceKind,
      fromCache: false,
      warning: firestoreWarning
    };

    if (docRef) {
      try {
        await docRef.set({
          ocrStatus: text ? 'READY' : 'ERROR',
          ocrText: text,
          ocrChars: text.length,
          ocrSource: extracted.sourceKind,
          ocrContentType: extracted.contentType,
          ocrFileName: extracted.fileName,
          ocrFileHash: extracted.fileHash,
          ocrFileSizeBytes: extracted.sizeBytes,
          ocrError: text ? null : 'Texto nao encontrado no documento.',
          ocrUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (firestoreWriteErr) {
        payload.warning = firestoreWriteErr?.message || String(firestoreWriteErr);
        console.warn('[OCR ENDPOINT] Firestore indisponivel para escrita de OCR:', payload.warning);
      }
    }

    return res.json(payload);
  } catch (error) {
    console.error('[OCR ENDPOINT ERROR]', error);
    return res.status(500).json({ error: error?.message || String(error) });
  }
});

// Endpoint para backfill global de OCR nos documentos jÃ¡ sincronizados.
app.post('/api/sipac/ocr/enqueue-linked', async (req, res) => {
  const protocolo = String(req.body?.protocolo || '').trim();
  const documentosRaw = Array.isArray(req.body?.documentos) ? req.body.documentos : [];

  if (!db_admin) {
    return res.status(500).json({ error: 'Firebase Admin nao inicializado para persistencia de OCR.' });
  }

  if (!protocolo) {
    return res.status(400).json({ error: 'protocolo e obrigatorio' });
  }

  if (documentosRaw.length === 0) {
    return res.json({
      started: false,
      message: 'Nenhum documento enviado para OCR.',
      totalDocumentos: 0
    });
  }

  const protocolDigits = protocolo.replace(/[^\d]/g, '');
  const formattedProtocol = protocolDigits.length === 17
    ? `${protocolDigits.slice(0, 5)}.${protocolDigits.slice(5, 11)}/${protocolDigits.slice(11, 15)}-${protocolDigits.slice(15)}`
    : protocolo;
  const processId = formattedProtocol.replace(/[^\d]/g, '');

  const documentos = documentosRaw
    .map((doc) => ({
      ordem: String(doc?.ordem || ''),
      tipo: String(doc?.tipo || 'DOCUMENTO'),
      data: String(doc?.data || ''),
      unidadeOrigem: String(doc?.unidadeOrigem || ''),
      url: doc?.url ? String(doc.url) : ''
    }))
    .filter((doc) => !!doc.url);

  const uniqueDocumentosMap = new Map();
  for (const doc of documentos) {
    uniqueDocumentosMap.set(`${doc.ordem}::${doc.tipo}::${doc.url}`, doc);
  }
  const uniqueDocumentos = Array.from(uniqueDocumentosMap.values());

  if (uniqueDocumentos.length === 0) {
    return res.json({
      started: false,
      message: 'Documentos sem URL valida.',
      totalDocumentos: 0
    });
  }

  syncProcessDocuments(formattedProtocol, processId, uniqueDocumentos).then(() => {
    console.log(`[OCR ENQUEUE] Sincronizacao concluida para ${formattedProtocol} (${uniqueDocumentos.length} docs).`);
  }).catch((error) => {
    console.error(`[OCR ENQUEUE] Falha na sincronizacao para ${formattedProtocol}:`, error?.message || error);
  });

  return res.status(202).json({
    started: true,
    protocolo: formattedProtocol,
    totalDocumentos: uniqueDocumentos.length
  });
});

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
const MODALITY_LABELS = {
  pregao_eletronico: 'Pregão Eletrônico',
  dispensa_licitacao: 'Dispensa de Licitação',
  inexigibilidade_licitacao: 'Inexigibilidade de Licitação',
  concorrencia: 'Concorrência'
};
const MODALITY_TYPES = new Set(['all', ...Object.keys(MODALITY_LABELS)]);
const PNCP_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const getCurrentProcurementYear = () => String(new Date().getFullYear());
const getCurrentProcurementYearNumber = () => Number(getCurrentProcurementYear());
const sanitizeYear = (value) => String(value || '').replace(/[^\d]/g, '');
const isFixedProcurementYear = (year) => Number(year) < getCurrentProcurementYearNumber();
const getProcurementFilePath = (year) => path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
const getContractsFilePath = (year) => path.join(PROCUREMENT_DATA_DIR, `contratos_${year}.json`);
const sipacProcessUrlCache = new Map();
const manualGovContractsCache = MANUAL_GOV_CONTRACTS;

function getProcurementYears() {
  const knownYears = new Set(['2022', '2023', '2024', '2025', getCurrentProcurementYear()]);

  if (fs.existsSync(PROCUREMENT_DATA_DIR)) {
    const files = fs.readdirSync(PROCUREMENT_DATA_DIR);
    files
      .map((file) => file.match(/^contratacoes_(\d{4})\.json$/)?.[1])
      .filter(Boolean)
      .forEach((year) => knownYears.add(year));
  }

  const manualYears = Array.isArray(manualGovContractsCache?.data) ? manualGovContractsCache.data : [];
  manualYears.forEach((item) => {
    const year = sanitizeYear(item?.year || item?.anoCompra);
    if (year.length === 4) knownYears.add(year);
  });

  return Array.from(knownYears).sort((a, b) => Number(a) - Number(b));
}

function getContractSnapshotYears() {
  const knownYears = new Set([getCurrentProcurementYear()]);

  if (fs.existsSync(PROCUREMENT_DATA_DIR)) {
    const files = fs.readdirSync(PROCUREMENT_DATA_DIR);
    files
      .map((file) => file.match(/^contratos_(\d{4})\.json$/)?.[1])
      .filter(Boolean)
      .forEach((year) => knownYears.add(year));
  }

  return Array.from(knownYears).sort((a, b) => Number(a) - Number(b));
}

function readJsonFileSafely(filePath, context) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`[JSON READ ERROR] ${context}: ${filePath} - ${error.message}`);
    return null;
  }
}

function getManualProcurementEntriesForYear(year) {
  const normalizedYear = sanitizeYear(year);
  const entries = Array.isArray(manualGovContractsCache?.data) ? manualGovContractsCache.data : [];
  return entries.filter((item) => sanitizeYear(item?.year || item?.anoCompra) === normalizedYear);
}

function getProcurementRecordMergeKey(purchase, fallbackYear = null) {
  const control = normalizeOptionalString(purchase?.numeroControlePNCP);
  if (control) return `pncp:${control}`;

  const year = sanitizeYear(purchase?.year || purchase?.anoCompra || purchase?.anoCompraPncp || purchase?.fetchYear || fallbackYear);
  const processo = String(purchase?.processo || '').replace(/[^\d]/g, '');
  const numeroCompra = normalizeOptionalString(purchase?.numeroCompra) || '';
  const modalidadeNome = String(purchase?.modalidadeNome || '').trim().toLowerCase();
  return `manual:${year}:${processo}:${numeroCompra}:${modalidadeNome}`;
}

function mergeProcurementEntries(baseEntry = {}, manualEntry = {}) {
  return {
    ...baseEntry,
    ...manualEntry,
    orgaoEntidade: {
      ...(baseEntry?.orgaoEntidade || {}),
      ...(manualEntry?.orgaoEntidade || {})
    },
    unidadeOrgao: {
      ...(baseEntry?.unidadeOrgao || {}),
      ...(manualEntry?.unidadeOrgao || {})
    },
    amparoLegal: {
      ...(baseEntry?.amparoLegal || {}),
      ...(manualEntry?.amparoLegal || {})
    }
  };
}

function findExistingProcurementKeyForManualEntry(mergedMap, manualEntry, fallbackYear = null) {
  const manualProcess = String(manualEntry?.processo || '').replace(/[^\d]/g, '');
  const manualYear = extractPurchaseYear(manualEntry, fallbackYear);
  const manualNumeroCompra = normalizeOptionalString(manualEntry?.numeroCompra);

  for (const [key, entry] of mergedMap.entries()) {
    const entryProcess = String(entry?.processo || '').replace(/[^\d]/g, '');
    const entryYear = extractPurchaseYear(entry, fallbackYear);
    const entryNumeroCompra = normalizeOptionalString(entry?.numeroCompra);

    if (manualProcess && entryProcess && manualProcess === entryProcess) {
      return key;
    }

    if (!manualProcess && manualNumeroCompra && entryNumeroCompra && manualNumeroCompra === entryNumeroCompra && manualYear === entryYear) {
      return key;
    }
  }

  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildSipacSummaryPayload(data = {}) {
  const latestMovement = Array.isArray(data?.movimentacoes) && data.movimentacoes.length > 0
    ? [...data.movimentacoes].sort((a, b) => {
      const parse = (value) => {
        const parts = String(value || '').split('/');
        if (parts.length !== 3) return 0;
        return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
      };
      return parse(b?.data) - parse(a?.data);
    })[0]
    : null;

  return {
    numeroProcesso: data?.numeroProcesso || '',
    dataAutuacion: data?.dataAutuacion || '',
    horarioAutuacion: data?.horarioAutuacion || '',
    usuarioAutuacion: data?.usuarioAutuacion || '',
    natureza: data?.natureza || '',
    status: data?.status || '',
    dataCadastro: data?.dataCadastro || '',
    unidadeOrigem: data?.unidadeOrigem || '',
    unidadeAtual: data?.unidadeAtual || latestMovement?.unidadeDestino || '',
    ultimaMovimentacao: latestMovement?.data || data?.ultimaMovimentacao || '',
    ultimaAtualizacao: data?.ultimaAtualizacao || '',
    totalDocumentos: data?.totalDocumentos || '0',
    observacao: data?.observacao || '',
    assuntoCodigo: data?.assuntoCodigo || '',
    assuntoDescricao: data?.assuntoDescricao || '',
    assuntoDetalhado: data?.assuntoDetalhado || '',
    interessados: [],
    documentos: [],
    movimentacoes: [],
    incidentes: [],
    snapshot_hash: data?.snapshot_hash || '',
    scraping_last_error: data?.scraping_last_error || null,
    summaryOnly: true
  };
}

function normalizeProcessIdentifier(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function detectGovModalityType(purchase) {
  const combined = normalizeText(
    `${purchase?.modalidadeNome || ''} ${purchase?.modoDisputaNomePncp || purchase?.modoDisputaNome || ''} ${purchase?.amparoLegalNome || purchase?.amparoLegal?.nome || ''}`
  );

  if (combined.includes('pregao')) return 'pregao_eletronico';
  if (combined.includes('dispensa')) return 'dispensa_licitacao';
  if (combined.includes('inexig')) return 'inexigibilidade_licitacao';
  if (combined.includes('concorr')) return 'concorrencia';
  return null;
}

function mapPurchaseToGovRecord(purchase) {
  const modalidadeCodigo = detectGovModalityType(purchase);
  if (!modalidadeCodigo) return null;

  const fallbackProcess =
    purchase?.processo ||
    purchase?.numeroControlePNCP ||
    purchase?.idCompra ||
    purchase?.numeroCompra ||
    'PROCESSO_NAO_INFORMADO';
  const numeroProcesso = String(fallbackProcess).trim();

  const itemDescription = Array.isArray(purchase?.itens)
    ? purchase.itens
      .map((item) => String(item?.descricao || '').trim())
      .filter(Boolean)
      .join(' | ')
    : '';
  const objeto = String(purchase?.objetoCompra || '').trim() || itemDescription || 'Objeto nao informado';

  const rawHomologado = Number(purchase?.valorTotalHomologado);
  const valorHomologado = Number.isFinite(rawHomologado) ? rawHomologado : 0;
  const temValorHomologado = Number.isFinite(rawHomologado) && rawHomologado > 0;
  const rawAnoCompra = purchase?.anoCompraPncp || purchase?.anoCompra || purchase?.fetchYear || null;
  const anoCompra = rawAnoCompra ? String(rawAnoCompra) : null;
  const rawSequencial = purchase?.sequencialCompraPncp || purchase?.sequencialCompra || null;
  const sequencialCompra = rawSequencial !== null && rawSequencial !== undefined
    ? String(rawSequencial)
    : null;
  const empresa = extractCompanyNameFromPurchase(purchase);
  const baseRecord = {
    modalidade: MODALITY_LABELS[modalidadeCodigo],
    modalidadeCodigo,
    numeroCompra: normalizeOptionalString(purchase?.numeroCompra),
    identificacaoContratacao: buildGovContractIdentifier(purchase),
    empresa,
    numeroProcesso,
    objeto,
    valorHomologado,
    dataPublicacao: purchase?.dataPublicacaoPncp || purchase?.dataInclusaoPncp || purchase?.dataPublicacao || null,
    uasg: purchase?.unidadeOrgaoCodigoUnidade
      ? String(purchase.unidadeOrgaoCodigoUnidade)
      : (purchase?.unidadeOrgao?.codigoUnidade ? String(purchase.unidadeOrgao.codigoUnidade) : undefined),
    cnpj: purchase?.orgaoEntidadeCnpj || purchase?.orgaoEntidade?.cnpj || CNPJ_IFES_BSF,
    numeroControlePNCP: purchase?.numeroControlePNCP || null,
    anoCompra,
    sequencialCompra,
    valorEstimado: Number(purchase?.valorTotalEstimado || 0),
    temValorHomologado,
    statusHomologacao: temValorHomologado ? 'HOMOLOGADO' : 'NAO_HOMOLOGADO',
    situacaoCompra: purchase?.situacaoCompraNomePncp || purchase?.situacaoCompraNome || null
  };

  if (modalidadeCodigo === 'pregao_eletronico') {
    return {
      ...baseRecord,
      modoDisputa: purchase?.modoDisputaNomePncp || purchase?.modoDisputaNome || undefined
    };
  }

  if (modalidadeCodigo === 'dispensa_licitacao' || modalidadeCodigo === 'inexigibilidade_licitacao') {
    return {
      ...baseRecord,
      amparoLegal: purchase?.amparoLegalNome || purchase?.amparoLegal?.nome || undefined
    };
  }

  if (modalidadeCodigo === 'concorrencia') {
    return {
      ...baseRecord,
      regimeExecucao: purchase?.modoDisputaNomePncp || undefined
    };
  }

  return baseRecord;
}

function buildGovModalityPayload(rawPurchases = [], modalityType = 'all') {
  const mapped = rawPurchases
    .map(mapPurchaseToGovRecord)
    .filter(Boolean);

  if (modalityType === 'all') return mapped;
  return mapped.filter((item) => item.modalidadeCodigo === modalityType);
}

function extractPurchaseYear(purchase, fallbackYear = null) {
  const rawYear = purchase?.anoCompraPncp || purchase?.anoCompra || purchase?.fetchYear || fallbackYear;
  const normalizedYear = sanitizeYear(rawYear);
  return normalizedYear.length === 4 ? normalizedYear : null;
}

function extractPurchaseSequential(purchase) {
  const rawSequencial = purchase?.sequencialCompraPncp || purchase?.sequencialCompra || null;
  if (rawSequencial === null || rawSequencial === undefined) return null;
  const normalized = String(rawSequencial).replace(/[^\d]/g, '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

const EXECUTION_PROCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const EXECUTION_PROCESS_ERROR_CACHE_TTL_MS = 30 * 1000;
const EXECUTION_PROCESS_LOOKUP_TIMEOUT_MS = 5000;
let executionProcessLookupCache = {
  expiresAt: 0,
  lookup: null
};
let executionProcessLookupRefreshPromise = null;
const GOV_SYNC_COLLECTION = 'gov_sync_cache';
const GOV_SYNC_RECORDS_SUBCOLLECTION = 'records';

function getGovProcessIdentificationStatus(hasProcurement, hasInstrument) {
  if (hasProcurement && hasInstrument) {
    return {
      code: 'CONTRATACAO_E_INSTRUMENTO_IDENTIFICADOS',
      label: 'Contratacao e instrumento identificados'
    };
  }

  if (hasInstrument) {
    return {
      code: 'INSTRUMENTO_IDENTIFICADO',
      label: 'Instrumento identificado'
    };
  }

  if (hasProcurement) {
    return {
      code: 'CONTRATACAO_IDENTIFICADA',
      label: 'Contratacao identificada'
    };
  }

  return {
    code: 'NAO_IDENTIFICADO',
    label: 'Nao identificado'
  };
}

async function refreshExecutionProcessLookupCache() {
  const byProcess = new Map();

  try {
    if (db_admin) {
      const snapshot = await Promise.race([
        db_admin.collection('acquisition_processes').get(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Execution process lookup timeout.')), EXECUTION_PROCESS_LOOKUP_TIMEOUT_MS);
        })
      ]);

      snapshot.forEach((doc) => {
        const data = doc.data() || {};
        const protocolo = normalizeOptionalString(data?.protocoloSIPAC || data?.dadosSIPAC?.numeroProcesso);
        const processKey = normalizeProcessIdentifier(protocolo);
        if (!processKey || byProcess.has(processKey)) return;

        byProcess.set(processKey, {
          protocoloSIPAC: protocolo,
          faseInternaStatus: normalizeOptionalString(data?.fase_interna_status),
          healthScore: Number.isFinite(Number(data?.health_score)) ? Number(data.health_score) : null
        });
      });
    }
  } catch (error) {
    console.warn('[EXECUTION PROCESS LOOKUP WARNING]', error?.message || error);
    const fallbackLookup = executionProcessLookupCache.lookup || {
      generatedAt: new Date().toISOString(),
      byProcess: new Map()
    };

    executionProcessLookupCache = {
      expiresAt: Date.now() + EXECUTION_PROCESS_ERROR_CACHE_TTL_MS,
      lookup: fallbackLookup
    };

    return fallbackLookup;
  }

  return {
    generatedAt: new Date().toISOString(),
    byProcess
  };
}

async function getExecutionProcessLookup(forceRefresh = false) {
  if (!forceRefresh && executionProcessLookupCache.lookup && executionProcessLookupCache.expiresAt > Date.now()) {
    return executionProcessLookupCache.lookup;
  }

  const fallbackLookup = executionProcessLookupCache.lookup || {
    generatedAt: new Date().toISOString(),
    byProcess: new Map()
  };

  if (forceRefresh) {
    const lookup = await refreshExecutionProcessLookupCache();
    executionProcessLookupCache = {
      expiresAt: Date.now() + EXECUTION_PROCESS_CACHE_TTL_MS,
      lookup
    };
    return lookup;
  }

  if (!executionProcessLookupRefreshPromise) {
    executionProcessLookupRefreshPromise = refreshExecutionProcessLookupCache()
      .then((lookup) => {
        executionProcessLookupCache = {
          expiresAt: Date.now() + EXECUTION_PROCESS_CACHE_TTL_MS,
          lookup
        };
        return lookup;
      })
      .catch((error) => {
        console.warn('[EXECUTION PROCESS LOOKUP BACKGROUND WARNING]', error?.message || error);
        executionProcessLookupCache = {
          expiresAt: Date.now() + EXECUTION_PROCESS_ERROR_CACHE_TTL_MS,
          lookup: fallbackLookup
        };
        return fallbackLookup;
      })
      .finally(() => {
        executionProcessLookupRefreshPromise = null;
      });
  }

  return fallbackLookup;
}

function buildExecutionLinkStatus(numeroProcesso, executionLookup = null) {
  const processKey = normalizeProcessIdentifier(numeroProcesso);
  const linkedEntry = processKey && executionLookup?.byProcess?.has(processKey)
    ? executionLookup.byProcess.get(processKey)
    : null;

  if (linkedEntry) {
    return {
      executionLinkStatusCode: 'PROCESSO_VINCULADO',
      executionLinkStatusLabel: 'Processo vinculado',
      executionLinkedProtocol: linkedEntry?.protocoloSIPAC || null
    };
  }

  if (processKey) {
    return {
      executionLinkStatusCode: 'PROCESSO_DISPONIVEL',
      executionLinkStatusLabel: 'Disponivel na execucao',
      executionLinkedProtocol: formatSipacProtocol(processKey) || numeroProcesso || null
    };
  }

  return {
    executionLinkStatusCode: 'NAO_VINCULADO',
    executionLinkStatusLabel: 'Nao vinculado',
    executionLinkedProtocol: null
  };
}

function buildGovProcessRegistry(executionLookup = null) {
  const registryMap = new Map();
  const procurementYears = getProcurementYears();
  const contractYears = getContractSnapshotYears();
  const procurementLookup = buildProcurementLookupForYears(procurementYears);

  const ensureEntry = (numeroProcesso) => {
    const normalizedProcess = normalizeOptionalString(numeroProcesso);
    const processKey = normalizeProcessIdentifier(normalizedProcess);
    if (!processKey) return null;

    if (!registryMap.has(processKey)) {
      registryMap.set(processKey, {
        numeroProcesso: normalizedProcess || formatSipacProtocol(processKey) || processKey,
        processKey,
        procurementCount: 0,
        instrumentCount: 0,
        procurementRecords: [],
        instrumentRecords: [],
        _procurementKeys: new Set(),
        _instrumentKeys: new Set()
      });
    }

    return registryMap.get(processKey);
  };

  procurementYears.forEach((year) => {
    const yearData = readProcurementYearSnapshot(year, '/api/gov-process-registry/procurements');
    const purchases = Array.isArray(yearData?.data) ? yearData.data : [];

    purchases.forEach((purchase) => {
      const mapped = mapPurchaseToGovRecord(purchase);
      if (!mapped) return;

      const entry = ensureEntry(mapped.numeroProcesso);
      if (!entry) return;

      const procurementKey = [
        normalizeOptionalString(mapped.numeroControlePNCP),
        normalizeOptionalString(mapped.identificacaoContratacao),
        mapped.modalidadeCodigo,
        sanitizeYear(year)
      ].join('|');

      if (!entry._procurementKeys.has(procurementKey)) {
        entry._procurementKeys.add(procurementKey);
        entry.procurementRecords.push({
          snapshotYear: sanitizeYear(year) || null,
          modalidade: mapped.modalidade || null,
          identificacaoContratacao: mapped.identificacaoContratacao || null,
          situacaoCompra: mapped.situacaoCompra || null,
          statusHomologacao: mapped.statusHomologacao || null
        });
        entry.procurementCount += 1;
      }
    });
  });

  contractYears.forEach((year) => {
    const yearData = readContractsYearSnapshot(year, '/api/gov-process-registry/instruments');
    const contracts = Array.isArray(yearData?.data) ? yearData.data : [];

    contracts.forEach((contract) => {
      const mapped = buildGovContractInstrumentRecord(contract, procurementLookup, year);
      const entry = ensureEntry(mapped.numeroProcesso);
      if (!entry) return;

      const instrumentKey = [
        normalizeOptionalString(mapped.numeroControlePNCP),
        normalizeOptionalString(mapped.numeroInstrumento),
        sanitizeYear(year)
      ].join('|');

      if (!entry._instrumentKeys.has(instrumentKey)) {
        entry._instrumentKeys.add(instrumentKey);
        entry.instrumentRecords.push({
          snapshotYear: sanitizeYear(year) || null,
          tipoInstrumento: mapped.tipoInstrumento || null,
          numeroInstrumento: mapped.numeroInstrumento || null,
          identificacaoContratacao: mapped.identificacaoContratacao || null,
          statusVigencia: mapped.statusVigencia || null
        });
        entry.instrumentCount += 1;
      }
    });
  });

  return Array.from(registryMap.values())
    .map((entry) => {
      const identification = getGovProcessIdentificationStatus(entry.procurementCount > 0, entry.instrumentCount > 0);
      const executionLink = buildExecutionLinkStatus(entry.numeroProcesso, executionLookup);

      return {
        numeroProcesso: entry.numeroProcesso,
        processKey: entry.processKey,
        identificationStatusCode: identification.code,
        identificationStatusLabel: identification.label,
        procurementCount: entry.procurementCount,
        instrumentCount: entry.instrumentCount,
        procurementRecords: entry.procurementRecords,
        instrumentRecords: entry.instrumentRecords,
        executionLinked: executionLink.executionLinkStatusCode !== 'NAO_VINCULADO',
        executionLinkStatusCode: executionLink.executionLinkStatusCode,
        executionLinkStatusLabel: executionLink.executionLinkStatusLabel,
        executionLinkedProtocol: executionLink.executionLinkedProtocol
      };
    })
    .sort((a, b) => a.numeroProcesso.localeCompare(b.numeroProcesso, 'pt-BR'));
}

function normalizeCompanyCandidate(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;

  const lower = normalizeText(normalized);
  const blockedStarts = [
    'empresa especializada',
    'empresa prestadora',
    'empresa fornecedora',
    'empresa credenciada',
    'empresa de engenharia',
    'empresa para',
    'servico de',
    'servico para',
    'fornecimento de',
    'inscricao em',
    'inscricao para',
    'contratacao de'
  ];

  if (blockedStarts.some((item) => lower.startsWith(item))) {
    return null;
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function extractCompanyNameFromText(...values) {
  const combined = values
    .map((value) => normalizeOptionalString(value))
    .filter(Boolean)
    .join(' ');

  if (!combined) return null;

  const patterns = [
    /ofertad[oa] pel[ao]\s+([^,.]+?)(?:,| CNPJ| no periodo| no período| a ser realizado|$)/i,
    /pagamento de taxa a[oa]\s+([^,.]+?)(?:,| referente|$)/i,
    /contratacao d[ao]\s+([^,.]+?)(?:,| para a prestacao| para atender| para o |$)/i,
    /servicos? de correspondencia d[ao]\s+([^,.]+?)(?:,| para|$)/i,
    /perante a\s+([^,.]+?)(?:,| para quitacao|$)/i,
    /pela empresa\s+([^,.]+?)(?:,| CNPJ|$)/i,
    /([A-Z][A-Za-z0-9 .&()/-]{5,}?)\s*\(CESAN\)/,
    /(Concessionaria de [A-Za-z ]+)/i,
    /(Conselho Regional de Quimica [^,.]+)/i
  ];

  for (const pattern of patterns) {
    const match = combined.match(pattern);
    const candidate = normalizeCompanyCandidate(match?.[1] || match?.[0] || null);
    if (candidate) return candidate;
  }

  return null;
}

function extractCompanyNameFromPurchase(purchase) {
  const directCandidates = [
    purchase?.empresa,
    purchase?.empresaContratada,
    purchase?.fornecedor,
    purchase?.fornecedorNome,
    purchase?.contratada,
    purchase?.contratadoNome,
    purchase?.razaoSocialFornecedor,
    purchase?.nomeRazaoSocialFornecedor,
    purchase?.fornecedor?.razaoSocial,
    purchase?.contratada?.razaoSocial,
    purchase?.beneficiario?.razaoSocial,
    purchase?.vencedor?.razaoSocial,
    purchase?.orgaoSubRogado?.razaoSocial,
    purchase?.orgaoSubrogadoRazaoSocial
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeCompanyCandidate(candidate);
    if (normalized) return normalized;
  }

  return extractCompanyNameFromText(
    purchase?.informacaoComplementar,
    purchase?.objetoCompra,
    purchase?.objeto,
    purchase?.amparoLegalDescricao
  );
}

function formatSipacProtocol(value) {
  const digitsOnly = String(value || '').replace(/[^\d]/g, '');
  if (digitsOnly.length === 17) {
    return `${digitsOnly.slice(0, 5)}.${digitsOnly.slice(5, 11)}/${digitsOnly.slice(11, 15)}-${digitsOnly.slice(15)}`;
  }

  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildGovContractIdentifier(purchase, fallbackYear = null) {
  const numeroCompra = normalizeOptionalString(purchase?.numeroCompra);
  const anoCompra = extractPurchaseYear(purchase, fallbackYear);

  if (numeroCompra && anoCompra) return `${numeroCompra}/${anoCompra}`;
  return numeroCompra;
}

function extractSipacProcessUrl(...values) {
  const pattern = /https?:\/\/sipac\.ifes\.edu\.br\/public\/jsp\/processos\/processo_detalhado\.jsf\?id=\d+/i;

  for (const value of values) {
    const match = String(value || '').match(pattern);
    if (match?.[0]) {
      return match[0];
    }
  }

  return null;
}

function buildPncpEditalUrl(source, fallbackYear = null) {
  const cnpj = normalizeOptionalString(source?.orgaoEntidadeCnpj || source?.orgaoEntidade?.cnpj) || CNPJ_IFES_BSF;
  const anoCompra = extractPurchaseYear(source, fallbackYear);
  const sequencialCompra = extractPurchaseSequential(source);

  if (cnpj && anoCompra && sequencialCompra) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${anoCompra}/${Number(sequencialCompra)}`;
  }

  const numeroControlePNCP = normalizeOptionalString(source?.numeroControlePNCP);
  const controlMatch = String(numeroControlePNCP || '').match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (controlMatch) {
    const [, controlCnpj, sequencial, ano] = controlMatch;
    return `https://pncp.gov.br/app/editais/${controlCnpj}/${ano}/${Number(sequencial)}`;
  }

  return null;
}

async function resolveSipacProcessUrlByProcessNumber(numeroProcesso) {
  const protocolo = formatSipacProtocol(numeroProcesso);
  if (!protocolo) return null;

  if (sipacProcessUrlCache.has(protocolo)) {
    return sipacProcessUrlCache.get(protocolo);
  }

  try {
    const sipacData = await scrapeSIPACProcess(protocolo);
    const resolvedUrl = normalizeOptionalString(sipacData?.detailUrl) || null;
    sipacProcessUrlCache.set(protocolo, resolvedUrl);
    return resolvedUrl;
  } catch (error) {
    sipacProcessUrlCache.set(protocolo, null);
    return null;
  }
}

async function buildGovContractDetailPayload(basePurchase, detailPurchase = null, requestYear = null) {
  const source = detailPurchase && typeof detailPurchase === 'object'
    ? { ...basePurchase, ...detailPurchase }
    : (basePurchase || {});

  const mapped = mapPurchaseToGovRecord(source) || mapPurchaseToGovRecord(basePurchase) || null;
  const anoCompra = extractPurchaseYear(source, requestYear);
  const sequencialCompra = extractPurchaseSequential(source) || extractPurchaseSequential(basePurchase);
  const rawHomologado = Number(source?.valorTotalHomologado);
  const valorHomologado = Number.isFinite(rawHomologado) ? rawHomologado : 0;
  const temValorHomologado = Number.isFinite(rawHomologado) && rawHomologado > 0;

  const orgaoEntidade = source?.orgaoEntidade || {};
  const unidadeOrgao = source?.unidadeOrgao || {};
  const amparoLegal = source?.amparoLegal || {};
  const numeroCompra = normalizeOptionalString(source?.numeroCompra);
  const identificacaoContratacao = buildGovContractIdentifier(source, requestYear) || buildGovContractIdentifier(basePurchase, requestYear);
  const empresa = extractCompanyNameFromPurchase(source) || extractCompanyNameFromPurchase(basePurchase);
  const sipacLinkFromSource = extractSipacProcessUrl(
    source?.linkProcessoEletronico,
    source?.informacaoComplementar,
    source?.objetoCompra,
    source?.linkSistemaOrigem
  );
  const sipacProcessLink = sipacLinkFromSource || await resolveSipacProcessUrlByProcessNumber(source?.processo || basePurchase?.processo);
  const numeroControlePNCP = normalizeOptionalString(source?.numeroControlePNCP);

  return {
    modalidadeCodigo: mapped?.modalidadeCodigo || null,
    modalidade: mapped?.modalidade || source?.modalidadeNome || null,
    numeroCompra,
    identificacaoContratacao,
    empresa,
    numeroProcesso: normalizeOptionalString(source?.processo) || mapped?.numeroProcesso || 'PROCESSO_NAO_INFORMADO',
    numeroControlePNCP,
    anoCompra,
    sequencialCompra,
    situacaoCompra: normalizeOptionalString(source?.situacaoCompraNomePncp || source?.situacaoCompraNome),
    objeto: normalizeOptionalString(source?.objetoCompra) || mapped?.objeto || 'Objeto nao informado',
    informacaoComplementar: normalizeOptionalString(source?.informacaoComplementar),
    valorEstimado: Number(source?.valorTotalEstimado || 0),
    valorHomologado,
    temValorHomologado,
    statusHomologacao: temValorHomologado ? 'HOMOLOGADO' : 'NAO_HOMOLOGADO',
    dataPublicacao: source?.dataPublicacaoPncp || source?.dataPublicacao || null,
    dataInclusao: source?.dataInclusaoPncp || source?.dataInclusao || null,
    dataAtualizacao: source?.dataAtualizacaoPncp || source?.dataAtualizacao || null,
    dataAberturaProposta: source?.dataAberturaPropostaPncp || source?.dataAberturaProposta || null,
    dataEncerramentoProposta: source?.dataEncerramentoPropostaPncp || source?.dataEncerramentoProposta || null,
    amparoLegal: {
      codigo: normalizeOptionalString(source?.amparoLegalCodigoPncp || amparoLegal?.codigo),
      nome: normalizeOptionalString(source?.amparoLegalNome || amparoLegal?.nome),
      descricao: normalizeOptionalString(source?.amparoLegalDescricao || amparoLegal?.descricao)
    },
    tipoInstrumentoConvocatorio: {
      codigo: normalizeOptionalString(source?.tipoInstrumentoConvocatorioCodigoPncp || source?.tipoInstrumentoConvocatorioCodigo),
      nome: normalizeOptionalString(source?.tipoInstrumentoConvocatorioNome)
    },
    orgaoEntidade: {
      cnpj: normalizeOptionalString(source?.orgaoEntidadeCnpj || orgaoEntidade?.cnpj),
      razaoSocial: normalizeOptionalString(source?.orgaoEntidadeRazaoSocial || orgaoEntidade?.razaoSocial),
      poderId: normalizeOptionalString(source?.orgaoEntidadePoderId || orgaoEntidade?.poderId),
      esferaId: normalizeOptionalString(source?.orgaoEntidadeEsferaId || orgaoEntidade?.esferaId),
      codigoOrgao: normalizeOptionalString(source?.codigoOrgao || orgaoEntidade?.codigoOrgao)
    },
    unidadeOrgao: {
      codigoUnidade: normalizeOptionalString(source?.unidadeOrgaoCodigoUnidade || unidadeOrgao?.codigoUnidade),
      nomeUnidade: normalizeOptionalString(source?.unidadeOrgaoNomeUnidade || unidadeOrgao?.nomeUnidade),
      municipio: normalizeOptionalString(source?.unidadeOrgaoMunicipioNome || unidadeOrgao?.municipioNome),
      uf: normalizeOptionalString(source?.unidadeOrgaoUfSigla || unidadeOrgao?.ufSigla),
      codigoIbge: normalizeOptionalString(source?.unidadeOrgaoCodigoIbge || unidadeOrgao?.codigoIbge)
    },
    srp: typeof source?.srp === 'boolean' ? source.srp : null,
    orcamentoSigiloso: {
      codigo: Number.isFinite(Number(source?.orcamentoSigilosoCodigo)) ? Number(source.orcamentoSigilosoCodigo) : null,
      descricao: normalizeOptionalString(source?.orcamentoSigilosoDescricao)
    },
    links: {
      sistemaOrigem: null,
      processoEletronico: sipacProcessLink,
      pncp: buildPncpEditalUrl(source, requestYear) || buildPncpEditalUrl(basePurchase, requestYear)
    },
    fontesOrcamentarias: Array.isArray(source?.fontesOrcamentarias) ? source.fontesOrcamentarias : []
  };
}

function parsePncpControlNumber(control) {
  const normalized = normalizeOptionalString(control);
  const match = String(normalized || '').match(/^(\d{14})-(\d)-(\d+)\/(\d{4})$/);
  if (!match) return null;

  const [, cnpj, tipo, sequencial, ano] = match;
  return {
    cnpj,
    tipo,
    sequencial: String(Number(sequencial)),
    ano
  };
}

function buildPncpContractUrl(contract) {
  const cnpj = normalizeOptionalString(contract?.orgaoEntidade?.cnpj || contract?.orgaoEntidadeCnpj) || CNPJ_IFES_BSF;
  const anoContrato = sanitizeYear(contract?.anoContrato);
  const sequencialContrato = String(contract?.sequencialContrato || '').replace(/[^\d]/g, '');

  if (cnpj && anoContrato.length === 4 && sequencialContrato) {
    return `https://pncp.gov.br/app/contratos/${cnpj}/${anoContrato}/${Number(sequencialContrato)}`;
  }

  const parsedControl = parsePncpControlNumber(contract?.numeroControlePNCP);
  if (parsedControl) {
    return `https://pncp.gov.br/app/contratos/${parsedControl.cnpj}/${parsedControl.ano}/${Number(parsedControl.sequencial)}`;
  }

  return null;
}

function getGovContractInstrumentType(contract) {
  const typeName = normalizeOptionalString(contract?.tipoContrato?.nome || contract?.tipoContratoNome || contract?.tipoInstrumentoConvocatorioNome);
  const normalized = normalizeText(typeName);

  if (normalized.includes('empenho')) {
    return {
      code: 'EMPENHO',
      label: 'Nota de Empenho'
    };
  }

  return {
    code: 'CONTRATO',
    label: typeName || 'Contrato'
  };
}

function parseDateBoundary(value, endOfDay = false) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;

  const dateOnly = normalized.match(/^\d{4}-\d{2}-\d{2}$/);
  if (dateOnly) {
    return new Date(`${normalized}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`);
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getGovContractVigencyStatus(contract, referenceDate = new Date()) {
  const startDate = parseDateBoundary(contract?.dataVigenciaInicio || contract?.dataAssinatura, false);
  const endDate = parseDateBoundary(contract?.dataVigenciaFim, true);
  const refDate = new Date(referenceDate);

  if (!startDate && !endDate) {
    return {
      code: 'SEM_VIGENCIA',
      label: 'Sem vigencia informada',
      isActive: false
    };
  }

  if (startDate && startDate > refDate) {
    return {
      code: 'A_INICIAR',
      label: 'A iniciar',
      isActive: false
    };
  }

  if (endDate && endDate < refDate) {
    return {
      code: 'ENCERRADO',
      label: 'Encerrado',
      isActive: false
    };
  }

  return {
    code: 'VIGENTE',
    label: 'Vigente',
    isActive: true
  };
}

function buildProcurementLookupForYears(years = []) {
  const byControl = new Map();
  const byProcess = new Map();

  years.forEach((year) => {
    const normalizedYear = sanitizeYear(year);
    if (normalizedYear.length !== 4) return;

    const yearData = readProcurementYearSnapshot(normalizedYear, '/api/contracts/procurement-lookup');
    const purchases = Array.isArray(yearData?.data) ? yearData.data : [];

    purchases.forEach((purchase) => {
      const purchaseControl = normalizeOptionalString(purchase?.numeroControlePNCP);
      const purchaseProcess = normalizeProcessIdentifier(purchase?.processo);

      if (purchaseControl && !byControl.has(purchaseControl)) {
        byControl.set(purchaseControl, purchase);
      }

      if (purchaseProcess && !byProcess.has(purchaseProcess)) {
        byProcess.set(purchaseProcess, purchase);
      }
    });
  });

  return { byControl, byProcess };
}

function findRelatedProcurementForContract(contract, procurementLookup = null) {
  if (!procurementLookup) return null;

  const purchaseControl = normalizeOptionalString(contract?.numeroControlePncpCompra);
  if (purchaseControl && procurementLookup.byControl.has(purchaseControl)) {
    return procurementLookup.byControl.get(purchaseControl);
  }

  const processKey = normalizeProcessIdentifier(contract?.processo);
  if (processKey && procurementLookup.byProcess.has(processKey)) {
    return procurementLookup.byProcess.get(processKey);
  }

  return null;
}

function buildGovContractInstrumentRecord(contract, procurementLookup = null, fallbackYear = null) {
  const instrumentType = getGovContractInstrumentType(contract);
  const vigency = getGovContractVigencyStatus(contract);
  const relatedPurchase = findRelatedProcurementForContract(contract, procurementLookup);
  const purchaseIdentifier = relatedPurchase ? buildGovContractIdentifier(relatedPurchase, extractPurchaseYear(relatedPurchase, fallbackYear)) : null;

  return {
    snapshotYear: sanitizeYear(fallbackYear) || sanitizeYear(contract?.anoContrato) || null,
    tipoInstrumentoCodigo: instrumentType.code,
    tipoInstrumento: instrumentType.label,
    statusVigenciaCodigo: vigency.code,
    statusVigencia: vigency.label,
    vigente: vigency.isActive,
    numeroControlePNCP: normalizeOptionalString(contract?.numeroControlePNCP),
    numeroControlePncpCompra: normalizeOptionalString(contract?.numeroControlePncpCompra),
    numeroInstrumento: normalizeOptionalString(contract?.numeroContratoEmpenho) || normalizeOptionalString(contract?.numeroControlePNCP),
    numeroProcesso: normalizeOptionalString(contract?.processo) || 'PROCESSO_NAO_INFORMADO',
    empresa: normalizeOptionalString(contract?.nomeRazaoSocialFornecedor),
    niFornecedor: normalizeOptionalString(contract?.niFornecedor),
    objeto: normalizeOptionalString(contract?.objetoContrato) || 'Objeto nao informado',
    valorGlobal: Number(contract?.valorGlobal || contract?.valorInicial || 0),
    valorInicial: Number(contract?.valorInicial || 0),
    dataAssinatura: contract?.dataAssinatura || null,
    dataVigenciaInicio: contract?.dataVigenciaInicio || null,
    dataVigenciaFim: contract?.dataVigenciaFim || null,
    anoContrato: sanitizeYear(contract?.anoContrato) || null,
    sequencialContrato: String(contract?.sequencialContrato || '').replace(/[^\d]/g, '') || null,
    identificacaoContratacao: purchaseIdentifier,
    links: {
      pncpInstrumento: buildPncpContractUrl(contract),
      pncpContratacao: buildPncpEditalUrl({ numeroControlePNCP: contract?.numeroControlePncpCompra }),
      processoEletronico: null
    }
  };
}

async function buildGovContractInstrumentDetailPayload(contract, procurementLookup = null, fallbackYear = null) {
  const instrumentType = getGovContractInstrumentType(contract);
  const vigency = getGovContractVigencyStatus(contract);
  const relatedPurchase = findRelatedProcurementForContract(contract, procurementLookup);
  const sipacProcessLink = extractSipacProcessUrl(contract?.informacaoComplementar, contract?.objetoContrato)
    || await resolveSipacProcessUrlByProcessNumber(contract?.processo);

  return {
    snapshotYear: sanitizeYear(fallbackYear) || sanitizeYear(contract?.anoContrato) || null,
    tipoInstrumentoCodigo: instrumentType.code,
    tipoInstrumento: instrumentType.label,
    statusVigenciaCodigo: vigency.code,
    statusVigencia: vigency.label,
    vigente: vigency.isActive,
    numeroControlePNCP: normalizeOptionalString(contract?.numeroControlePNCP),
    numeroControlePncpCompra: normalizeOptionalString(contract?.numeroControlePncpCompra),
    numeroInstrumento: normalizeOptionalString(contract?.numeroContratoEmpenho) || normalizeOptionalString(contract?.numeroControlePNCP),
    numeroProcesso: normalizeOptionalString(contract?.processo) || 'PROCESSO_NAO_INFORMADO',
    empresa: normalizeOptionalString(contract?.nomeRazaoSocialFornecedor),
    niFornecedor: normalizeOptionalString(contract?.niFornecedor),
    tipoPessoa: normalizeOptionalString(contract?.tipoPessoa),
    objeto: normalizeOptionalString(contract?.objetoContrato) || 'Objeto nao informado',
    informacaoComplementar: normalizeOptionalString(contract?.informacaoComplementar),
    valorInicial: Number(contract?.valorInicial || 0),
    valorGlobal: Number(contract?.valorGlobal || contract?.valorInicial || 0),
    valorParcela: Number(contract?.valorParcela || 0),
    valorAcumulado: Number(contract?.valorAcumulado || 0),
    dataPublicacao: contract?.dataPublicacaoPncp || null,
    dataAtualizacao: contract?.dataAtualizacao || contract?.dataAtualizacaoGlobal || null,
    dataAssinatura: contract?.dataAssinatura || null,
    dataVigenciaInicio: contract?.dataVigenciaInicio || null,
    dataVigenciaFim: contract?.dataVigenciaFim || null,
    anoContrato: sanitizeYear(contract?.anoContrato) || null,
    sequencialContrato: String(contract?.sequencialContrato || '').replace(/[^\d]/g, '') || null,
    numeroParcelas: Number.isFinite(Number(contract?.numeroParcelas)) ? Number(contract.numeroParcelas) : null,
    numeroRetificacao: Number.isFinite(Number(contract?.numeroRetificacao)) ? Number(contract.numeroRetificacao) : null,
    receita: typeof contract?.receita === 'boolean' ? contract.receita : null,
    categoriaProcesso: normalizeOptionalString(contract?.categoriaProcesso?.nome),
    identificacaoContratacao: relatedPurchase ? buildGovContractIdentifier(relatedPurchase, extractPurchaseYear(relatedPurchase, fallbackYear)) : null,
    orgaoEntidade: {
      cnpj: normalizeOptionalString(contract?.orgaoEntidade?.cnpj),
      razaoSocial: normalizeOptionalString(contract?.orgaoEntidade?.razaoSocial),
      poderId: normalizeOptionalString(contract?.orgaoEntidade?.poderId),
      esferaId: normalizeOptionalString(contract?.orgaoEntidade?.esferaId)
    },
    unidadeOrgao: {
      codigoUnidade: normalizeOptionalString(contract?.unidadeOrgao?.codigoUnidade),
      nomeUnidade: normalizeOptionalString(contract?.unidadeOrgao?.nomeUnidade),
      municipio: normalizeOptionalString(contract?.unidadeOrgao?.municipioNome),
      uf: normalizeOptionalString(contract?.unidadeOrgao?.ufSigla),
      codigoIbge: normalizeOptionalString(contract?.unidadeOrgao?.codigoIbge)
    },
    links: {
      pncpInstrumento: buildPncpContractUrl(contract),
      pncpContratacao: buildPncpEditalUrl({ numeroControlePNCP: contract?.numeroControlePncpCompra }),
      processoEletronico: sipacProcessLink
    }
  };
}

async function fetchProcurementDetailFromPncp(year, sequencialCompra) {
  const normalizedYear = sanitizeYear(year);
  const normalizedSequencial = String(sequencialCompra || '').replace(/[^\d]/g, '');
  if (normalizedYear.length !== 4 || !normalizedSequencial) return null;

  const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ_IFES_BSF}/compras/${normalizedYear}/${normalizedSequencial}`;
  const response = await axios.get(url, {
    headers: PNCP_HEADERS,
    timeout: 30000
  });
  return response?.data || null;
}

function getProcurementSyncStatus() {
  const years = getProcurementYears();
  const status = {};
  const currentYear = getCurrentProcurementYear();

  for (const year of years) {
    const filePath = getProcurementFilePath(year);
    if (!fs.existsSync(filePath)) {
      status[year] = {
        exists: false,
        fixedSnapshot: isFixedProcurementYear(year),
        currentYear: year === currentYear,
        lastUpdated: null,
        totalPurchases: 0
      };
      continue;
    }

    const stats = fs.statSync(filePath);
    const data = readJsonFileSafely(filePath, `/api/procurement/status/${year}`);
    status[year] = {
      exists: true,
      fixedSnapshot: isFixedProcurementYear(year),
      currentYear: year === currentYear,
      lastUpdated: data?.metadata?.extractedAt || stats.mtime,
      totalPurchases: Number(data?.metadata?.totalPurchases || (Array.isArray(data?.data) ? data.data.length : 0)),
      fileSize: stats.size
    };
  }

  return {
    currentYear,
    fixedThroughYear: getCurrentProcurementYearNumber() - 1,
    years: status
  };
}

async function fetchProcurementsFromPncp(year) {
  const baseUrl = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
  const unidadeAdministrativaBsf = '158886';
  const modalidades = [
    { code: 6, slug: 'pregao_eletronico' },
    { code: 8, slug: 'dispensa_licitacao' },
    // PNCP /contratacoes/publicacao returns inexigibilidade under code 9 for the campus data.
    { code: 9, slug: 'inexigibilidade_licitacao' },
    { code: 4, slug: 'concorrencia' }
  ];
  const dataInicial = `${year}0101`;
  const dataFinal = `${year}1231`;
  const pageSize = 50;
  const purchases = [];
  const errors = [];
  const requestWithRetry = async (url, config, attempts = 3) => {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await axios.get(url, {
          ...config,
          timeout: config?.timeout || 45000
        });
      } catch (error) {
        lastError = error;
        const status = error?.response?.status || null;
        const isRetryable =
          !status ||
          status === 408 ||
          status === 425 ||
          status === 429 ||
          status >= 500 ||
          String(error?.code || '').toUpperCase() === 'ECONNABORTED';

        if (!isRetryable || attempt === attempts) {
          throw error;
        }

        await sleep(250 * attempt);
      }
    }

    throw lastError;
  };

  for (const modalidade of modalidades) {
    let page = 1;
    let totalPages = 1;
    let keepPaging = true;

    while (keepPaging && page <= totalPages) {
      const url =
        `${baseUrl}?dataInicial=${dataInicial}` +
        `&dataFinal=${dataFinal}` +
        `&codigoModalidadeContratacao=${modalidade.code}` +
        `&cnpj=${CNPJ_IFES_BSF}` +
        `&codigoUnidadeAdministrativa=${unidadeAdministrativaBsf}` +
        `&pagina=${page}&tamanhoPagina=${pageSize}`;

      try {
        const response = await requestWithRetry(url, {
          headers: PNCP_HEADERS,
          timeout: 45000
        });

        const payload = response.data || {};
        const pageData = Array.isArray(payload?.data) ? payload.data : [];

        if (pageData.length > 0) {
          for (const item of pageData) {
            purchases.push({
              ...item,
              itens: Array.isArray(item?.itens) ? item.itens : []
            });
          }
        }

        const parsedTotalPages = Number(payload?.totalPaginas || 1);
        totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0 ? parsedTotalPages : 1;

        if (pageData.length === 0) {
          keepPaging = false;
        } else {
          page += 1;
          await sleep(120);
        }
      } catch (error) {
        const status = error?.response?.status || null;
        const message = error?.response?.data?.message || error?.message || 'Erro desconhecido';
        errors.push({
          modalidade: modalidade.slug,
          codigoModalidadeContratacao: modalidade.code,
          status,
          message
        });
        keepPaging = false;
      }
    }
  }

  const uniquePurchases = Array.from(
    new Map(
      purchases.map((purchase) => {
        const key = purchase?.numeroControlePNCP || `${purchase?.anoCompra}-${purchase?.sequencialCompra}`;
        return [key, purchase];
      })
    ).values()
  );

  if (errors.length > 0) {
    const errorSummary = errors
      .map((item) => `${item.modalidade}(${item.codigoModalidadeContratacao})${item.status ? ` status ${item.status}` : ''}: ${item.message}`)
      .join(' | ');
    throw new Error(`Falha ao obter compras PNCP para ${year}: ${errorSummary}`);
  }

  if (uniquePurchases.length === 0) {
    const firstError = errors[0];
    if (firstError) {
      throw new Error(`Falha ao obter compras PNCP para ${year}: ${firstError.message}`);
    }
  }

  return {
    purchases: uniquePurchases,
    endpointUsed: baseUrl
  };
}

function saveProcurementSnapshot(year, purchases, source = 'pncp_sync') {
  const filePath = getProcurementFilePath(year);
  const payload = {
    metadata: {
      extractedAt: new Date().toISOString(),
      cnpj: CNPJ_IFES_BSF,
      year,
      totalPurchases: purchases.length,
      source
    },
    data: purchases
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function sanitizeFirestoreValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeFirestoreValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === 'object') {
    const sanitized = {};
    Object.entries(value).forEach(([key, entry]) => {
      const normalizedEntry = sanitizeFirestoreValue(entry);
      if (normalizedEntry !== undefined) {
        sanitized[key] = normalizedEntry;
      }
    });
    return sanitized;
  }
  return String(value);
}

function buildGovSyncRecordId(kind, year, record, index) {
  const normalizedYear = sanitizeYear(year) || '0000';
  const processKey = normalizeProcessIdentifier(record?.processo || record?.numeroProcesso);
  const controlKey = normalizeOptionalString(record?.numeroControlePNCP || record?.numeroControlePncpCompra);
  const itemKey = normalizeOptionalString(record?.id || record?.numeroItem || record?.numeroCompra || record?.numeroContratoEmpenho);
  const baseKey = processKey || controlKey || itemKey || `${kind}_${normalizedYear}_${index}`;
  return String(baseKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

async function persistCurrentYearGovSync(kind, year, metadata, records = []) {
  const normalizedYear = sanitizeYear(year);
  if (!db_admin || !normalizedYear || normalizedYear !== getCurrentProcurementYear()) return;

  const docId = `${kind}_${normalizedYear}`;
  const docRef = db_admin.collection(GOV_SYNC_COLLECTION).doc(docId);
  const syncRunId = new Date().toISOString();
  const sanitizedMetadata = sanitizeFirestoreValue(metadata || {});

  await docRef.set({
    kind,
    year: normalizedYear,
    cnpj: CNPJ_IFES_BSF,
    syncRunId,
    totalRecords: Array.isArray(records) ? records.length : 0,
    metadata: sanitizedMetadata,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  if (!Array.isArray(records) || records.length === 0) return;

  for (let start = 0; start < records.length; start += 400) {
    const batch = db_admin.batch();
    const chunk = records.slice(start, start + 400);

    chunk.forEach((record, offset) => {
      const recordId = buildGovSyncRecordId(kind, normalizedYear, record, start + offset);
      const recordRef = docRef.collection(GOV_SYNC_RECORDS_SUBCOLLECTION).doc(recordId);
      batch.set(recordRef, {
        kind,
        year: normalizedYear,
        syncRunId,
        position: start + offset,
        data: sanitizeFirestoreValue(record),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });

    await batch.commit();
  }
}

async function fetchContractsFromPncp(year) {
  const baseUrl = 'https://pncp.gov.br/api/consulta/v1/contratos';
  const dataInicial = `${year}0101`;
  const dataFinal = `${year}1231`;
  const pageSize = 200;
  const contracts = [];
  let page = 1;
  let totalPages = 1;
  let keepPaging = true;

  const requestWithRetry = async (url, config, attempts = 3) => {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await axios.get(url, {
          ...config,
          timeout: config?.timeout || 45000,
          validateStatus: (status) => status >= 200 && status < 300
        });
      } catch (error) {
        lastError = error;
        const status = error?.response?.status || null;
        const isRetryable =
          !status ||
          status === 408 ||
          status === 425 ||
          status === 429 ||
          status >= 500 ||
          String(error?.code || '').toUpperCase() === 'ECONNABORTED';

        if (!isRetryable || attempt === attempts) {
          throw error;
        }

        await sleep(250 * attempt);
      }
    }

    throw lastError;
  };

  while (keepPaging && page <= totalPages) {
    const url =
      `${baseUrl}?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      `&cnpjOrgao=${CNPJ_IFES_BSF}` +
      `&codigoUnidadeAdministrativa=158886` +
      `&pagina=${page}&tamanhoPagina=${pageSize}`;

    const response = await requestWithRetry(url, {
      headers: PNCP_HEADERS,
      timeout: 45000
    });

    const payload = response.data || {};
    const pageData = Array.isArray(payload?.data) ? payload.data : [];

    if (pageData.length > 0) {
      contracts.push(...pageData);
    }

    const parsedTotalPages = Number(payload?.totalPaginas || 1);
    totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0 ? parsedTotalPages : 1;

    if (pageData.length === 0) {
      keepPaging = false;
    } else {
      page += 1;
      await sleep(120);
    }
  }

  const uniqueContracts = Array.from(
    new Map(
      contracts.map((contract) => {
        const key = [
          normalizeOptionalString(contract?.numeroControlePNCP),
          normalizeOptionalString(contract?.numeroContratoEmpenho),
          normalizeOptionalString(contract?.niFornecedor),
          normalizeOptionalString(contract?.processo),
          normalizeOptionalString(contract?.nomeRazaoSocialFornecedor)
        ].join('|');
        return [key, contract];
      })
    ).values()
  );

  return {
    contracts: uniqueContracts,
    endpointUsed: baseUrl
  };
}

function saveContractsSnapshot(year, contracts, source = 'pncp_contracts_sync') {
  const filePath = getContractsFilePath(year);
  const payload = {
    metadata: {
      extractedAt: new Date().toISOString(),
      cnpj: CNPJ_IFES_BSF,
      year,
      totalContracts: contracts.length,
      source
    },
    data: contracts
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function readContractsYearSnapshot(year, context = '/api/contracts') {
  const filePath = getContractsFilePath(year);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFileSafely(filePath, `${context}/${year}`);
}

function buildContractSupplierLookup(contractYears = []) {
  const byControl = new Map();
  const byProcess = new Map();

  const addSupplier = (map, key, supplierName) => {
    const normalizedKey = normalizeOptionalString(key);
    const normalizedSupplier = normalizeOptionalString(supplierName);
    if (!normalizedKey || !normalizedSupplier) return;

    const current = map.get(normalizedKey) || [];
    if (!current.includes(normalizedSupplier)) {
      current.push(normalizedSupplier);
      map.set(normalizedKey, current);
    }
  };

  contractYears.forEach((contractYear) => {
    const snapshot = readContractsYearSnapshot(contractYear, '/api/contracts/lookup');
    const entries = Array.isArray(snapshot?.data) ? snapshot.data : [];
    entries.forEach((contract) => {
      addSupplier(byControl, contract?.numeroControlePncpCompra, contract?.nomeRazaoSocialFornecedor);
      addSupplier(byProcess, normalizeProcessIdentifier(contract?.processo), contract?.nomeRazaoSocialFornecedor);
    });
  });

  return { byControl, byProcess };
}

function enrichProcurementsWithContractSuppliers(entries = [], fallbackYear = null) {
  const normalizedYear = sanitizeYear(fallbackYear);
  if (!normalizedYear || !Array.isArray(entries) || entries.length === 0) {
    return entries;
  }

  const relevantContractYears = Array.from(
    new Set(
      [normalizedYear, String(Number(normalizedYear) + 1)]
        .filter((year) => /^\d{4}$/.test(year))
    )
  );

  const hasAtLeastOneSnapshot = relevantContractYears.some((year) => fs.existsSync(getContractsFilePath(year)));
  if (!hasAtLeastOneSnapshot) {
    return entries;
  }

  const supplierLookup = buildContractSupplierLookup(relevantContractYears);

  return entries.map((entry) => {
    const supplierNames = [];
    const controlKey = normalizeOptionalString(entry?.numeroControlePNCP);
    const processKey = normalizeProcessIdentifier(entry?.processo);
    const existingCompany = normalizeOptionalString(entry?.empresa);

    if (controlKey && supplierLookup.byControl.has(controlKey)) {
      supplierNames.push(...supplierLookup.byControl.get(controlKey));
    }

    if (processKey && supplierLookup.byProcess.has(processKey)) {
      supplierNames.push(...supplierLookup.byProcess.get(processKey));
    }

    if (existingCompany) {
      supplierNames.push(existingCompany);
    }

    const uniqueSuppliers = Array.from(new Set(supplierNames.filter(Boolean)));
    if (uniqueSuppliers.length === 0) {
      return entry;
    }

    return {
      ...entry,
      empresa: uniqueSuppliers.join('; ')
    };
  });
}

function readProcurementYearSnapshot(year, context = '/api/procurement') {
  const filePath = getProcurementFilePath(year);
  const snapshotData = fs.existsSync(filePath)
    ? readJsonFileSafely(filePath, `${context}/${year}`)
    : null;
  const manualEntries = getManualProcurementEntriesForYear(year);

  if (!snapshotData && manualEntries.length === 0) return null;

  if (!snapshotData) {
    return {
      metadata: {
        extractedAt: manualGovContractsCache?.metadata?.updatedAt || null,
        cnpj: CNPJ_IFES_BSF,
        year: sanitizeYear(year),
        totalPurchases: manualEntries.length,
        source: manualGovContractsCache?.metadata?.source || 'manual_ifes_bsf_site'
      },
      data: enrichProcurementsWithContractSuppliers(manualEntries, year)
    };
  }

  if (manualEntries.length === 0) {
    return {
      ...snapshotData,
      data: enrichProcurementsWithContractSuppliers(Array.isArray(snapshotData?.data) ? snapshotData.data : [], year)
    };
  }

  const mergedMap = new Map();
  const baseEntries = Array.isArray(snapshotData?.data) ? snapshotData.data : [];
  baseEntries.forEach((entry) => {
    mergedMap.set(getProcurementRecordMergeKey(entry, year), entry);
  });

  manualEntries.forEach((entry) => {
    const matchedExistingKey = findExistingProcurementKeyForManualEntry(mergedMap, entry, year);
    const key = matchedExistingKey || getProcurementRecordMergeKey(entry, year);
    const existing = mergedMap.get(key);
    mergedMap.set(key, existing ? mergeProcurementEntries(existing, entry) : entry);
  });

  return {
    ...snapshotData,
    metadata: {
      ...(snapshotData?.metadata || {}),
      totalPurchases: mergedMap.size,
      source: snapshotData?.metadata?.source
        ? `${snapshotData.metadata.source}+${manualGovContractsCache?.metadata?.source || 'manual_ifes_bsf_site'}`
        : (manualGovContractsCache?.metadata?.source || 'manual_ifes_bsf_site')
    },
    data: enrichProcurementsWithContractSuppliers(Array.from(mergedMap.values()), year)
  };
}

/**
 * Sincroniza dados de contrataÃ§Ãµes (compras) do PNCP para os anos especificados
 * Salva em arquivos JSON no diretÃ³rio dados_abertos_compras
 */
async function syncProcurementDataLegacy() {
  const YEARS = ['2022', '2023', '2024', '2025', '2026'];
  console.log(`[${new Date().toISOString()}] ðŸ›’ Iniciando SincronizaÃ§Ã£o de ContrataÃ§Ãµes PNCP...`);

  // Garante que o diretÃ³rio existe
  if (!fs.existsSync(PROCUREMENT_DATA_DIR)) {
    fs.mkdirSync(PROCUREMENT_DATA_DIR, { recursive: true });
  }

  for (const year of YEARS) {
    try {
      console.log(`[PROCUREMENT SYNC] Buscando contrataÃ§Ãµes de ${year}...`);

      let purchases = [];
      let fetchSuccess = false;

      // Tenta mÃºltiplos endpoints
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
            console.log(`[PROCUREMENT SYNC] âœ… Endpoint funcionou: ${url.split('?')[0]}`);
            break;
          }
        } catch (endpointError) {
          // Continua tentando outros endpoints
          continue;
        }
      }

      if (purchases.length > 0) {
        // Para cada compra, buscar os itens detalhados
        console.log(`[PROCUREMENT SYNC] Encontradas ${purchases.length} contrataÃ§Ãµes em ${year}. Buscando itens...`);

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

            // Pequeno delay para nÃ£o sobrecarregar a API
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (itemError) {
            console.warn(`[PROCUREMENT SYNC] âš ï¸ Erro ao buscar itens da compra ${purchase.numeroCompra}:`, itemError.message);
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
        console.log(`[PROCUREMENT SYNC] âœ… Salvo: contratacoes_${year}.json (${purchases.length} contrataÃ§Ãµes)`);
      } else {
        // Verifica se jÃ¡ existe um arquivo local
        const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
        if (fs.existsSync(filePath)) {
          console.log(`[PROCUREMENT SYNC] â„¹ï¸ Usando dados existentes para ${year} (API nÃ£o retornou dados)`);
        } else {
          console.log(`[PROCUREMENT SYNC] â„¹ï¸ Nenhuma contrataÃ§Ã£o encontrada para ${year}`);
        }
      }

      // Delay entre anos para nÃ£o sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Verifica se jÃ¡ existe um arquivo local
        const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
        if (fs.existsSync(filePath)) {
          console.log(`[PROCUREMENT SYNC] â„¹ï¸ API indisponÃ­vel para ${year}, mantendo dados existentes`);
        } else {
          console.log(`[PROCUREMENT SYNC] â„¹ï¸ Nenhuma contrataÃ§Ã£o publicada para ${year} (404)`);
        }
      } else if (error.response && error.response.status === 400) {
        console.error(`[PROCUREMENT SYNC] âš ï¸ RequisiÃ§Ã£o invÃ¡lida para ${year}:`, error.response.data?.message || error.message);
      } else {
        console.error(`[PROCUREMENT SYNC] âŒ Erro ao sincronizar ${year}:`, error.message);
        if (error.response) {
          console.error(`[PROCUREMENT SYNC] Status: ${error.response.status}`);
        }
      }
    }
  }

  console.log(`[PROCUREMENT SYNC] ðŸŽ‰ SincronizaÃ§Ã£o de contrataÃ§Ãµes concluÃ­da!`);
}

async function syncProcurementData() {
  const years = getProcurementYears();
  const currentYear = getCurrentProcurementYear();
  const summary = {
    currentYear,
    syncedYears: [],
    fixedYears: [],
    skippedYears: [],
    errors: []
  };
  console.log(`[${new Date().toISOString()}] [PROCUREMENT SYNC] Iniciando sincronizacao de compras PNCP...`);

  if (!fs.existsSync(PROCUREMENT_DATA_DIR)) {
    fs.mkdirSync(PROCUREMENT_DATA_DIR, { recursive: true });
  }

  for (const year of years) {
    try {
      const filePath = getProcurementFilePath(year);
      const fileExists = fs.existsSync(filePath);
      const shouldSyncYear = year === currentYear;
      const fixedYear = isFixedProcurementYear(year);

      if (!shouldSyncYear && fixedYear) {
        if (fileExists) {
          summary.fixedYears.push(year);
          summary.skippedYears.push({
            year,
            reason: 'snapshot_fixo_historico'
          });
        } else {
          summary.skippedYears.push({
            year,
            reason: 'snapshot_historico_ausente'
          });
        }
        continue;
      }

      console.log(`[PROCUREMENT SYNC] Buscando contratacoes de ${year}...`);
      const { purchases, endpointUsed } = await fetchProcurementsFromPncp(year);
      saveProcurementSnapshot(year, purchases, shouldSyncYear ? 'pncp_live_current_year' : 'pncp_snapshot_historico');
      try {
        await syncContractsYear(year);
      } catch (contractError) {
        console.warn(`[PROCUREMENT SYNC] Falha ao sincronizar contratos/empenhos de ${year}: ${contractError.message}`);
      }
      summary.syncedYears.push({
        year,
        totalPurchases: purchases.length,
        endpointUsed,
        fixedSnapshot: !shouldSyncYear
      });
      await sleep(500);
    } catch (error) {
      const filePath = getProcurementFilePath(year);
      if (fs.existsSync(filePath)) {
        summary.skippedYears.push({
          year,
          reason: 'erro_api_mantendo_snapshot',
          message: error.message
        });
        console.warn(`[PROCUREMENT SYNC] Falha ao sincronizar ${year}. Mantendo snapshot local.`);
      } else {
        summary.errors.push({
          year,
          message: error.message
        });
        console.error(`[PROCUREMENT SYNC] Erro sem snapshot de fallback em ${year}:`, error.message);
      }
    }
  }

  console.log(`[PROCUREMENT SYNC] Finalizado. Anos sincronizados: ${summary.syncedYears.map((i) => i.year).join(', ') || 'nenhum'}`);
  return summary;
}

let procurementSyncPromise = null;
async function runProcurementSyncShared(trigger = 'manual') {
  if (procurementSyncPromise) {
    console.log(`[PROCUREMENT SYNC] Reutilizando sincronizacao em andamento (${trigger}).`);
    return procurementSyncPromise;
  }

  procurementSyncPromise = (async () => {
    try {
      return await syncProcurementData();
    } finally {
      procurementSyncPromise = null;
    }
  })();

  return procurementSyncPromise;
}

const procurementYearSyncPromises = new Map();
async function syncContractsYear(year, source = null) {
  const normalizedYear = sanitizeYear(year);
  if (!normalizedYear || normalizedYear.length !== 4) {
    throw new Error('Ano invalido para sincronizacao de contratos.');
  }

  if (!fs.existsSync(PROCUREMENT_DATA_DIR)) {
    fs.mkdirSync(PROCUREMENT_DATA_DIR, { recursive: true });
  }

  const { contracts, endpointUsed } = await fetchContractsFromPncp(normalizedYear);
  const isCurrent = normalizedYear === getCurrentProcurementYear();
  const finalSource = source || (isCurrent ? 'pncp_contracts_live_current_year' : 'pncp_contracts_snapshot_historico');
  saveContractsSnapshot(normalizedYear, contracts, finalSource);

  return {
    year: normalizedYear,
    totalContracts: contracts.length,
    endpointUsed,
    source: finalSource
  };
}

async function syncProcurementYear(year, source = null) {
  const normalizedYear = sanitizeYear(year);
  if (!normalizedYear || normalizedYear.length !== 4) {
    throw new Error('Ano invalido para sincronizacao.');
  }

  if (!fs.existsSync(PROCUREMENT_DATA_DIR)) {
    fs.mkdirSync(PROCUREMENT_DATA_DIR, { recursive: true });
  }

  const { purchases, endpointUsed } = await fetchProcurementsFromPncp(normalizedYear);
  const isCurrent = normalizedYear === getCurrentProcurementYear();
  const finalSource = source || (isCurrent ? 'pncp_live_current_year' : 'pncp_snapshot_historico');
  saveProcurementSnapshot(normalizedYear, purchases, finalSource);
  try {
    await syncContractsYear(normalizedYear);
  } catch (contractError) {
    console.warn(`[PROCUREMENT SYNC] Falha ao sincronizar contratos/empenhos de ${normalizedYear}: ${contractError.message}`);
  }

  return {
    year: normalizedYear,
    totalPurchases: purchases.length,
    endpointUsed,
    source: finalSource
  };
}

async function runProcurementYearSyncShared(year, trigger = 'manual-year') {
  const normalizedYear = sanitizeYear(year);
  if (!normalizedYear || normalizedYear.length !== 4) {
    throw new Error('Ano invalido para sincronizacao.');
  }

  if (procurementYearSyncPromises.has(normalizedYear)) {
    console.log(`[PROCUREMENT SYNC] Reutilizando sincronizacao em andamento para ${normalizedYear} (${trigger}).`);
    return procurementYearSyncPromises.get(normalizedYear);
  }

  const promise = (async () => {
    try {
      return await syncProcurementYear(normalizedYear);
    } finally {
      procurementYearSyncPromises.delete(normalizedYear);
    }
  })();

  procurementYearSyncPromises.set(normalizedYear, promise);
  return promise;
}

async function performAutomaticSync() {
  // Sync PCA data
  const YEARS_MAP = { '2026': '12', '2025': '12', '2024': '15', '2023': '14', '2022': '20' };
  console.log(`[${new Date().toISOString()}] ðŸš€ Iniciando SincronizaÃ§Ã£o PNCP (PCA)...`);
  for (const [year, seq] of Object.entries(YEARS_MAP)) {
    try {
      const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ_IFES_BSF}/pca/${year}/${seq}/itens?pagina=1&tamanhoPagina=1000`;
      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = response.data.data || (Array.isArray(response.data) ? response.data : []);
      if (data.length > 0) {
        if (!fs.existsSync(PUBLIC_DATA_DIR)) fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
        const filePath = path.join(PUBLIC_DATA_DIR, `pca_${year}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ data, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[PCA SYNC] âœ… Salvo: pca_${year}.json (${data.length} itens)`);
      } else {
        console.log(`[PCA SYNC] â„¹ï¸ Nenhum item encontrado para ${year}`);
      }
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`[PCA SYNC] â„¹ï¸ PCA ${year} ainda nÃ£o publicado no PNCP (404)`);
      } else {
        console.error(`[PCA SYNC] âŒ Erro ao sincronizar PCA ${year}:`, error.message);
      }
    }
  }

  // Sync Procurement/Contracting data
  await runProcurementSyncShared('automatic');
}

import { onRequest } from "firebase-functions/v2/https";

// Exporta como Cloud Function (Gen 2) com memÃ³ria ajustada para Puppeteer
export const api = onRequest({
  memory: '2GiB',
  timeoutSeconds: 300,
  region: 'us-central1',
  invoker: 'public'
}, app);

// Endpoint para ler dados brutos da integraÃ§Ã£o Compras.gov/PNCP (Legacy - mantido para compatibilidade)
app.get('/api/integration/procurement-data', async (req, res) => {
  try {
    const COMPRAS_GOV_PATH = path.join(PROCUREMENT_DATA_DIR, 'compras_gov_result.json');
    if (fs.existsSync(COMPRAS_GOV_PATH)) {
      const data = JSON.parse(fs.readFileSync(COMPRAS_GOV_PATH, 'utf8'));
      return res.json(data);
    }
    res.status(404).json({ error: 'Arquivo de integraÃ§Ã£o nÃ£o encontrado' });
  } catch (error) {
    console.error('[INTEGRATION DATA ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obter dados de contrataÃ§Ãµes de um ano especÃ­fico
app.get('/api/procurement-legacy/year/:year', async (req, res) => {
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
      error: `Dados de contrataÃ§Ãµes para ${year} nÃ£o encontrados`,
      message: 'Execute a sincronizaÃ§Ã£o primeiro usando /api/procurement/sync'
    });
  } catch (error) {
    console.error('[PROCUREMENT DATA ERROR]', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obter todos os dados de contrataÃ§Ãµes (todos os anos)
app.get('/api/procurement-legacy/all', async (req, res) => {
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

// Endpoint para forÃ§ar sincronizaÃ§Ã£o manual
app.post('/api/procurement-legacy/sync', async (req, res) => {
  try {
    console.log('[MANUAL SYNC] Iniciando sincronizaÃ§Ã£o manual de contrataÃ§Ãµes...');
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

// --- MÃ“DULO GOOGLE DE COMPRAS IFES ---

app.get('/api/procurement/year/:year', async (req, res) => {
  try {
    const year = sanitizeYear(req.params.year);
    if (!year || year.length !== 4) {
      return res.status(400).json({ error: 'Ano invalido.' });
    }

    let data = readProcurementYearSnapshot(year, '/api/procurement/year');
    if (!data && year === getCurrentProcurementYear()) {
      await runProcurementSyncShared('procurement-year-endpoint');
      data = readProcurementYearSnapshot(year, '/api/procurement/year');
    }

    if (data) {
      return res.json(data);
    }

    return res.status(404).json({
      error: `Dados de contratacoes para ${year} nao encontrados`,
      message: 'Execute a sincronizacao primeiro usando /api/procurement/sync'
    });
  } catch (error) {
    console.error('[PROCUREMENT DATA ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement/all', async (req, res) => {
  try {
    const years = getProcurementYears();
    const allData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        cnpj: CNPJ_IFES_BSF,
        years,
        skippedYears: []
      },
      data: []
    };

    for (const year of years) {
      const yearData = readProcurementYearSnapshot(year, '/api/procurement/all');
      if (Array.isArray(yearData?.data)) {
        allData.data.push(...yearData.data);
      } else {
        allData.metadata.skippedYears.push(year);
      }
    }

    return res.json(allData);
  } catch (error) {
    console.error('[PROCUREMENT ALL DATA ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/procurement/status', async (req, res) => {
  try {
    return res.json(getProcurementSyncStatus());
  } catch (error) {
    console.error('[PROCUREMENT STATUS ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/procurement/sync', async (req, res) => {
  try {
    console.log('[MANUAL SYNC] Iniciando sincronizacao manual de contratacoes...');
    const syncSummary = await runProcurementSyncShared('manual-endpoint');
    const status = getProcurementSyncStatus();
    return res.json({
      ok: true,
      syncSummary,
      status
    });
  } catch (error) {
    console.error('[PROCUREMENT MANUAL SYNC ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-process-registry', async (req, res) => {
  try {
    const linkedOnly = String(req.query.linkedOnly || '').toLowerCase() === 'true' || String(req.query.linkedOnly || '') === '1';
    const executionLookup = await getExecutionProcessLookup();
    const registry = buildGovProcessRegistry(executionLookup);
    const data = linkedOnly ? registry.filter((item) => item.executionLinked) : registry;

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        totalRecords: data.length,
        totalLinkedToExecution: data.filter((item) => item.executionLinked).length,
        totalWithProcurement: data.filter((item) => item.procurementCount > 0).length,
        totalWithInstrument: data.filter((item) => item.instrumentCount > 0).length
      },
      data
    });
  } catch (error) {
    console.error('[GOV PROCESS REGISTRY ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contracts/modalities', async (req, res) => {
  try {
    const requestedYear = sanitizeYear(req.query.year || getCurrentProcurementYear());
    const year = requestedYear.length === 4 ? requestedYear : getCurrentProcurementYear();
    const modalityType = String(req.query.type || 'all');
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';
    let syncWarning = null;

    if (!MODALITY_TYPES.has(modalityType)) {
      return res.status(400).json({ error: 'Tipo de modalidade invalido.' });
    }

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(year, 'gov-contracts-force-sync');
      } catch (error) {
        syncWarning = `Falha ao sincronizar ${year}: ${error?.message || error}`;
      }
    }

    let yearData = readProcurementYearSnapshot(year, '/api/gov-contracts/modalities');
    const isCurrentYear = year === getCurrentProcurementYear();
    if (!yearData && isCurrentYear && forceSync) {
      await runProcurementYearSyncShared(year, 'gov-contracts-retry');
      yearData = readProcurementYearSnapshot(year, '/api/gov-contracts/modalities');
    }

    if (!yearData) {
      if (isCurrentYear) {
        // Avoid hard-failing the dashboard when current-year snapshot is not available yet.
        runProcurementYearSyncShared(year, 'gov-contracts-background').catch((err) => {
          console.error('[GOV CONTRACTS BACKGROUND SYNC ERROR]', err?.message || err);
        });
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            currentYear: getCurrentProcurementYear(),
            fixedSnapshot: false,
            source: null,
            extractedAt: null,
            totalRawPurchases: 0,
            totalModalityRecords: 0,
            totalHomologado: 0,
            semHomologacao: 0,
            modalityType,
            warning: syncWarning || 'Snapshot do ano atual ainda nao disponivel. Sincronizacao em andamento.'
          },
          data: []
        });
      }

      if (isFixedProcurementYear(year)) {
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            currentYear: getCurrentProcurementYear(),
            fixedSnapshot: true,
            source: null,
            extractedAt: null,
            totalRawPurchases: 0,
            totalModalityRecords: 0,
            totalHomologado: 0,
            semHomologacao: 0,
            modalityType,
            warning: syncWarning || `Snapshot historico de ${year} ainda nao disponivel. Use sync=1 para carregar e fixar.`
          },
          data: []
        });
      }

      return res.status(404).json({ error: `Sem snapshot para o ano ${year}.` });
    }

    const rawPurchases = Array.isArray(yearData?.data) ? yearData.data : [];
    const executionLookup = await getExecutionProcessLookup();
    const data = buildGovModalityPayload(rawPurchases, modalityType).map((item) => ({
      ...item,
      ...buildExecutionLinkStatus(item.numeroProcesso, executionLookup)
    }));
    const totalHomologado = data.reduce((acc, item) => acc + Number(item.valorHomologado || 0), 0);
    const semHomologacao = data.filter((item) => !item.temValorHomologado).length;

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        year,
        currentYear: getCurrentProcurementYear(),
        fixedSnapshot: isFixedProcurementYear(year),
        source: yearData?.metadata?.source || null,
        extractedAt: yearData?.metadata?.extractedAt || null,
        totalRawPurchases: rawPurchases.length,
        totalModalityRecords: data.length,
        totalHomologado,
        semHomologacao,
        modalityType,
        warning: syncWarning || yearData?.metadata?.warning || undefined
      },
      data
    });
  } catch (error) {
    console.error('[GOV CONTRACTS MODALITIES ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contracts/detail', async (req, res) => {
  try {
    const requestedYear = sanitizeYear(req.query.year || getCurrentProcurementYear());
    const year = requestedYear.length === 4 ? requestedYear : getCurrentProcurementYear();
    const numeroControlePNCP = String(req.query.numeroControlePNCP || '').trim();
    const requestedSequencial = String(req.query.sequencialCompra || '').replace(/[^\d]/g, '');
    const requestedNumeroProcesso = String(req.query.numeroProcesso || '').trim();
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';

    if (!numeroControlePNCP && !requestedSequencial && !requestedNumeroProcesso) {
      return res.status(400).json({
        error: 'Informe numeroControlePNCP, sequencialCompra ou numeroProcesso para buscar o detalhamento.'
      });
    }

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(year, 'gov-contracts-detail-force-sync');
      } catch (error) {
        console.warn(`[GOV CONTRACTS DETAIL] Falha ao sincronizar ${year}: ${error?.message || error}`);
      }
    }

    const yearData = readProcurementYearSnapshot(year, '/api/gov-contracts/detail');
    if (!yearData) {
      if (year === getCurrentProcurementYear()) {
        runProcurementYearSyncShared(year, 'gov-contracts-detail-background').catch((err) => {
          console.error('[GOV CONTRACTS DETAIL BACKGROUND SYNC ERROR]', err?.message || err);
        });
      }
      return res.status(404).json({
        error: `Snapshot de ${year} nao encontrado.`,
        message: 'Use sync=1 para sincronizar este ano e tente novamente.'
      });
    }

    const purchases = Array.isArray(yearData?.data) ? yearData.data : [];
    const matchedPurchase = purchases.find((purchase) => {
      const purchaseControl = String(purchase?.numeroControlePNCP || '').trim();
      const purchaseSequencial = extractPurchaseSequential(purchase);
      const purchaseProcesso = String(purchase?.processo || '').trim();
      if (numeroControlePNCP && purchaseControl === numeroControlePNCP) return true;
      if (requestedSequencial && purchaseSequencial === requestedSequencial) return true;
      if (requestedNumeroProcesso && purchaseProcesso === requestedNumeroProcesso) return true;
      return false;
    });

    if (!matchedPurchase) {
      return res.status(404).json({
        error: 'Contratacao nao encontrada no snapshot informado.',
        criteria: {
          year,
          numeroControlePNCP: numeroControlePNCP || null,
          sequencialCompra: requestedSequencial || null,
          numeroProcesso: requestedNumeroProcesso || null
        }
      });
    }

    const lookupYear = extractPurchaseYear(matchedPurchase, year);
    const lookupSequencial = extractPurchaseSequential(matchedPurchase) || requestedSequencial || null;

    let remoteDetail = null;
    let remoteDetailError = null;
    if (lookupYear && lookupSequencial) {
      try {
        remoteDetail = await fetchProcurementDetailFromPncp(lookupYear, lookupSequencial);
      } catch (error) {
        remoteDetailError = error?.response?.data?.message || error?.message || String(error);
      }
    } else {
      remoteDetailError = 'Nao foi possivel identificar ano/sequencial para consulta de detalhe no PNCP.';
    }

    const executionLookup = await getExecutionProcessLookup();
    const detailPayload = await buildGovContractDetailPayload(matchedPurchase, remoteDetail, year);

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        year,
        fixedSnapshot: isFixedProcurementYear(year),
        extractedAt: yearData?.metadata?.extractedAt || null,
        source: yearData?.metadata?.source || null,
        remoteDetailUsed: !!remoteDetail,
        remoteDetailError: remoteDetailError || undefined
      },
      data: {
        ...detailPayload,
        ...buildExecutionLinkStatus(detailPayload.numeroProcesso, executionLookup)
      }
    });
  } catch (error) {
    console.error('[GOV CONTRACTS DETAIL ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contracts/summary', async (req, res) => {
  try {
    const requestedYear = sanitizeYear(req.query.year || getCurrentProcurementYear());
    const year = requestedYear.length === 4 ? requestedYear : getCurrentProcurementYear();
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';
    let syncWarning = null;

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(year, 'gov-contracts-summary-force-sync');
      } catch (error) {
        syncWarning = `Falha ao sincronizar ${year}: ${error?.message || error}`;
      }
    }

    const yearData = readProcurementYearSnapshot(year, '/api/gov-contracts/summary');
    if (!yearData) {
      if (year === getCurrentProcurementYear()) {
        runProcurementYearSyncShared(year, 'gov-contracts-summary-background').catch((err) => {
          console.error('[GOV CONTRACTS SUMMARY BACKGROUND SYNC ERROR]', err?.message || err);
        });
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            fixedSnapshot: false,
            extractedAt: null,
            warning: syncWarning || 'Snapshot do ano atual ainda nao disponivel.'
          },
          summary: Object.keys(MODALITY_LABELS).map((modalityCode) => ({
            modalidadeCodigo: modalityCode,
            modalidade: MODALITY_LABELS[modalityCode],
            total: 0,
            totalHomologado: 0
          }))
        });
      }

      if (isFixedProcurementYear(year)) {
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            fixedSnapshot: true,
            extractedAt: null,
            warning: syncWarning || `Snapshot historico de ${year} ainda nao disponivel. Use sync=1 para carregar e fixar.`
          },
          summary: Object.keys(MODALITY_LABELS).map((modalityCode) => ({
            modalidadeCodigo: modalityCode,
            modalidade: MODALITY_LABELS[modalityCode],
            total: 0,
            totalHomologado: 0
          }))
        });
      }

      return res.status(404).json({ error: `Sem snapshot para o ano ${year}.` });
    }

    const records = buildGovModalityPayload(Array.isArray(yearData?.data) ? yearData.data : [], 'all');
    const summaryByModality = Object.keys(MODALITY_LABELS).map((modalityCode) => {
      const filtered = records.filter((item) => item.modalidadeCodigo === modalityCode);
      return {
        modalidadeCodigo: modalityCode,
        modalidade: MODALITY_LABELS[modalityCode],
        total: filtered.length,
        totalHomologado: filtered.reduce((acc, item) => acc + Number(item.valorHomologado || 0), 0)
      };
    });

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        year,
        fixedSnapshot: isFixedProcurementYear(year),
        extractedAt: yearData?.metadata?.extractedAt || null,
        warning: syncWarning || yearData?.metadata?.warning || undefined
      },
      summary: summaryByModality
    });
  } catch (error) {
    console.error('[GOV CONTRACTS SUMMARY ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contract-instruments', async (req, res) => {
  try {
    const requestedYear = sanitizeYear(req.query.year || getCurrentProcurementYear());
    const year = requestedYear.length === 4 ? requestedYear : getCurrentProcurementYear();
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';
    let syncWarning = null;

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(year, 'gov-contract-instruments-force-sync');
      } catch (error) {
        syncWarning = `Falha ao sincronizar ${year}: ${error?.message || error}`;
      }
    }

    let yearData = readContractsYearSnapshot(year, '/api/gov-contract-instruments');
    const isCurrentYear = year === getCurrentProcurementYear();

    if (!yearData && isCurrentYear && forceSync) {
      await runProcurementYearSyncShared(year, 'gov-contract-instruments-retry');
      yearData = readContractsYearSnapshot(year, '/api/gov-contract-instruments');
    }

    if (!yearData) {
      if (isCurrentYear) {
        runProcurementYearSyncShared(year, 'gov-contract-instruments-background').catch((err) => {
          console.error('[GOV CONTRACT INSTRUMENTS BACKGROUND SYNC ERROR]', err?.message || err);
        });
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            currentYear: getCurrentProcurementYear(),
            fixedSnapshot: false,
            source: null,
            extractedAt: null,
            totalRawContracts: 0,
            totalRecords: 0,
            totalVigentes: 0,
            totalEmpenhos: 0,
            totalContratos: 0,
            totalValorGlobal: 0,
            warning: syncWarning || 'Snapshot do ano atual ainda nao disponivel. Sincronizacao em andamento.'
          },
          data: []
        });
      }

      if (isFixedProcurementYear(year)) {
        return res.json({
          metadata: {
            generatedAt: new Date().toISOString(),
            year,
            currentYear: getCurrentProcurementYear(),
            fixedSnapshot: true,
            source: null,
            extractedAt: null,
            totalRawContracts: 0,
            totalRecords: 0,
            totalVigentes: 0,
            totalEmpenhos: 0,
            totalContratos: 0,
            totalValorGlobal: 0,
            warning: syncWarning || `Snapshot historico de contratos/empenhos de ${year} ainda nao disponivel.`
          },
          data: []
        });
      }

      return res.status(404).json({ error: `Sem snapshot de contratos/empenhos para o ano ${year}.` });
    }

    const rawContracts = Array.isArray(yearData?.data) ? yearData.data : [];
    const procurementLookup = buildProcurementLookupForYears([year, String(Number(year) - 1), String(Number(year) + 1)]);
    const executionLookup = await getExecutionProcessLookup();
    const records = rawContracts.map((contract) => ({
      ...buildGovContractInstrumentRecord(contract, procurementLookup, year),
      ...buildExecutionLinkStatus(contract?.processo, executionLookup)
    }));

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        year,
        currentYear: getCurrentProcurementYear(),
        fixedSnapshot: isFixedProcurementYear(year),
        source: yearData?.metadata?.source || null,
        extractedAt: yearData?.metadata?.extractedAt || null,
        totalRawContracts: rawContracts.length,
        totalRecords: records.length,
        totalVigentes: records.filter((item) => item.vigente).length,
        totalEmpenhos: records.filter((item) => item.tipoInstrumentoCodigo === 'EMPENHO').length,
        totalContratos: records.filter((item) => item.tipoInstrumentoCodigo === 'CONTRATO').length,
        totalValorGlobal: records.reduce((acc, item) => acc + Number(item.valorGlobal || 0), 0),
        warning: syncWarning || yearData?.metadata?.warning || undefined
      },
      data: records
    });
  } catch (error) {
    console.error('[GOV CONTRACT INSTRUMENTS ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contract-instruments/vigentes', async (req, res) => {
  try {
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';
    let syncWarning = null;

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(getCurrentProcurementYear(), 'gov-contract-instruments-vigentes-force-sync');
      } catch (error) {
        syncWarning = `Falha ao sincronizar ${getCurrentProcurementYear()}: ${error?.message || error}`;
      }
    }

    const years = getContractSnapshotYears();
    const availableYears = years.filter((year) => fs.existsSync(getContractsFilePath(year)));

    if (availableYears.length === 0) {
      runProcurementYearSyncShared(getCurrentProcurementYear(), 'gov-contract-instruments-vigentes-background').catch((err) => {
        console.error('[GOV CONTRACT VIGENTES BACKGROUND SYNC ERROR]', err?.message || err);
      });

      return res.json({
        metadata: {
          generatedAt: new Date().toISOString(),
          currentYear: getCurrentProcurementYear(),
          sourceYears: [],
          source: null,
          extractedAt: null,
          totalRawContracts: 0,
          totalRecords: 0,
          totalEmpenhos: 0,
          totalContratos: 0,
          totalValorGlobal: 0,
          warning: syncWarning || 'Nenhum snapshot de contratos/empenhos disponivel no momento.'
        },
        data: []
      });
    }

    const procurementLookup = buildProcurementLookupForYears(getProcurementYears());
    const executionLookup = await getExecutionProcessLookup();
    const consolidatedRecords = [];
    const latestExtractedAt = [];
    const sourceNames = new Set();

    availableYears.forEach((year) => {
      const yearData = readContractsYearSnapshot(year, '/api/gov-contract-instruments/vigentes');
      const rawContracts = Array.isArray(yearData?.data) ? yearData.data : [];
      if (yearData?.metadata?.extractedAt) {
        latestExtractedAt.push(yearData.metadata.extractedAt);
      }
      if (yearData?.metadata?.source) {
        sourceNames.add(yearData.metadata.source);
      }

      rawContracts.forEach((contract) => {
        const record = {
          ...buildGovContractInstrumentRecord(contract, procurementLookup, year),
          ...buildExecutionLinkStatus(contract?.processo, executionLookup)
        };
        if (record.vigente) {
          consolidatedRecords.push(record);
        }
      });
    });

    const uniqueRecords = Array.from(
      new Map(
        consolidatedRecords.map((record) => {
          const key = [
            normalizeOptionalString(record?.numeroControlePNCP),
            normalizeOptionalString(record?.numeroInstrumento),
            normalizeOptionalString(record?.numeroProcesso),
            normalizeOptionalString(record?.empresa)
          ].join('|');
          return [key, record];
        })
      ).values()
    );

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        currentYear: getCurrentProcurementYear(),
        sourceYears: availableYears,
        source: Array.from(sourceNames).join('+') || null,
        extractedAt: latestExtractedAt.sort().at(-1) || null,
        totalRawContracts: consolidatedRecords.length,
        totalRecords: uniqueRecords.length,
        totalEmpenhos: uniqueRecords.filter((item) => item.tipoInstrumentoCodigo === 'EMPENHO').length,
        totalContratos: uniqueRecords.filter((item) => item.tipoInstrumentoCodigo === 'CONTRATO').length,
        totalValorGlobal: uniqueRecords.reduce((acc, item) => acc + Number(item.valorGlobal || 0), 0),
        warning: syncWarning || undefined
      },
      data: uniqueRecords
    });
  } catch (error) {
    console.error('[GOV CONTRACT INSTRUMENTS VIGENTES ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/gov-contract-instruments/detail', async (req, res) => {
  try {
    const requestedYear = sanitizeYear(req.query.year || getCurrentProcurementYear());
    const year = requestedYear.length === 4 ? requestedYear : getCurrentProcurementYear();
    const numeroControlePNCP = String(req.query.numeroControlePNCP || '').trim();
    const requestedNumeroProcesso = String(req.query.numeroProcesso || '').trim();
    const requestedNumeroInstrumento = String(req.query.numeroInstrumento || '').trim();
    const forceSync = String(req.query.sync || '').toLowerCase() === 'true' || String(req.query.sync || '') === '1';

    if (!numeroControlePNCP && !requestedNumeroProcesso && !requestedNumeroInstrumento) {
      return res.status(400).json({
        error: 'Informe numeroControlePNCP, numeroProcesso ou numeroInstrumento para buscar o detalhamento.'
      });
    }

    if (forceSync) {
      try {
        await runProcurementYearSyncShared(year, 'gov-contract-instruments-detail-force-sync');
      } catch (error) {
        console.warn(`[GOV CONTRACT INSTRUMENT DETAIL] Falha ao sincronizar ${year}: ${error?.message || error}`);
      }
    }

    const yearData = readContractsYearSnapshot(year, '/api/gov-contract-instruments/detail');
    if (!yearData) {
      if (year === getCurrentProcurementYear()) {
        runProcurementYearSyncShared(year, 'gov-contract-instruments-detail-background').catch((err) => {
          console.error('[GOV CONTRACT INSTRUMENT DETAIL BACKGROUND SYNC ERROR]', err?.message || err);
        });
      }
      return res.status(404).json({
        error: `Snapshot de contratos/empenhos de ${year} nao encontrado.`
      });
    }

    const contracts = Array.isArray(yearData?.data) ? yearData.data : [];
    const matchedContract = contracts.find((contract) => {
      const contractControl = String(contract?.numeroControlePNCP || '').trim();
      const contractProcess = String(contract?.processo || '').trim();
      const contractNumber = String(contract?.numeroContratoEmpenho || '').trim();

      if (numeroControlePNCP && contractControl === numeroControlePNCP) return true;
      if (requestedNumeroProcesso && contractProcess === requestedNumeroProcesso) return true;
      if (requestedNumeroInstrumento && contractNumber === requestedNumeroInstrumento) return true;
      return false;
    });

    if (!matchedContract) {
      return res.status(404).json({
        error: 'Instrumento nao encontrado no snapshot informado.',
        criteria: {
          year,
          numeroControlePNCP: numeroControlePNCP || null,
          numeroProcesso: requestedNumeroProcesso || null,
          numeroInstrumento: requestedNumeroInstrumento || null
        }
      });
    }

    const procurementLookup = buildProcurementLookupForYears([year, String(Number(year) - 1), String(Number(year) + 1)]);
    const executionLookup = await getExecutionProcessLookup();
    const detailPayload = await buildGovContractInstrumentDetailPayload(matchedContract, procurementLookup, year);

    return res.json({
      metadata: {
        generatedAt: new Date().toISOString(),
        year,
        fixedSnapshot: isFixedProcurementYear(year),
        extractedAt: yearData?.metadata?.extractedAt || null,
        source: yearData?.metadata?.source || null
      },
      data: {
        ...detailPayload,
        ...buildExecutionLinkStatus(detailPayload.numeroProcesso, executionLookup)
      }
    });
  } catch (error) {
    console.error('[GOV CONTRACT INSTRUMENT DETAIL ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
});

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
    fuzzy: 0.2, // Permite erros de digitaÃ§Ã£o (Levenshtein distance)
    prefix: true // Permite busca por prefixo ("cade" acha "cadeira")
  }
});
let IS_CATALOG_LOADED = false;

/**
 * Loads and processes catalog items from all available sources into memory.
 * Implementa AGREGACAO INTELIGENTE: Itens com mesmo CATMAT sÃ£o agrupados para estatÃ­sticas.
 */
function loadCatalogIntoMemory() {
  console.log('[CATALOG LOAD] Iniciando carregamento do catÃ¡logo com IndexaÃ§Ã£o Inteligente...');
  const startTime = Date.now();
  const tempMap = new Map(); // Map temporÃ¡rio para agregaÃ§Ã£o (Chave: CATMAT/CÃ³digo Ãšnico)

  // FunÃ§Ã£o auxiliar para normalizar e agregar itens
  const processAndAggregateItem = (sourceItem, sourceName, weightBoost = 0) => {
    // NormalizaÃ§Ã£o de campos
    let catmat = String(sourceItem.codigo_catmat || sourceItem.codigo_catmat_completo || sourceItem.codigoItem || sourceItem.codigo_item || '').trim();
    if (!catmat || catmat === 'undefined') return;

    // Padronizar ID como apenas nÃºmeros e hÃ­fens
    const normalizedId = catmat.replace(/\//g, '-');

    const desc = (sourceItem.descricao_resumida || sourceItem.descricao || sourceItem.descricao_busca || '').toUpperCase();
    const descTec = (sourceItem.descricao_detalhada || sourceItem.descricao_tecnica || sourceItem.descricao || '').toUpperCase();
    const price = parseFloat(sourceItem.valor_unitario || sourceItem.valorUnitario || sourceItem.valor_referencia || 0);
    const unit = (sourceItem.unidade_fornecimento || sourceItem.unidadeFornecimento || sourceItem.unidade_padrao || 'UNIDADE').toUpperCase();

    // Filtros de qualidade bÃ¡sica
    if (price <= 0 || unit === '-' || !desc) return;

    if (!tempMap.has(normalizedId)) {
      // Novo Item no CatÃ¡logo Mestre
      tempMap.set(normalizedId, {
        id: normalizedId,
        codigo_catmat_completo: catmat,
        familia_id: catmat.split('-')[0] || '0000',
        tipo_item: (sourceItem.tipo || sourceItem.nomeClassificacao === 'ServiÃ§o') ? 'SERVICO' : 'MATERIAL',
        descricao_busca: desc,
        descricao_tecnica: descTec,
        unidade_padrao: unit,
        valor_referencia: price,
        frequencia_uso: 1 + weightBoost,
        uasg_origem_exemplo: sourceItem.uasg_nome || sourceItem.nomeUnidade || sourceItem.unidadeOrgaoNomeUnidade || sourceName,

        // Dados estatÃ­sticos para agregaÃ§Ã£o
        stats: {
          price_sum: price,
          price_count: 1,
          min_price: price,
          max_price: price,
          sources: [sourceName]
        },
        // Set de descriÃ§Ãµes para indexaÃ§Ã£o rica
        all_descriptions: new Set([desc, descTec])
      });
    } else {
      // Item existente: Agregar dados
      const existing = tempMap.get(normalizedId);

      // Atualizar estatÃ­sticas de preÃ§o
      existing.stats.price_sum += price;
      existing.stats.price_count += 1;
      existing.stats.min_price = Math.min(existing.stats.min_price, price);
      existing.stats.max_price = Math.max(existing.stats.max_price, price);

      // Atualizar valor de referÃªncia (MÃ©dia)
      existing.valor_referencia = existing.stats.price_sum / existing.stats.price_count;

      // Incrementar relevÃ¢ncia
      existing.frequencia_uso += (1 + weightBoost);

      // Adicionar fonte se nova
      if (!existing.stats.sources.includes(sourceName)) {
        existing.stats.sources.push(sourceName);
      }

      // Enriquecer descriÃ§Ãµes para busca
      existing.all_descriptions.add(desc);
      existing.all_descriptions.add(descTec);

      // Se a nova descriÃ§Ã£o tÃ©cnica for maior/melhor, usamos ela como principal para exibiÃ§Ã£o
      if (descTec.length > existing.descricao_tecnica.length) {
        existing.descricao_tecnica = descTec;
      }
    }
  };

  // 1. Carrega HistÃ³rico Base (Peso 1)
  if (fs.existsSync(CATALOGO_DOC_PATH)) {
    try {
      const rawData = JSON.parse(fs.readFileSync(CATALOGO_DOC_PATH, 'utf8'));
      (rawData.historico || []).forEach(item => processAndAggregateItem(item, 'HISTORICO_BASE', 0));
    } catch (e) { console.error('[CATALOG LOAD] Erro histÃ³rico:', e.message); }
  }

  // 2. Carrega PCA (Peso 2 - Planejamento recente Ã© relevante)
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

  // 3. Carrega ContrataÃ§Ãµes Recentes (Peso 3 - Compras reais recentes sÃ£o muito relevantes)
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
      } catch (e) { console.error('[CATALOG LOAD] Erro ContrataÃ§Ãµes:', e.message); }
  }

  // FinalizaÃ§Ã£o: Prepara objetos para Cache e IndexaÃ§Ã£o
  CATALOG_MAP = tempMap;
  CACHED_CATALOG = Array.from(tempMap.values()).map(item => {
    // Flatten para o frontend e cria campo keywords para o MiniSearch
    item.keywords = Array.from(item.all_descriptions).join(' ');
    delete item.all_descriptions; // Limpa memÃ³ria
    return item;
  });

  // Reconstruir Ãndice de Busca
  MINI_SEARCH.removeAll();
  MINI_SEARCH.addAll(CACHED_CATALOG);

  IS_CATALOG_LOADED = true;
  const duration = (Date.now() - startTime) / 1000;
  console.log(`[CATALOG LOAD] IndexaÃ§Ã£o concluÃ­da em ${duration}s. Itens Ãºnicos (Agrupados): ${CACHED_CATALOG.length}`);
}

// Initial load
loadCatalogIntoMemory();

/**
 * Importa e higieniza os dados do JSON para o Firestore
 */
app.post('/api/catalog/import', async (req, res) => {
  if (!db_admin) return res.status(500).json({ error: 'Firebase Admin nÃ£o inicializado' });

  try {
    if (!fs.existsSync(CATALOGO_DOC_PATH)) {
      return res.status(404).json({ error: 'Arquivo histÃ³rico nÃ£o encontrado para importaÃ§Ã£o.' });
    }

    const rawData = JSON.parse(fs.readFileSync(CATALOGO_DOC_PATH, 'utf8'));
    const items = rawData.historico || [];

    console.log(`[CATALOG IMPORT] Iniciando processamento de ${items.length} itens...`);

    const catalogMap = new Map();

    for (const item of items) {
      // 1. SanitizaÃ§Ã£o (Filtros de Qualidade)
      if (!item.valor_unitario || item.valor_unitario <= 0) continue;
      if (!item.unidade_fornecimento || item.unidade_fornecimento === "-" || item.unidade_fornecimento.trim() === "") continue;

      const catmatCompleto = item.codigo_catmat;
      const familiaId = catmatCompleto.split('-')[0];

      if (catalogMap.has(catmatCompleto)) {
        // 2. DeduplicaÃ§Ã£o Inteligente (Ranking)
        const existing = catalogMap.get(catmatCompleto);
        existing.frequencia_uso += 1;
        // MÃ©dia ponderada simplificada ou apenas manter a mÃ©dia
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

    console.log(`[CATALOG IMPORT] SanitizaÃ§Ã£o concluÃ­da. ${catalogMap.size} itens Ãºnicos para salvar.`);

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

  // Garante que o Ã­ndice estÃ¡ carregado
  if (!IS_CATALOG_LOADED) {
    console.warn('[CATALOG SEARCH] Ãndice nÃ£o carregado. Tentando carregar agora...');
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

    // 2. Fallback: Se nÃ£o achar nada, tenta 'OR' para achar pelo menos um dos termos
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

    // 3. HidrataÃ§Ã£o dos resultados (Recupera objetos completos)
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

    if (!itemData) return res.status(404).json({ error: 'Item nÃ£o encontrado no catÃ¡logo' });

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

    // Tenta salvar no Firestore se disponÃ­vel
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
        console.warn('[CART] Firestore indisponÃ­vel para consulta do carrinho.');
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

// Executa servidor local apenas se NÃƒO estivermos no ambiente Cloud Functions
if (!process.env.FUNCTION_TARGET && !process.env.FIREBASE_CONFIG) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);

    // Executa sincronizaÃ§Ã£o inicial apÃ³s 5 segundos (dÃ¡ tempo do servidor iniciar completamente)
    setTimeout(() => {
      console.log('[AUTO SYNC] Iniciando sincronizaÃ§Ã£o automÃ¡tica...');
      performAutomaticSync().catch(err => {
        console.error('[AUTO SYNC ERROR]', err);
      });
    }, 5000);

    // SincronizaÃ§Ã£o periÃ³dica a cada 6 horas (21600000 ms)
    setInterval(() => {
      console.log('[PERIODIC SYNC] Executando sincronizaÃ§Ã£o periÃ³dica...');
      performAutomaticSync().catch(err => {
        console.error('[PERIODIC SYNC ERROR]', err);
      });
    }, 21600000); // 6 horas
  });
}

setInterval(() => { }, 60000);
