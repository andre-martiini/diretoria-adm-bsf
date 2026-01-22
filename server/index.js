import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
// Usamos uma porta diferente do frontend (que geralmente é 5173 no Vite)
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Log de requisições para facilitar debug
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Endpoint principal para buscar PCA (Plano de Contratações Anual)
app.get('/api/pncp/pca/:cnpj/:ano', async (req, res) => {
  const { cnpj, ano } = req.params;
  const { pagina = 1, tamanhoPagina = 100, sequencial = 12 } = req.query;

  try {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/pca/${ano}/${sequencial}/itens?pagina=${pagina}&tamanhoPagina=${tamanhoPagina}`;
    console.log(`Buscando dados no PNCP: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Gestao-CLC-App/1.0'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Erro ao buscar dados do PNCP:', error.message);

    if (error.response) {
      // O PNCP retornou um erro (ex: 404, 500)
      res.status(error.response.status).json({
        error: 'Erro na API do PNCP',
        details: error.response.data
      });
    } else if (error.request) {
      // A requisição foi feita mas não houve resposta
      res.status(504).json({ error: 'PNCP não respondeu a tempo' });
    } else {
      res.status(500).json({ error: 'Erro interno no servidor de integração' });
    }
  }
});

// Endpoint para listar contratações por período (Conforme documentação)
app.get('/api/pncp/contratacoes/publicacao', async (req, res) => {
  const { dataInicial, dataFinal, pagina = 1 } = req.query;

  if (!dataInicial || !dataFinal) {
    return res.status(400).json({ error: 'dataInicial e dataFinal são obrigatórios (YYYYMMDD)' });
  }

  try {
    const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}&pagina=${pagina}`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Erro ao listar contratações' });
  }
});

app.listen(PORT, () => {
  console.log('=========================================');
  console.log(`🚀 PNCP Integration API is running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log('=========================================');
});
