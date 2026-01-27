
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeSIPACProcess } from './sipacService.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  console.log(`[META] Requisição para ${cnpj}/${ano}`);
  try {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pca/${ano}/${sequencial}`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para itens (usado para sincronização manual profunda)
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

  if (!protocolo) {
    return res.status(400).json({ error: 'Protocolo é obrigatório' });
  }

  // Format protocol properly (add dots/dashes if missing)
  let formattedProtocol = protocolo;
  if (protocolo.length === 17) {
    formattedProtocol = `${protocolo.slice(0, 5)}.${protocolo.slice(5, 11)}/${protocolo.slice(11, 15)}-${protocolo.slice(15)}`;
  }

  console.log(`[SIPAC] Buscando processo: ${formattedProtocol}`);
  try {
    const data = await scrapeSIPACProcess(formattedProtocol);
    res.json(data);
  } catch (error) {
    console.error(`[SIPAC ERROR]`, error);
    res.status(500).json({ error: error.message });
  }
});


// --- Background Sync Logic (Midnight Photograph) ---
const CNPJ_IFES_BSF = '10838653000106';
const YEARS_MAP = {
  '2026': '12',
  '2025': '12',
  '2024': '15',
  '2023': '14',
  '2022': '20'
};
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');

if (!fs.existsSync(PUBLIC_DATA_DIR)) {
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
}

async function performAutomaticSync() {
  console.log(`[${new Date().toISOString()}] 🚀 Iniciando Sincronização Automática Diária...`);

  for (const [year, seq] of Object.entries(YEARS_MAP)) {
    try {
      console.log(`[SYNC] Baixando dados de ${year} (Seq: ${seq}) da PNCP...`);
      const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ_IFES_BSF}/pca/${year}/${seq}/itens?pagina=1&tamanhoPagina=1000`;

      const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = response.data.data || (Array.isArray(response.data) ? response.data : []);

      if (data.length > 0) {
        const filePath = path.join(PUBLIC_DATA_DIR, `pca_${year}.json`);
        fs.writeFileSync(filePath, JSON.stringify({
          data,
          updatedAt: new Date().toISOString(),
          source: 'Automatic Daily Sync'
        }, null, 2));
        console.log(`[SYNC] ✅ Snapshot salvo: ${filePath} (${data.length} itens)`);
      }
    } catch (error) {
      console.error(`[SYNC] ❌ Erro ao sincronizar ${year}:`, error.message);
    }
  }
}

// Executa uma vez no início (se o arquivo não existir ou for velho) e depois a cada 24h
function scheduleDailySync() {
  // Primeira execução após 10 segundos para não pesar o startup
  setTimeout(performAutomaticSync, 10000);

  // Intervalo de 24 horas
  setInterval(performAutomaticSync, 24 * 60 * 60 * 1000);
}

// scheduleDailySync();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// Force the process to stay alive
setInterval(() => {
  // console.log('Ping...');
}, 60000);
