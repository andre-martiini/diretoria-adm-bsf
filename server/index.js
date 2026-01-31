
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis de ambiente
dotenv.config({ path: path.join(__dirname, 'deploy.env') });
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, '..', 'serviceAccountKey.json');

import { scrapeSIPACProcess, scrapeSIPACDocumentContent, downloadSIPACDocument } from './sipacService.js';
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
      // Create a unique ID for the document based on order and type
      const docId = `${doc.ordem}-${doc.tipo.replace(/\//g, '-')}`;

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
      }, { merge: true });

      console.log(`[DATA SYNC] ✅ Metadados salvos: #${doc.ordem} - ${doc.tipo}`);

    } catch (err) {
      console.error(`[DATA SYNC] ❌ Erro ao salvar metadados do documento ${doc.ordem}:`, err.message);
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

// Endpoint para itens PNCP
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
    res.status(500).json({ error: 'Falha ao obter documento: ' + error.message });
  }
});

// Endpoint para conteúdo de documento (HTML/Texto)
app.get('/api/sipac/documento/conteudo', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL é obrigatória' });

    try {
        const text = await scrapeSIPACDocumentContent(url);
        res.json({ text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


const CNPJ_IFES_BSF = '10838653000106';
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

async function performAutomaticSync() {
  // ... existing sync logic ...
  // Keeping this as is since it syncs PCA JSONs, not related to the "scraper" refactor requested
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

import { onRequest } from "firebase-functions/v2/https";

// Exporta como Cloud Function (Gen 2) com memória ajustada para Puppeteer
export const api = onRequest({
  memory: '2GiB',
  timeoutSeconds: 300,
  region: 'us-central1'
}, app);

// Executa servidor local apenas se NÃO estivermos no ambiente Cloud Functions
if (!process.env.FUNCTION_TARGET && !process.env.FIREBASE_CONFIG) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

setInterval(() => { }, 60000);
