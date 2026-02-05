
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_FILE = path.join(__dirname, '..', 'historico_compras_ifes.json');

const UASG_NAMES = {
    '158151': 'Reitoria',
    '158416': 'Campus Vitória',
    '158427': 'Campus Vila Velha',
    '158417': 'Campus Serra',
    '158421': 'Campus Cariacica',
    '158419': 'Campus Aracruz',
    '158420': 'Campus Linhares',
    '158423': 'Campus São Mateus',
    '158422': 'Campus Nova Venécia',
    '158884': 'Campus Montanha',
    '158886': 'Campus Barra de São Francisco',
    '158272': 'Campus Colatina',
    '158424': 'Campus Itapina',
    '158425': 'Campus Alegre',
    '158418': 'Campus Cachoeiro de Itapemirim',
    '158883': 'Campus Guarapari',
    '158892': 'Campus Piúma',
    '158428': 'Campus Ibatiba',
    '158429': 'Campus Venda Nova do Imigrante',
    '158426': 'Campus Santa Teresa',
    '158885': 'Campus Centro-Serrano'
};

function main() {
    let allItems = [];
    console.log("Iniciando consolidação do Histórico de Compras...");

    // 1. Carregar do cache de PCA (Planning)
    const pcaPath = path.join(__dirname, '..', 'extracted_data_sample.json');
    if (fs.existsSync(pcaPath)) {
        const data = JSON.parse(fs.readFileSync(pcaPath, 'utf8'));
        const pcaItems = data.pca_2025_sample || [];
        console.log(`  Processando ${pcaItems.length} itens do PCA 2025...`);
        for (const item of pcaItems) {
            if (item.codigoItem || item.pdmCodigo) {
                allItems.push({
                    codigo_catmat: item.codigoItem || item.pdmCodigo,
                    descricao_resumida: item.pdmDescricao || item.descricao || "Título Indisponível",
                    descricao_detalhada: item.descricao || item.pdmDescricao || "Especificação Indisponível",
                    unidade_fornecimento: item.unidadeFornecimento || "UN",
                    valor_unitario: item.valorUnitario || 0,
                    uasg_nome: UASG_NAMES[item.codigoUnidade] || item.nomeUnidade || `UASG ${item.codigoUnidade}`
                });
            }
        }
    }

    // 2. Carregar de Contratações 2024/2025 (Execution)
    const dataDir = path.join(__dirname, '..', 'dados_abertos_compras');
    const files = ['contratacoes_2024.json', 'contratacoes_2025.json'];

    for (const file of files) {
        const filePath = path.join(dataDir, file);
        if (fs.existsSync(filePath)) {
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const purchases = content.data || [];
            console.log(`  Processando ${purchases.length} compras de ${file}...`);
            for (const p of purchases) {
                const items = p.itens || [];
                for (const item of items) {
                    if (item.codigo_item) {
                        allItems.push({
                            codigo_catmat: item.codigo_item,
                            descricao_resumida: item.descricao,
                            descricao_detalhada: item.descricao, // No execução PNCP, as vezes são iguais
                            unidade_fornecimento: item.unidade_medida || "UN",
                            valor_unitario: item.valor_unitario || 0,
                            uasg_nome: UASG_NAMES[p.unidadeOrgaoCodigoUnidade] || p.unidadeOrgaoNomeUnidade
                        });
                    }
                }
            }
        }
    }

    // 3. Filtragem final e remoção de duplicatas por CATMAT
    const uniqueItems = [];
    const seen = new Set();

    for (const item of allItems) {
        if (!seen.has(item.codigo_catmat)) {
            seen.add(item.codigo_catmat);
            uniqueItems.push(item);
        }
    }

    const output = {
        metadata: {
            titulo: "Histórico Consolidado de Compras IFES",
            descricao: "Extraído das integrações de PCA e Contratações disponíveis no sistema.",
            data_extracao: new Date().toISOString(),
            total_itens: uniqueItems.length
        },
        historico: uniqueItems
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nSucesso! Arquivo gerado: ${OUTPUT_FILE}`);
}

main();
