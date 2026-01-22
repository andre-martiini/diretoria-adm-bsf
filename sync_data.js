
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const CNPJ = '10838653000106';
const YEARS = {
    '2026': '12',
    '2025': '12',
    '2024': '15',
    '2023': '14',
    '2022': '20'
};

const DATA_DIR = './public/data';

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function downloadData() {
    console.log("🚀 Iniciando download dos dados do PNCP...");

    for (const [year, seq] of Object.entries(YEARS)) {
        try {
            console.log(`📡 Baixando PCA ${year} (Seq: ${seq})...`);
            // Baixamos uma página grande para pegar tudo (500 itens)
            const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/pca/${year}/${seq}/itens?pagina=1&tamanhoPagina=500`;
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const filePath = path.join(DATA_DIR, `pca_${year}.json`);
            fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));
            console.log(`✅ Salvo: ${filePath}`);
        } catch (error) {
            console.error(`❌ Erro ao baixar ${year}:`, error.message);
        }
    }

    console.log("\n✨ Todos os dados foram sincronizados localmente!");
}

downloadData();
