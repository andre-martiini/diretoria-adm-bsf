
import axios from 'axios';
import fs from 'fs';

const testPNCP = async () => {
    // Attempt with FORMATTED CNPJ
    // 10.838.653/0001-06
    const url = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?cnpjOrgao=10.838.653/0001-06&dataInicial=20240101&dataFinal=20241231&pagina=1&codigoModalidadeContratacao=6';
    try {
        const res = await axios.get(url);
        // Write only the first item to avoid huge file
        const summary = {
            total: res.data.totalRegistros,
            first: res.data.data?.[0]
        };
        fs.writeFileSync('pncp_result.json', JSON.stringify(summary, null, 2));
    } catch (e) {
        if (e.response) {
            fs.writeFileSync('pncp_result.json', JSON.stringify(e.response.data, null, 2));
        } else {
            fs.writeFileSync('pncp_result.json', e.message);
        }
    }
}
testPNCP();
