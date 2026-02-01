// Test script to verify DFD grouping logic
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pcaData = JSON.parse(readFileSync(join(__dirname, 'public', 'data', 'pca_2026.json'), 'utf-8'));

const items = pcaData.data || [];

console.log(`\n📊 Total de itens no PCA 2026: ${items.length}\n`);

// Group by grupoContratacaoCodigo
const groups = {};

items.forEach(item => {
    const dfdCode = item.grupoContratacaoCodigo || 'SEM_DFD';

    if (!groups[dfdCode]) {
        groups[dfdCode] = {
            codigo: dfdCode,
            nome: item.grupoContratacaoNome || 'Sem nome',
            unidade: item.nomeUnidade || 'Desconhecida',
            itens: [],
            valorTotal: 0
        };
    }

    groups[dfdCode].itens.push({
        numeroItem: item.numeroItem,
        descricao: item.descricao || 'Sem descrição',
        valor: item.valorTotal || 0
    });

    groups[dfdCode].valorTotal += (item.valorTotal || 0);
});

console.log(`📋 Total de DFDs (grupos) encontrados: ${Object.keys(groups).length}\n`);

// Show first 10 DFDs
Object.values(groups).slice(0, 10).forEach((group, idx) => {
    console.log(`\n${idx + 1}. DFD: ${group.codigo}`);
    console.log(`   Nome: ${group.nome}`);
    console.log(`   Unidade: ${group.unidade}`);
    console.log(`   Qtd Itens: ${group.itens.length}`);
    console.log(`   Valor Total: R$ ${group.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Primeiros itens:`);
    group.itens.slice(0, 3).forEach(item => {
        console.log(`     - #${item.numeroItem}: ${item.descricao.substring(0, 60)}...`);
    });
});

console.log(`\n✅ Teste concluído!\n`);
