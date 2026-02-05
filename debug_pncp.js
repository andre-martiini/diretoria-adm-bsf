
import axios from 'axios';
const url = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=10838653000106&dataInicial=20240101&dataFinal=20241231&pagina=1';

async function test() {
    try {
        const response = await axios.get(url);
        console.log('Status:', response.status);
        console.log('Data Type:', typeof response.data);
        console.log('Has Data:', !!response.data.data);
        console.log('Data Length:', response.data.data?.length);
        if (response.data.data && response.data.data.length > 0) {
            console.log('First Record Unit:', response.data.data[0].unidadeOrgao.nomeUnidade);
        } else {
            console.log('Full Response:', JSON.stringify(response.data, null, 2));
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}
test();
