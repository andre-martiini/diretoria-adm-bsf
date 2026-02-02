
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
  const { ano, pagina = 1, tamanhoPagina = 100, codigoModalidadeContratacao } = req.query;
  const CNPJ = '10838653000106'; // IFES BSF

  // Na API de Consulta, usamos 'contratacoes/publicacao'
  // Data inicial e final cobrindo o ano inteiro
  const dataInicial = `${ano}0101`;
  const dataFinal = `${ano}1231`;

  // Se não foi fornecido um código de modalidade específico, buscar todas as modalidades
  // Códigos comuns: 1=Pregão Eletrônico, 2=Concorrência, 3=Dispensa, 4=Inexigibilidade, etc.
  // Para buscar todas, podemos fazer múltiplas requisições ou usar a API de orgãos

  // Tentativa 1: Usar endpoint alternativo que não requer modalidade
  // https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras?ano=...
  const urlOrgao = `https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ}/compras?ano=${ano}&pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;

  console.log(`[PNCP PROXY] Buscando compras via endpoint de órgão: ${urlOrgao}`);
  try {
    const response = await axios.get(urlOrgao, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error(`[PNCP PROXY ERROR]`, error.message);
    if (error.response) {
      console.error(`[PNCP PROXY STATUS]`, error.response.status);
      console.error(`[PNCP PROXY DATA]`, error.response.data);
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
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


const CNPJ_IFES_BSF = '10838653000106';
const PUBLIC_DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const PROCUREMENT_DATA_DIR = path.join(__dirname, '..', 'dados_abertos_compras');

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
  region: 'us-central1'
}, app);

// Endpoint para ler dados brutos da integração Compras.gov/PNCP (Legacy - mantido para compatibilidade)
app.get('/api/integration/procurement-data', async (req, res) => {
  try {
    const COMPRAS_GOV_PATH = path.join(__dirname, '..', 'dados_abertos_compras', 'compras_gov_result.json');
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
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return res.json(data);
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
        years: YEARS
      },
      data: []
    };

    for (const year of YEARS) {
      const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
      if (fs.existsSync(filePath)) {
        const yearData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        allData.data.push(...(yearData.data || []));
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

