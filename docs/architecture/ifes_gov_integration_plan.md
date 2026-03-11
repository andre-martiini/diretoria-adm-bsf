# Plano de Arquitetura: Integração de Compras e Licitações Governamentais

## 1. Padrão de Integração Identificado

Após extensa análise do repositório, foi identificado o seguinte padrão arquitetural para integrações com APIs externas:

*   **BFF (Backend For Frontend) / Proxy Gateway:** A aplicação possui um servidor Node.js (Express) em `server/index.js` que atua como um Proxy Reverso e Gateway de API (`/api/pncp/*`). Este componente realiza as chamadas diretas para serviços governamentais (como o PNCP), resolvendo problemas de CORS, padronizando *headers* (ex: `User-Agent`) e servindo como camada protetora.
*   **Sincronização Assíncrona via CRON:** O backend realiza `polling` agendado e *data-sync* periódico (`performAutomaticSync()`, `syncProcurementData()`). Ele busca dados pesados ou de paginação longa nas APIs externas, salva-os como arquivos físicos JSON (`dados_abertos_compras/contratacoes_*.json` e `public/data/pca_*.json`) ou os envia para o Firestore (se configurado).
*   **Repository / Gateway Pattern no Frontend:** O frontend abstrai a comunicação com o backend em "Services" dedicados (`services/pncpService.ts`, `services/procurementService.ts`). Estes serviços agem como *Repositories*, possuindo fallback lógico que busca, prioritariamente, os dados consolidados do cache local (gerados pela *sync* assíncrona) antes de recorrer aos *endpoints* proxy real-time, otimizando drasticamente a performance para o cliente.

Para a nova integração, vamos estender essa arquitetura existente: criar rotinas específicas de *Sync* no `server/index.js` ou adaptar os *proxies* para buscar os dados de licitação homologados, armazenando-os ou os servindo, enquanto implementamos um novo service no frontend (`govIntegrationService.ts`) que tipará as 4 modalidades conforme as novas interfaces TypeScript.

## 2. Fonte de Dados Sugerida

A melhor fonte de dados atualmente, técnica e funcionalmente, é a API do **PNCP (Portal Nacional de Contratações Públicas)**.

*   **Justificativa:** A infraestrutura atual do sistema já possui forte acoplamento e mapeamento de comportamento do ecossistema do PNCP (`pncp.gov.br`). Além disso, a documentação da API do PNCP (versão `/api/consulta/v1/orgaos/{cnpj}/compras`) suporta o retorno de dados com o detalhamento das modalidades de compra, valores e links dos objetos licitados.
*   **Endpoint Principal:** `https://pncp.gov.br/api/consulta/v1/orgaos/{cnpj}/compras?ano={ano}` e `https://pncp.gov.br/api/consulta/v1/contratacoes/...`. A API permite a extração limpa e estruturada dos campos: Número do Processo (`processo`), Objeto (`objeto` ou derivado de `itens`), Valor Homologado (`valorTotalHomologado`) e a própria Modalidade (`modalidadeNome`).

## 3. Estratégia de Filtragem e Mapeamento

A estratégia focará em extrair a vasta base de contratações e segregá-la nas 4 modalidades alvo.

*   **Filtro na Origem:** O filtro será aplicado diretamente via parâmetro de URL utilizando o CNPJ do IFES Campus Barra de São Francisco.
    *   *Constante Identificada:* `CNPJ_IFES_BSF = '10838653000106'` (`constants.ts`).
    *   As requisições à API do PNCP levarão esse CNPJ no `path`, garantindo que os dados já venham pre-filtrados do servidor do governo, diminuindo carga de rede e uso de memória da nossa aplicação.
*   **Processamento e Mapeamento (Backend ou Sync Job):**
    O payload JSON bruto que retorna da API será iterado. Através do campo `modalidadeNome` ou `amparoLegalNome`, o dado será instanciado na respectiva tipagem TypeScript (`ModalidadeContratacaoGov`).
    *   Se `modalidadeNome` for semelhante a "Pregão Eletrônico", aplicamos interface `PregaoEletronico`.
    *   Se "Dispensa de Licitação", interface `DispensaLicitacao`.
    *   Se "Inexigibilidade...", interface `InexigibilidadeLicitacao`.
    *   Se "Concorrência...", interface `Concorrencia`.
*   **Transformação de Dados:**
    *   `Número do Processo`: Mapeado da propriedade nativa (ex: `p.processo`). Uma formatação ou normalização (remover caracteres especiais, caso necessário, aproveitando a função `normalizeProcess` já existente no repositório) pode ser aplicada.
    *   `Objeto`: Se não vier na raiz da "compra", será extraído via concatenação da descrição dos "itens" da compra (buscados nos sub-endpoints).
    *   `Valor Homologado`: A API do PNCP retorna geralmente `valorTotalHomologado` após a fase interna ser concluída. É imperativo focar nesse campo; dados estritamente de `valorTotalEstimado` devem ser rejeitados se o *status* da compra exigir a homologação.

## 4. Interface e Entrega de Dados

*   **Backend:** Devemos aproveitar a função assíncrona `syncProcurementData()` presente no `server/index.js` e estendê-la. Atualmente ela gera um arquivo JSON genérico (`contratacoes_{ano}.json`). O novo fluxo consistirá em:
    1.  Um novo CRON / Endpoint de sincronização específico para homologações, ou adaptação do atual para realizar também o "split" dos dados.
    2.  Criação de novos Endpoints Proxy-REST na camada Express: `GET /api/gov-contracts/modalities?type=pregao_eletronico` (entre outros), que retornarão JSONs higienizados baseados na *Union Type* `ModalidadeContratacaoGov`.
*   **Frontend (Camada de Apresentação):** Os dados serão consumidos por um novo Service (`govIntegrationService.ts`) e entregues a componentes React já sob o padrão arquitetural de design do repositório (ex: tabelas paginadas usando Tailwind e sub-tabs na rota `/transparencia`). As tipagens estáticas já foram embutidas no `types.ts` do frontend para garantir consistência.

## 5. Mapeamento de Riscos Técnicos

*   **Limites de Taxa (*Rate Limits*) e Bloqueios WAF:**
    *   *Risco:* O PNCP e sites como o Compras.gov protegem agressivamente contra *web scraping* e tráfego elevado, retornando erros 403/429.
    *   *Mitigação:* Reuso do padrão de "Header Spoofing" (ex: forjar `User-Agent`) presente na arquitetura, aliado a *delays* entre *requests* (observados via timeouts já implementados no backend). A consolidação diária/semanal dos dados via *CRON job* (ao invés de *real-time fetching* por usuário) reduz a carga a um limite completamente tolerável pela infra governamental.
*   **Qualidade e Latência de Sincronização:**
    *   *Risco:* A API pode omitir o valor homologado até uma publicação muito tardia do certame ou os descritivos dos objetos (itens) podem acarretar falhas se os subtipos de rotas (*endpoints* `/itens`) quebrarem, conforme reportes de logs anotados no Express (`error 404`).
    *   *Mitigação:* Uso do padrão `Resilience` nas requisições do Express, incluindo `fallbacks` para outros portais (como SIPAC para objetos internos) caso a extração base falhe. Adoção de um cache robusto e validações estritas de Zod/TypeScript na entrada dos dados.
*   **Estouro de Memória no Runtime:**
    *   *Risco:* Processar e manter objetos gigantes de JSONs de vários anos simultaneamente pode causar falhas em instâncias Cloud Functions limitadas (ex: 2GB no Firebase).
    *   *Mitigação:* Usar `Streams` para escritas de JSON ou ler arquivos particionados (por ano), uma técnica já observada no projeto (`syncProcurementData` em lotes de "years"). E, preferencialmente, integrar completamente com o Firestore para buscas paginadas sob-demanda em vez de *in-memory Maps* de alta densidade no Proxy.
