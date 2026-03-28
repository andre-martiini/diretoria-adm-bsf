# Especificação Técnica: Web Scraping SIPAC

Este documento descreve a tecnologia e a metodologia utilizadas para realizar o *web scraping* do sistema SIPAC (Sistema Integrado de Patrimônio, Administração e Contratos), com o objetivo de permitir a replicação do fluxo em outros sistemas.

## 1. Stack Tecnológica

*   **Runtime:** Node.js
*   **Biblioteca Principal:** `puppeteer-extra`
*   **Plugins Essenciais:** `puppeteer-extra-plugin-stealth` (Crítico para evitar detecção de bots e bloqueios por WAF).
*   **Auxiliares:**
    *   `axios`: Para downloads diretos quando possível.
    *   `crypto`: Para geração de hashes de integridade.
    *   `mime-types`: Para identificação de extensões de arquivos.

## 2. Fluxo de Navegação e Acesso

O SIPAC utiliza sessões baseadas em JSF. Para garantir que a consulta funcione, é necessário primeiro estabelecer uma sessão visitando o portal público.

1.  **Acesso Inicial:** Navegar para `https://sipac.ifes.edu.br/public/jsp/portal.jsf`.
2.  **Navegação para Consulta:**
    *   Clicar no menu "Processos" (identificado por `div#l-processos` ou texto "Processos").
    *   Caso a navegação AJAX falhe, pode-se tentar o salto direto para `https://sipac.ifes.edu.br/public/jsp/processos/processo_consulta.jsf`.

## 3. Estrutura da Página de Consulta

### Seletores e Variáveis
Para realizar a busca por número de processo, o sistema preenche os seguintes campos:

*   **Seleção do Tipo de Busca:** Clicar no elemento `#n_proc_p` (Radio button para busca por número).
    *   *Nota:* O site dispara uma função JavaScript `divProcessoP(true)` ao clicar.
*   **Campos de Entrada (Inputs):** Os nomes dos inputs variam, mas geralmente contêm as seguintes strings em seus atributos `name`:
    1.  `RADICAL_PROTOCOLO`: Primeiros 5 dígitos (Ex: 23147).
    2.  `NUM_PROTOCOLO`: 6 dígitos centrais.
    3.  `ANO_PROTOCOLO`: 4 dígitos do ano.
    4.  `DV_PROTOCOLO`: 2 dígitos verificadores.
*   **Ação de Busca:** Localizar e clicar no `input[type="submit"]` que contenha o valor "Consultar".

## 4. Extração de Dados do Processo

Após a busca, o sistema identifica o link de visualização através do seletor:
`img[title="Visualizar Processo"], img[alt="Visualizar Processo"], a[id*="detalhar"]`

### Lógica de Parsing (Processamento de Dados)
A extração é baseada em rótulos (labels) nas tabelas verticais do SIPAC.

*   **Campos Simples:** Busca-se por uma célula (`<td>` ou `<th>`) cujo texto corresponda ao rótulo desejado (ex: "Processo:", "Status:", "Assunto Detalhado:"). O valor costuma estar no `nextElementSibling` (célula vizinha) ou após o rótulo no mesmo elemento.
*   **Tabelas de Listagem (Interessados, Movimentações, Documentos):**
    *   As tabelas são identificadas via `caption` ou verificando se o elemento anterior (`previousElementSibling`) contém títulos como "DOCUMENTOS DO PROCESSO".
    *   **Documentos:** Para cada linha da tabela de documentos, extraímos a ordem, tipo, data e a URL de visualização.

## 5. Captura e Download de Documentos

Esta é a parte mais sensível do sistema, pois o SIPAC pode retornar HTML (Despachos) ou arquivos binários (PDFs).

### Tática 1: Download Direto (Axios)
Se a URL contiver `verArquivoDocumento` ou `downloadArquivo=true`, tentamos uma requisição GET via `axios` com os seguintes cabeçalhos para simular um navegador real:
*   `User-Agent`: (Utilizar um de navegador moderno)
*   `Referer`: `https://sipac.ifes.edu.br/public/jsp/portal.jsf`
*   `Accept-Language`: `pt-BR,pt;q=0.9`

### Tática 2: Fallback Puppeteer (CDP)
Caso o download direto seja bloqueado, utilizamos o Puppeteer com o protocolo Chrome DevTools (CDP):
1.  Configuramos o comportamento de download: `Page.setDownloadBehavior` para `allow` em uma pasta temporária.
2.  Navegamos para a URL do documento.
3.  **Tratamento de Encoding:** O SIPAC utiliza nativamente `ISO-8859-1`. Para documentos HTML, é necessário converter o buffer para string usando `TextDecoder('iso-8859-1')` e então substituir as meta tags para `UTF-8` antes de processar ou exibir.
4.  **Polling de Arquivo:** Verificamos a pasta temporária até que o arquivo (ex: `.pdf`) apareça e não tenha mais extensões temporárias como `.crdownload`.

## 6. Extração de Conteúdo de Documentos HTML (Despachos)
Para documentos que são páginas HTML, o conteúdo relevante geralmente está dentro de:
*   `div.conteudo`
*   `table.listagem`
*   `#visualizacaoDocumento`

O sistema limpa o HTML removendo botões de impressão e scripts antes de retornar o conteúdo puro ou formatado.

---
**Objetivo Final Replicável:** Seguindo esta estrutura de sessões, preenchimento de formulários via seletores dinâmicos e táticas de download com tratamento de encoding, qualquer sistema pode integrar-se ao SIPAC para monitoramento de processos e captura de documentos originais.
