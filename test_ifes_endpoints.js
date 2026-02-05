
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CNPJ = '10838653000106';

async function testEndpoints() {
    const endpoints = [
        // PCA Items (Planning)
        `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/pca/2025/itens?pagina=1&tamanhoPagina=10`,
        `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/pca/2024/itens?pagina=1&tamanhoPagina=10`,
        // Purchases (Extraction)
        `https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras?ano=2024&pagina=1&tamanhoPagina=10`,
        // Consulta (Search)
        `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=${CNPJ}&dataInicial=20240101&dataFinal=20241231&pagina=1`
    ];

    for (const url of endpoints) {
        console.log(`\nTesting: ${url}`);
        try {
            const response = await axios.get(url, { timeout: 10000 });
            console.log(`  Success! Status: ${response.status}`);
            const data = response.data.data || response.data || [];
            const count = Array.isArray(data) ? data.length : (data.resultado ? data.resultado.length : 0);
            console.log(`  Items found: ${count}`);
            if (count > 0) {
                const item = Array.isArray(data) ? data[0] : (data.resultado ? data.resultado[0] : null);
                console.log(`  Sample: ${JSON.stringify(item).substring(0, 200)}...`);
            }
        } catch (error) {
            console.log(`  Failed: ${error.message}`);
            if (error.response) {
                console.log(`  Response Status: ${error.response.status}`);
                console.log(`  Response Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
            }
        }
    }
}

testEndpoints();
