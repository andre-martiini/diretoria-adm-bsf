
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'dados_abertos_compras');
const OUTPUT_FILE = path.join(DATA_DIR, 'historico_compras_ifes.json');

function normalizeString(str) {
    return str ? str.trim() : "";
}

function processFiles() {
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('contratacoes_') && f.endsWith('.json'));
        console.log(`Found ${files.length} files to process.`);

        let allItems = [];

        for (const file of files) {
            console.log(`Processing ${file}...`);
            const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
            const json = JSON.parse(content);
            const purchases = json.data || [];

            for (const purchase of purchases) {
                const uasgName = purchase.unidadeOrgaoNomeUnidade || "IFES";
                const date = purchase.dataPublicacaoPncp || purchase.dataInclusaoPncp;

                if (purchase.itens) {
                    for (const item of purchase.itens) {
                        // Mapping fields
                        const historyItem = {
                            codigo_catmat: item.codigo_item || 0, // Fallback if missing
                            descricao_resumida: normalizeString(item.descricao),
                            descricao_detalhada: normalizeString(item.descricao), // Using simplified desc as we lack detailed
                            unidade_fornecimento: "Unidade", // Defaulting as missing in source
                            valor_unitario: item.valor_unitario || 0,
                            uasg_nome: normalizeString(uasgName),

                            // Extra metadata that might be useful (optional based on user request "minimamente")
                            ano_compra: purchase.anoCompraPncp,
                            numero_compra: purchase.numeroCompra,
                            data_compra: date
                        };

                        allItems.push(historyItem);
                    }
                }
            }
        }

        console.log(`Total items extracted: ${allItems.length}`);

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allItems, null, 2));
        console.log(`Successfully saved to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error("Error processing files:", error);
    }
}

processFiles();
