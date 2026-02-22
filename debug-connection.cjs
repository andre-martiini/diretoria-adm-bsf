
const axios = require('axios');

async function testConnection() {
    const CNPJ = "10838653000106";
    const HEADERS = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
    };

    const attempt = async (url) => {
        console.log(`\nTesting ${url}...`);
        try {
            const res = await axios.get(url, { headers: HEADERS });
            console.log(`✅ Status: ${res.status}`);
        } catch (e) {
            console.log(`❌ Failed: ${e.response?.status || e.message}`);
        }
    };

    await attempt(`https://pncp.gov.br/api/pncp/v1/orgaos/${CNPJ}/compras/2025`);
    await attempt(`https://pncp.gov.br/api/consulta/v1/orgaos/${CNPJ}/compras/2025`);
}

testConnection();
