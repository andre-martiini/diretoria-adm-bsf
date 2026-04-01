# Relatório de Investigação: Integração NUP e Planejamento Governamental

## Objetivo
Investigar a viabilidade de associar automaticamente o Número Único de Protocolo (NUP) aos dados de planejamento da contratação (PCA/DFD) utilizando APIs governamentais públicas, visando permitir que o usuário insira o NUP e obtenha dados estruturados desde o início do processo.

## Metodologia
1.  **Análise de Código Local:** Inspeção dos serviços de integração existentes (`server/sipacService.js`, `server/index.js`) e dados locais (`pca_2026.json`, `execution_data.json`).
2.  **Investigação de APIs Externas:** Análise das APIs do Portal Nacional de Contratações Públicas (PNCP) e do Sistema de Planejamento e Gerenciamento de Contratações (PGC/Dados Abertos).
3.  **Verificação de Documentos:** Análise da estrutura de dados de retorno das fases de Planejamento (PCA) e Execução (Compras).

## Resultados

### 1. Disponibilidade do NUP nas Fases da Contratação

| Fase da Contratação | Sistema Governo | API Analisada | NUP Disponível? | Observação |
| :--- | :--- | :--- | :--- | :--- |
| **Planejamento Inicial (DFD/PCA)** | PGC / PNCP | `GET /pca/{ano}/itens` | **NÃO** | O NUP não consta como campo estruturado nos itens do PCA retornados pela API pública. |
| **Fase Interna (Instrução)** | SIPAC (Interno) | Scraping Local | **SIM** | O NUP é gerado na autuação e está disponível no SIPAC desde o início. |
| **Execução/Licitação** | Compras.gov.br / PNCP | `GET /compras` | **SIM** | O campo `processo` (NUP) é obrigatório e está presente nos dados estruturados desta fase. |

### 2. Análise Detalhada

*   **API PNCP (Planejamento):** A API pública do PNCP para o Plano de Contratações Anual (PCA) retorna dados agrupados por `grupoContratacaoCodigo` e `numeroItem`, mas **não vincula nativamente** o número do processo administrativo (NUP) a esses itens. O vínculo no governo federal geralmente ocorre apenas quando o processo avança para a fase de contratação efetiva ou quando o DFD é explicitamente vinculado a uma compra.
*   **Documentos DFD:** Embora o "Documento de Formalização da Demanda" (DFD) cite o número do processo em seu **conteúdo de texto** (PDF/HTML), este dado não é exposto como metadado estruturado na API de Dados Abertos de forma confiável para consulta em massa.
*   **Dados Locais:** Os arquivos locais (`public/data/execution_data.json`) confirmam que o campo `processo` (ex: `23543...`) só aparece nos dados oriundos da API de "Contratações/Compras", e não nos arquivos de PCA (`pca_2026.json`).

## Conclusão e Recomendação

O Número do Processo (NUP) **não aparece de forma estruturada nas APIs públicas do governo federal nas fases iniciais de planejamento (PCA/DFD)**. Ele passa a constar nos dados públicos integrados principalmente nas fases intermediárias e finais (Execução/Publicação do Edital).

**Recomendação Técnica:**
Para obter o NUP na fase inicial (Planejamento) dentro da aplicação, a estratégia mais viável continua sendo:
1.  **Integração com SIPAC (Já existente):** Manter o uso do *Web Scraping* ou API local do SIPAC para buscar os dados do processo assim que ele é autuado internamente.
2.  **Vínculo Manual Assistido:** O usuário informa o NUP (já que ele detém essa informação ao abrir o processo) e o sistema busca os dados no SIPAC, permitindo ao usuário selecionar manualmente quais itens do PCA farão parte daquele processo.
3.  **Não depender do PNCP para NUP Inicial:** Não é recomendável aguardar a disponibilização do NUP via API do PNCP para a fase de planejamento, pois esse dado não está presente na estrutura atual.
