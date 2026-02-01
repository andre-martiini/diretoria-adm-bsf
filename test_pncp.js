
import axios from 'axios';

const testPNCP = async () => {
    const configs = [
        {
            desc: 'YYYYMMDD',
            url: 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=10838653000106&dataInicial=20240101&dataFinal=20241231&pagina=1'
        },
        {
            desc: 'YYYY-MM-DD',
            url: 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=10838653000106&dataInicial=2024-01-01&dataFinal=2024-12-31&pagina=1'
        }
    ];

    for (const config of configs) {
        console.log(`\nTesting: ${config.desc}`);
        console.log(`URL: ${config.url}`);
        try {
            const response = await axios.get(config.url);
            console.log('Success! Status:', response.status);
        } catch (error) {
            console.log('Error Status:', error.response?.status);
            if (error.response?.data) {
                // Log clean JSON
                console.log(JSON.stringify(error.response.data, null, 2));
            } else {
                console.log('Error Message:', error.message);
            }
        }
    }
};

testPNCP();
