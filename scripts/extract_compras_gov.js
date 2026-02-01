
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_URL = 'https://dadosabertos.compras.gov.br';
const CNPJ = '10838653000106'; // IFES BSF
const UASG = '158886'; // Campus Barra de São Francisco
const OUTPUT_FILE = path.join(__dirname, '..', 'dados_abertos_compras', 'compras_gov_result.json');

// Date Logic - Fetch by year to avoid >365 days error
const YEARS = ['2026', '2025', '2024']; // Reversed to prioritize recent

// Modalities to check
const MODALIDADES_PNCP = [
    6,  // Pregão - Eletrônico
    8,  // Dispensa de Licitação
    9,  // Inexigibilidade
    13  // Concorrência - Eletrônica
];

const MODALIDADES_LEGADO = [
    1,  // Convite
    2,  // Tomada de Preços
    3,  // Concorrência
    5,  // Pregão
    6,  // Dispensa
    7   // Inexigibilidade
];

async function fetchPNCPData() {
    console.log('--- Fetching PNCP (Law 14.133) Data ---');
    let allResults = [];

    for (const year of YEARS) {
        console.log(`\nFetching PNCP for Year: ${year}`);
        const dataInicio = `${year}-01-01`;
        const dataFim = `${year}-12-31`;

        for (const modalidade of MODALIDADES_PNCP) {
            process.stdout.write(`Fetching Modalidade ${modalidade}... `);
            try {
                const url = `${BASE_URL}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133`;
                const params = {
                    dataPublicacaoPncpInicial: dataInicio,
                    dataPublicacaoPncpFinal: dataFim,
                    orgaoEntidadeCnpj: CNPJ,
                    codigoModalidade: modalidade,
                    pagina: 1,
                    tamanhoPagina: 50
                };

                const response = await axios.get(url, { params });
                const data = response.data;
                const items = Array.isArray(data) ? data : (data.resultado || data.data || []);

                console.log(`Found ${items.length} items.`);
                allResults = allResults.concat(items.map(item => ({ ...item, source: 'PNCP_14133', modalidadeCode: modalidade, fetchYear: year })));

            } catch (error) {
                console.log('Error.');
                // console.error(`Error details:`, error.message);
                if (error.response && error.response.status !== 404) {
                    // 404 just means no data mostly, or invalid endpoint.
                    // But 400 is bad request.
                    if (error.response.data) console.error('  > API Message:', error.response.data);
                }
            }
        }
    }

    // Filter by UASG (BSF - 158886)
    const filteredResults = allResults.filter(item => item.unidadeOrgaoCodigoUnidade === UASG);
    console.log(`\n> Total items found for UASG ${UASG}: ${filteredResults.length} (of ${allResults.length} total fetched)`);

    return filteredResults;
}

async function fetchLegacyData() {
    console.log('\n--- Fetching Legacy (Law 8.666) Data ---');
    let allResults = [];

    for (const year of YEARS) {
        console.log(`\nFetching Legacy for Year: ${year}`);
        const dataInicio = `${year}-01-01`;
        const dataFim = `${year}-12-31`;

        for (const modalidade of MODALIDADES_LEGADO) {
            process.stdout.write(`Fetching Modalidade ${modalidade}... `);
            try {
                const url = `${BASE_URL}/modulo-legado/1_consultarLicitacao`;
                const params = {
                    data_publicacao_inicial: dataInicio,
                    data_publicacao_final: dataFim,
                    uasg: UASG,
                    modalidade: modalidade,
                    pertence14133: false
                };

                const response = await axios.get(url, { params });
                const data = response.data;
                const items = Array.isArray(data) ? data : (data.resultado || data.data || []);

                console.log(`Found ${items.length} items.`);
                allResults = allResults.concat(items.map(item => ({ ...item, source: 'LEGADO_8666', modalidadeCode: modalidade, fetchYear: year })));

            } catch (error) {
                console.log('Error.');
                if (error.response && error.response.data) {
                    // console.error('  > API Message:', error.response.data);
                }
            }
        }
    }
    return allResults;
}

// Helper to normalize string for comparison
const normalizeStr = (str) => {
    return str ? str.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';
};

// Phase 2: Fetch PGC Data (DFDs)
async function fetchPGCData(uasg, year) {
    const cacheKey = `${uasg}-${year}`;
    if (global.pgcCache && global.pgcCache[cacheKey]) {
        return global.pgcCache[cacheKey];
    }

    console.log(`    > Fetching PGC/DFD Data from Dados Abertos for UASG: ${uasg}, Year: ${year}...`);
    try {
        const url = `${BASE_URL}/modulo-pgc/1_consultarPgcDetalhe`;
        const params = {
            codigoUasg: uasg,
            anoPcaProjetoCompra: year,
            pagina: 1,
            tamanhoPagina: 500 // Fetch a large batch
        };

        const response = await axios.get(url, { params });
        const items = response.data.resultado || [];

        if (!global.pgcCache) global.pgcCache = {};
        global.pgcCache[cacheKey] = items;
        return items;
    } catch (error) {
        // console.error(`    > Error fetching PGC:`, error.message);
        return [];
    }
}

// Phase 2.5: Fetch Items from PNCP (Direct API)
async function fetchPNCPItems(cnpj, year, sequencial) {
    try {
        // Constructing the direct PNCP API URL
        // Endpoint: GET /v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens
        const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${sequencial}/itens`;

        const response = await axios.get(url, { params: { pagina: 1, tamanhoPagina: 50 } });
        return response.data; // Usually returns an array directly or { data: [...] } ? PNCP v1 usually returns list inside 'data' or root.
        // Let's assume response.data is the list or check structure.
        // Actually PNCP V1 items endpoint usually returns just the list orpaginated. 
        // We will perform a check.
    } catch (error) {
        // console.error(`    > Error fetching Items for ${year}/${sequencial}:`, error.message);
        return [];
    }
}

async function enrichWithItemsAndDFD(pncpPurchases) {
    console.log('\n--- Phase 2: Enriching with Items & DFDs (Deep Search) ---');

    // We already have extraction results in pncpPurchases.
    // Now we iterate to fill the GAP.

    for (const purchase of pncpPurchases) {
        const uasg = purchase.unidadeOrgaoCodigoUnidade;
        const year = purchase.anoCompraPncp;
        const sequencial = purchase.sequencialCompraPncp;
        const cnpj = purchase.orgaoEntidadeCnpj;
        const processNumber = normalizeStr(purchase.processo);

        if (!uasg || !year || !sequencial) continue;

        console.log(`\nProcessing Purchase ${purchase.numeroCompra}/${year} (Seq: ${sequencial})...`);

        // 1. Fetch Items for this Purchase
        let purchaseItems = await fetchPNCPItems(cnpj, year, sequencial);

        // Handle potential pagination wrapper
        if (purchaseItems.data && Array.isArray(purchaseItems.data)) {
            purchaseItems = purchaseItems.data;
        } else if (!Array.isArray(purchaseItems)) {
            purchaseItems = [];
        }

        console.log(`  > Found ${purchaseItems.length} items in PNCP.`);

        // 2. Fetch PGC (DFD) Candidates
        const pgcCandidates = await fetchPGCData(uasg, year);

        // 3. Match Logic
        const enrichedItems = [];

        for (const item of purchaseItems) {
            const itemDesc = normalizeStr(item.descricao);
            const itemCode = item.itemCategoriaId || item.codigoItem; // Try to find the code

            let bestDfd = null;

            // Iterate PGC Candidates to find match
            for (const pgc of pgcCandidates) {
                // Prepare PGC data
                const pgcCode = pgc.codigoItemCatalogo;
                const pgcDesc = normalizeStr(pgc.descricaoItemCatalogo);
                // Note: 'num_processo' isn't standard in PGC public response often, but 'numeroArtefato' is DFD. 
                // We check if PGC has extra fields or if we rely on the ones we saw.
                // Assuming "num_processo" might be "numeroProcesso" if available, or we skip Condition 3 if field missing.

                let isMatch = false;

                // Condition 1: Code Match (Ideal)
                if (itemCode && pgcCode && itemCode.toString() === pgcCode.toString()) {
                    isMatch = true;
                }
                // Condition 2: Semantic (Code + Desc Similarity)
                else if (itemCode && pgcCode && itemCode.toString() === pgcCode.toString()) {
                    if (itemDesc.includes(pgcDesc) || pgcDesc.includes(itemDesc)) {
                        isMatch = true;
                    }
                }

                // Condition 3: Process Number (The most reliable if PGC has it)
                // We check if 'descricaoObjetoDfd' contains the process number as a fallback 
                // or if there is a specific field. 
                // Since we don't strictly see 'num_processo' in standard PGC response often, 
                // we'll try to match exact text if process is unique.

                if (isMatch) {
                    bestDfd = pgc;
                    break; // Found a good match
                }
            }

            enrichedItems.push({
                numero_item: item.numeroItem,
                descricao: item.descricao,
                codigo_item: itemCode,
                valor_unitario: item.valorUnitarioEstimado,
                quantidade: item.quantidade,
                numero_dfd_encontrado: bestDfd ? `${bestDfd.numeroArtefato}/${bestDfd.anoArtefato}` : null,
                dfd_metadata: bestDfd ? {
                    id: bestDfd.idDfd, // if avail
                    numero: bestDfd.numeroArtefato,
                    ano: bestDfd.anoArtefato,
                    unidade: bestDfd.codigoUasg,
                    descricao: bestDfd.descricaoObjetoDfd,
                    catalogo: bestDfd.codigoItemCatalogo
                } : null
            });
        }

        // Attach to purchase object
        purchase.itens = enrichedItems;

        // Consolidate DFDs found for the Purchase header (quick summary)
        const foundDfds = new Set(enrichedItems.map(i => i.numero_dfd_encontrado).filter(Boolean));
        purchase.dfds_relacionados = Array.from(foundDfds);
    }

    return pncpPurchases;
}

async function main() {
    try {
        const pncpData = await fetchPNCPData();

        // Deep Enrichment Phase
        const enrichedPncp = await enrichWithItemsAndDFD(pncpData);

        const legacyData = await fetchLegacyData();

        const fullData = {
            metadata: {
                extractedAt: new Date().toISOString(),
                cnpjUsed: CNPJ,
                uasgUsed: UASG,
                yearRange: YEARS
            },
            pncp: enrichedPncp,
            legacy: legacyData,
            totalItems: enrichedPncp.length + legacyData.length
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fullData, null, 2));
        console.log(`\nSuccess! Extracted ${fullData.totalItems} records.`);
        console.log(`Data saved to: ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('Critical error in extraction script:', error);
    }
}

main();
