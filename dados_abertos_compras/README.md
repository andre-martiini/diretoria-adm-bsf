# Sistema de Sincronização de Dados PNCP

## 📋 Visão Geral

Este sistema automatiza o download e armazenamento de dados de contratações do PNCP (Portal Nacional de Contratações Públicas) para os anos de 2022 a 2026, permitindo acesso rápido e offline aos dados.

## 🎯 Funcionalidades

### Sincronização Automática
- **Inicial**: Executada 5 segundos após o servidor iniciar
- **Periódica**: A cada 6 horas
- **Manual**: Através do endpoint `/api/procurement/sync`

### Armazenamento de Dados
Os dados são salvos em arquivos JSON no diretório `dados_abertos_compras/`:
- `contratacoes_2022.json`
- `contratacoes_2023.json`
- `contratacoes_2024.json`
- `contratacoes_2025.json`
- `contratacoes_2026.json`

Cada arquivo contém:
```json
{
  "metadata": {
    "extractedAt": "2026-02-02T...",
    "cnpj": "10838653000106",
    "year": "2025",
    "totalPurchases": 150
  },
  "data": [
    {
      "numeroCompra": "90001",
      "processo": "23543000178202585",
      "modalidadeNome": "Dispensa",
      "objetoCompra": "...",
      "valorTotalEstimado": 26020.88,
      "itens": [...]
    }
  ]
}
```

## 🔌 Endpoints da API

### 1. Obter dados de um ano específico
```
GET /api/procurement/year/:year
```
**Exemplo**: `/api/procurement/year/2025`

### 2. Obter todos os dados (2022-2026)
```
GET /api/procurement/all
```
Retorna todos os dados consolidados de todos os anos.

### 3. Verificar status da sincronização
```
GET /api/procurement/status
```
Retorna informações sobre cada arquivo:
```json
{
  "2025": {
    "exists": true,
    "lastUpdated": "2026-02-02T13:30:00.000Z",
    "totalPurchases": 150,
    "fileSize": 524288
  },
  "2024": {
    "exists": true,
    "lastUpdated": "2026-02-02T13:30:00.000Z",
    "totalPurchases": 200,
    "fileSize": 698880
  }
}
```

### 4. Forçar sincronização manual
```
POST /api/procurement/sync
```
Inicia a sincronização em background.

### 5. Endpoint legado (compatibilidade)
```
GET /api/integration/procurement-data
```
Mantido para compatibilidade com código existente.

## 💻 Uso no Frontend

### Importar as funções
```typescript
import {
  findPncpPurchaseByProcessCached,
  getAllProcurementData,
  getProcurementDataByYear,
  getProcurementSyncStatus,
  triggerProcurementSync
} from '../services/pncpService';
```

### Buscar contratação por processo (RECOMENDADO)
```typescript
// Usa dados em cache - MUITO mais rápido
const purchase = await findPncpPurchaseByProcessCached('23068.0001/2026');
```

### Buscar dados de um ano
```typescript
const data2025 = await getProcurementDataByYear('2025');
console.log(data2025.metadata.totalPurchases);
console.log(data2025.data); // Array de contratações
```

### Buscar todos os dados
```typescript
const allData = await getAllProcurementData();
console.log(allData.data); // Array com todas as contratações de 2022-2026
```

### Verificar status da sincronização
```typescript
const status = await getProcurementSyncStatus();
console.log(status['2025'].lastUpdated);
```

### Forçar sincronização
```typescript
const result = await triggerProcurementSync();
console.log(result.message); // "Sincronização iniciada em background"
```

## ⚡ Vantagens

1. **Performance**: Busca local é 10-100x mais rápida que chamadas à API
2. **Confiabilidade**: Funciona mesmo se a API do PNCP estiver indisponível
3. **Redução de carga**: Menos requisições à API pública
4. **Dados completos**: Inclui itens de cada contratação
5. **Histórico**: Mantém dados de 5 anos (2022-2026)

## 🔄 Processo de Sincronização

1. **Busca contratações** de cada ano via API do PNCP
2. **Para cada contratação**, busca os itens detalhados
3. **Salva em arquivo JSON** com metadados
4. **Logs detalhados** de todo o processo
5. **Tratamento de erros** robusto com fallbacks

## 📊 Logs

Durante a sincronização, você verá logs como:
```
[2026-02-02T13:30:00.000Z] 🛒 Iniciando Sincronização de Contratações PNCP...
[PROCUREMENT SYNC] Buscando contratações de 2025...
[PROCUREMENT SYNC] Encontradas 150 contratações em 2025. Buscando itens...
[PROCUREMENT SYNC] ✅ Salvo: contratacoes_2025.json (150 contratações)
[PROCUREMENT SYNC] 🎉 Sincronização de contratações concluída!
```

## 🛠️ Manutenção

### Adicionar novos anos
Edite o array `YEARS` em `server/index.js`:
```javascript
const YEARS = ['2022', '2023', '2024', '2025', '2026', '2027'];
```

### Alterar intervalo de sincronização
Edite o valor em milissegundos:
```javascript
setInterval(() => {
  performAutomaticSync();
}, 21600000); // 6 horas = 21600000ms
```

### Verificar arquivos sincronizados
Os arquivos estão em: `dados_abertos_compras/contratacoes_YYYY.json`

## 🔍 Troubleshooting

### Dados não aparecem
1. Verifique o status: `GET /api/procurement/status`
2. Force sincronização: `POST /api/procurement/sync`
3. Verifique logs do servidor

### Sincronização falha
- Verifique conexão com a internet
- Verifique se a API do PNCP está disponível
- Veja logs de erro no console do servidor

### Dados desatualizados
- Force sincronização manual
- Verifique o campo `lastUpdated` no status
- Reinicie o servidor para forçar sincronização inicial
