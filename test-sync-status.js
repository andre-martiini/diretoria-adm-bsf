// Script de teste para verificar o status da sincronização
const API_URL = 'http://localhost:3002';

async function checkStatus() {
    try {
        console.log('🔍 Verificando status da sincronização...\n');

        const response = await fetch(`${API_URL}/api/procurement/status`);
        const status = await response.json();

        console.log('📊 Status da Sincronização de Contratações:\n');
        console.log('═'.repeat(60));

        for (const [year, info] of Object.entries(status)) {
            console.log(`\n📅 Ano ${year}:`);
            if (info.exists) {
                console.log(`  ✅ Arquivo existe`);
                console.log(`  📝 Total de contratações: ${info.totalPurchases}`);
                console.log(`  🕒 Última atualização: ${new Date(info.lastUpdated).toLocaleString('pt-BR')}`);
                console.log(`  💾 Tamanho: ${(info.fileSize / 1024).toFixed(2)} KB`);
            } else {
                console.log(`  ❌ Arquivo não encontrado`);
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('\n✨ Para forçar sincronização manual, execute:');
        console.log('   POST http://localhost:3002/api/procurement/sync\n');

    } catch (error) {
        console.error('❌ Erro ao verificar status:', error.message);
        console.log('\n💡 Certifique-se de que o servidor está rodando em http://localhost:3002');
    }
}

checkStatus();
