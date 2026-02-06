// Script para importar dados do arquivo legacy compras_gov_result.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROCUREMENT_DATA_DIR = path.join(__dirname, 'dados_abertos_compras');
const CNPJ_IFES_BSF = '10838653000106';

async function importLegacyData() {
    try {
        console.log('📦 Importando dados do arquivo legacy...\n');

        const legacyPath = path.join(PROCUREMENT_DATA_DIR, 'compras_gov_result.json');

        if (!fs.existsSync(legacyPath)) {
            console.error('❌ Arquivo compras_gov_result.json não encontrado');
            return;
        }

        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        const pncpData = legacyData.pncp || [];

        console.log(`📊 Encontrados ${pncpData.length} registros no arquivo legacy\n`);

        // Agrupa por ano
        const byYear = {};
        for (const item of pncpData) {
            const year = item.anoCompraPncp || item.fetchYear;
            if (!byYear[year]) {
                byYear[year] = [];
            }
            byYear[year].push(item);
        }

        // Salva cada ano em arquivo separado
        let imported = 0;
        for (const [year, purchases] of Object.entries(byYear)) {
            const filePath = path.join(PROCUREMENT_DATA_DIR, `contratacoes_${year}.json`);
            const fileData = {
                metadata: {
                    extractedAt: new Date().toISOString(),
                    cnpj: CNPJ_IFES_BSF,
                    year: year,
                    totalPurchases: purchases.length,
                    source: 'imported_from_legacy'
                },
                data: purchases
            };

            fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
            imported += purchases.length;
            console.log(`✅ Importado: contratacoes_${year}.json (${purchases.length} contratações)`);
        }

        console.log(`\n🎉 Importação concluída!`);
        console.log(`   Total: ${imported} contratações`);
        console.log(`   Anos: ${Object.keys(byYear).join(', ')}`);

    } catch (error) {
        console.error('❌ Erro ao importar:', error.message);
    }
}

importLegacyData();
