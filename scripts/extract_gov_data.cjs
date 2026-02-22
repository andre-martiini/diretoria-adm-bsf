
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const YEARS = [2022, 2023, 2024, 2025];
const BASE_OUTPUT_DIR = path.join(__dirname, '..', 'dados_abertos_compras');
const OUTPUT_FILE = path.join(BASE_OUTPUT_DIR, 'historico_compras_ifes_completo.json');
const ROOT_CNPJ = "10838653"; // IFES Root
const MAX_BRANCH = 40; // Scans branches 0001 to 0040
const PAGE_SIZE = 50;

const HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// Utils
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const formatCnpj = (s) => s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

// CNPJ Generator
function calculateCnpjDv(base) {
    if (base.length !== 12) return "";
    const calc = (str, w) => {
        let s = 0;
        for (let i = 0; i < str.length; i++) s += parseInt(str[i]) * w[i];
        const r = s % 11; return r < 2 ? 0 : 11 - r;
    };
    const d1 = calc(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = calc(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return `${d1}${d2}`;
}

function generateIfesCnpjs() {
    const list = [];
    for (let i = 1; i <= MAX_BRANCH; i++) {
        const b = i.toString().padStart(4, '0');
        const base = ROOT_CNPJ + b;
        list.push(base + calculateCnpjDv(base));
    }
    return list;
}

// Main
async function extractGovData() {
    console.log("🚀 Starting extraction from PNCP...");
    console.log(`📅 Years: ${YEARS.join(', ')}`);
    console.log(`🏢 Checking IFES branches 0001-${MAX_BRANCH}...`);

    onEnsureDir();

    const candidates = generateIfesCnpjs();
    const activeUnits = [];
    const allData = [];

    // 1. Discovery
    console.log("\n🔎 Discovery Phase (Checking for recent activity)...");
    for (const cnpj of candidates) {
        // Try raw and formatted just in case
        const checkYears = [2025, 2024];
        let found = false;

        for (const yr of checkYears) {
            // Check both endpoints
            const urls = [
                `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras?ano=${yr}&pagina=1&tamanhoPagina=1`,
                `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${yr}?pagina=1&tamanhoPagina=1`
            ];

            for (const u of urls) {
                try {
                    const res = await axios.get(u, { headers: HEADERS, validateStatus: () => true });
                    // Determine if valid data
                    const d = res.data;
                    const items = d.data || (Array.isArray(d) ? d : []);
                    const total = d.totalRegistros || items.length;

                    if (res.status === 200 && total > 0) {
                        const first = items[0];
                        const name = first?.unidadeOrgao?.nomeUnidade || first?.orgaoEntidade?.razaoSocial || "IFES Unit";
                        console.log(`   ✅ Found: ${cnpj} (${name}) [${u.includes('pncp/v1') ? 'PNCP' : 'Consulta'}]`);
                        activeUnits.push({ cnpj, name, validUrlPattern: u.includes('pncp/v1') ? 'pncp' : 'consulta' });
                        found = true;
                        break;
                    }
                } catch (e) { }
            }
            if (found) break;
            await delay(100);
        }
    }
    console.log(`\n   Active Campuses Found: ${activeUnits.length}`);

    if (activeUnits.length === 0) {
        console.error("⚠️ No active campuses found. Check network/API.");

        // Fallback: Add known BSF just to try extraction logic
        // activeUnits.push({ cnpj: "10838653000106", name: "IFES Reitoria/BSF (Fallback)", validUrlPattern: 'consulta' });
    }

    // 2. Extraction
    console.log("\n📥 Extraction Phase...");
    for (const unit of activeUnits) {
        console.log(`   🏢 Extracting ${unit.name}...`);

        for (const year of YEARS) {
            let page = 1;
            let totalPages = 1;

            while (page <= totalPages) {
                try {
                    // Consult the valid endpoint pattern found
                    let listUrl;
                    if (unit.validUrlPattern === 'pncp') {
                        listUrl = `https://pncp.gov.br/api/pncp/v1/orgaos/${unit.cnpj}/compras/${year}?pagina=${page}&tamanhoPagina=${PAGE_SIZE}`;
                    } else {
                        listUrl = `https://pncp.gov.br/api/consulta/v1/orgaos/${unit.cnpj}/compras?ano=${year}&pagina=${page}&tamanhoPagina=${PAGE_SIZE}`;
                    }

                    const res = await axios.get(listUrl, { headers: HEADERS });
                    const d = res.data;
                    const items = d.data || (Array.isArray(d) ? d : []); // Generic handle
                    totalPages = d.totalPaginas || 1;

                    if (items.length > 0) {
                        // Parallel fetch items details
                        const chunks = [];
                        // limit concurrency
                        for (let i = 0; i < items.length; i += 5) {
                            const chunk = items.slice(i, i + 5);
                            const promises = chunk.map(async (p) => {
                                const details = await fetchDetails(year, p.sequencialCompra, unit.cnpj, unit.validUrlPattern);
                                return details.map(det => mapItem(p, det, unit, year));
                            });
                            const results = await Promise.all(promises);
                            allData.push(...results.flat());
                            await delay(200);
                        }
                    }
                    page++;
                } catch (e) {
                    // console.error(`Error ${unit.name} ${year} p${page}: ${e.message}`);
                    break;
                }
            }
        }
    }

    // Save
    console.log(`\n💾 Saved ${allData.length} records to ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));
    console.log("✅ Finished.");
}

async function fetchDetails(year, seq, cnpj, pattern) {
    // Try both usually, or stick to pattern
    const url = `https://pncp.gov.br/api/consulta/v1/orgaos/${cnpj}/compras/${year}/${seq}/itens?pagina=1&tamanhoPagina=50`;
    try {
        const r = await axios.get(url, { headers: HEADERS });
        return r.data.data || [];
    } catch (e) { return []; }
}

function mapItem(purchase, item, unit, year) {
    return {
        codigo_catmat: item.codigoItem || 0,
        descricao_resumida: (item.descricao || "").trim(),
        descricao_detalhada: (item.descricao || "").trim(),
        unidade_fornecimento: item.unidadeMedida || "Unidade",
        valor_unitario: item.valorUnitarioHomologado || item.valorUnitarioEstimado || 0,
        uasg_nome: purchase.unidadeOrgao?.nomeUnidade || unit.name,
        // Extra
        ano_compra: year,
        numero_compra: purchase.numeroCompra,
        cnpj_unidade: unit.cnpj
    };
}

function onEnsureDir() {
    if (!fs.existsSync(BASE_OUTPUT_DIR)) fs.mkdirSync(BASE_OUTPUT_DIR, { recursive: true });
}

extractGovData();
