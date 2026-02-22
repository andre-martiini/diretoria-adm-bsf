
const axios = require('axios');

async function testParams() {
    const baseUrl = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
    const HEADERS = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
    };

    // Test: Formatted CNPJ
    try {
        console.log("Testing Formatted CNPJ...");
        const res1 = await axios.get(baseUrl, {
            headers: HEADERS,
            params: {
                dataInicial: '20250101',
                dataFinal: '20251231',
                cnpjOrgao: '10.838.653/0001-06',
                pagina: 1
            }
        });
        console.log(`✅ Success: Total ${res1.data.totalRegistros}`);
    } catch (err) {
        console.log(`❌ Formatted CNPJ Failed: ${err.message}`);
        if (err.response) console.log(JSON.stringify(err.response.data));
    }
}

testParams();
