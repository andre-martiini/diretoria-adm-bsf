
import axios from 'axios';
const url = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=10838653000106&dataInicial=2024-01-01&dataFinal=2024-01-31&pagina=1';

async function test() {
    try {
        const response = await axios.get(url);
        console.log('Status:', response.status);
        console.log('Result count:', response.data.data?.length);
        if (response.data.data?.length > 0) {
            console.log('First Record Unit:', response.data.data[0].unidadeOrgao.nomeUnidade);
        }
    } catch (e) {
        console.log('Error:', e.message);
        if (e.response?.data) console.log('API Message:', JSON.stringify(e.response.data));
    }
}
test();
