
import axios from 'axios';

const BASE_URL = 'https://dadosabertos.compras.gov.br';
const UASG = '158886';
const YEAR = '2025';

async function checkPGC() {
    console.log(`Checking PGC Data for UASG ${UASG} / Year ${YEAR}...`);
    try {
        const url = `${BASE_URL}/modulo-pgc/1_consultarPgcDetalhe`;
        const params = {
            cod_uasg: UASG,
            ano_pca: YEAR,
            pagina: 1,
            tamanhoPagina: 5
        };
        const response = await axios.get(url, { params });
        const items = response.data.resultado || [];

        console.log(`Found ${response.data.totalRegistros} total records.`);
        if (items.length > 0) {
            console.log('Sample Item 1:', JSON.stringify(items[0], null, 2));
        } else {
            console.log('No items found in PGC.');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkPGC();
