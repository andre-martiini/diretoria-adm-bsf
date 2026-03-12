const BASE_ORGAO = {
  cnpj: '10838653000106',
  razaoSocial: 'INSTITUTO FEDERAL DE EDUCACAO CIENCIA E TECNOLOGIA DO ESPIRITO SANTO',
  poderId: 'E',
  esferaId: 'F'
};

const BASE_UNIDADE = {
  codigoUnidade: '158886',
  nomeUnidade: 'IFES - CAMPUS BARRA DE SAO FRANCISCO',
  municipioNome: 'Barra de Sao Francisco',
  ufSigla: 'ES',
  codigoIbge: '3200904'
};

const ENRICH_COMPANY_LINES = [
  '2025|23543.000657/2025-00|NACIONAL TREINAMENTOS LTDA',
  '2025|23543.000035/2025-73|Conselho Regional de Quimica 21a Regiao',
  '2025|23543.000081/2023-19|Empresa Brasil de Comunicacao (EBC)',
  '2025|23543.000347/2025-87|Concessionaria de Energia Eletrica',
  '2025|23543.000468/2025-29|Concessionaria de Agua e Esgoto',
  '2025|23543.001604/2025-06|COMPANHIA ESPIRITO SANTENSE DE SANEAMENTO (CESAN)',
  '2024|23543.000055/2024-63|Empresa Brasileira de Correios e Telegrafos',
  '2024|23543.000057/2024-52|DISPLAK INDUSTRIA E COMERCIO DE PLACAS EIRELI',
  '2024|23543.000949/2024-53|Concessionaria de Energia Eletrica'
];

const HISTORICAL_INEX_LINES = [
  '2022|01|23543.000250/2022-21|2022-03-16|ASSOCIACAO BRASILEIRA DE EDUCACAO A DISTANCIA - ABED|1000|Contratacao de inscricao em treinamento/capacitacao referente a participacao de servidor no evento/curso 27 CIAED Congresso Internacional ABED de Educacao a Distancia, a ser realizado na cidade de Fortaleza/CE, ofertado pela Associacao Brasileira de Educacao a Distancia - ABED, CNPJ 00.975.548/0001-57, no periodo de 20/03 a 24/03/2022.',
  '2020|11|23543.000936/2020-42|2020-11-24|INOVA CONSULTORIA, CURSOS E EVENTOS LTDA|800|Contratacao de inscricao em treinamento/capacitacao referente a participacao de servidor no evento/curso Folha de Pagamento Aplicado aos Sistemas de Governo, SIAPE, SIAPEcad e Modulos SIGEPE, a ser realizado na modalidade EAD (Online), ofertado pela INOVA CONSULTORIA, CURSOS E EVENTOS LTDA, CNPJ 11.615.516/0001-67, no periodo de 30/11 a 04/12/2020 (20 horas).',
  '2020|10|23543.000887/2020-07|2020-11-20|ONE CURSOS - TREINAMENTO, DESENVOLVIMENTO E CAPACITACAO LTDA|1390|Contratacao de inscricao para treinamento/capacitacao referente a participacao no evento/curso Tesouro Gerencial (Governo Federal). Elaboracao de Relatorios Orcamentarios, Financeiros, Contabeis e Patrimoniais, extraidos do SIAFI, alem de Consultas otimizadas Docs. Contabeis, a ser realizado na modalidade Online (EAD), ofertado pela ONE CURSOS - TREINAMENTO, DESENVOLVIMENTO E CAPACITACAO LTDA, CNPJ 06.012.731/0001-33, no periodo de 07/12 a 11/12/2020 (24 horas).',
  '2020|09|23543.000893/2020-39|2020-11-13|ONE CURSOS - TREINAMENTO, DESENVOLVIMENTO E CAPACITACAO LTDA|1390|Contratacao de inscricao para treinamento/capacitacao referente a participacao no evento Curso Online Gestao Imobiliaria com Enfase no Spiunet - Atualizado pela Portaria Conjunta, de 31.07.2020, a ser realizado na modalidade Online (a distancia), ofertado pela ONE CURSOS - TREINAMENTO, DESENVOLVIMENTO E CAPACITACAO LTDA, CNPJ 06.012.731/0001-33, no periodo de 30/11/2020 a 04/12/2020 (20 horas).',
  '2020|08|23543.000730/2020-75|2020-09-24|INOVE CAPACITACAO - CONSULTORIA E TREINAMENTOS LTDA - ME|800|Contratacao de inscricao para treinamento/capacitacao referente a participacao no evento Contratacao de Bens e Servicos de Tecnologia da Informacao e Comunicacao - TIC, Atualizado com Base em Conformidade com as NOVAS INs 01/2019 e 02/2019 e a Jurisprudencia do TCU, a ser realizado na modalidade Online (a distancia), ofertado pela INOVE CAPACITACAO - CONSULTORIA E TREINAMENTOS LTDA - ME - CNPJ 27.883.894/0001-61, nos dias 24 e 25/09/2020.',
  '2020|07|23543.000571/2020-03|2020-08-18|ESPIRITO SANTO SECRETARIA DE ESTADO DA FAZENDA|2909.3|Pagamento de tributos estaduais, seguro DPVAT e licenciamento anual para os veiculos oficiais do Ifes Campus Barra de Sao Francisco (Exercicio 2020).',
  '2020|06|23543.000573/2020-46|2020-08-07|INSTITUTO NEGOCIOS PUBLICOS DO BRASIL - ESTUDOS E PESQUISAS NA ADMINISTRACAO PUBLICA|1995|Contratacao de inscricao para treinamento/capacitacao referente a participacao no evento 15 Congresso Brasileiro de Pregoeiros, a ser realizado na modalidade Online (a distancia), ofertado pelo Instituto Negocios Publicos do Brasil - Estudos e Pesquisas na Administracao Publica - INP Ltda, CNPJ 10.498.974/0002-81, no periodo de 10 a 13 de Agosto de 2020.',
  '2020|05|23543.000586/2020-83|2020-08-07|INSTITUTO NEGOCIOS PUBLICOS DO BRASIL - ESTUDOS E PESQUISAS NA ADMINISTRACAO PUBLICA|1995|Contratacao de inscricao para treinamento/capacitacao referente a participacao no evento 15 Congresso Brasileiro de Pregoeiros, a ser realizado na modalidade Online (a distancia), ofertado pelo Instituto Negocios Publicos do Brasil - Estudos e Pesquisas na Administracao Publica - INP Ltda, CNPJ 10.498.974/0002-81, no periodo de 10 a 13 de Agosto de 2020.',
  '2020|04|23543.000535/2020-05|2020-07-27|MUNICIPIO DE BARRA DE SAO FRANCISCO|7116.69|Pagamento de tributos municipais perante a Secretaria de Fazenda da Prefeitura Municipal de Barra de Sao Francisco/ES para quitacao do Imposto sobre a Propriedade Predial e Territorial Urbana (IPTU) e da taxa de coleta de lixo urbano/rural do imovel, objeto do convenio tripartite 02/2019 entre o Instituto Federal do Espirito Santo/Prefeitura Municipal de Barra de Sao Francisco/SICOOB Norte-ES.',
  '2020|03|23543.000328/2020-65|2020-05-21|EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS|2000|Contratacao de servicos de correspondencia da Empresa Brasileira de Correios e Telegrafos para atender as necessidades do Ifes Campus Barra de Sao Francisco.',
  '2020|02|23543.000031/2020-33|2020-02-14|Companhia Espirito Santense de Saneamento CESAN|12000|Contratacao de empresa fornecedora de agua tratada, coleta e tratamento de esgoto sanitario.',
  '2020|01|23543.000018/2020-93|2020-01-31|INOVE TREINAMENTOS LTDA|3300|Inscricao em curso/treinamento - SIAFI Week Avancado Marco de 2020 - Curso completo segundo o novo PCASP.',
  '2019|12|23543.000934/2019-02|2019-10-17|PREFEITURA MUNICIPAL DE BARRA DE SAO FRANCISCO|7425.42|Recolhimento de taxa, imposto, multa junto a Secretaria da Fazenda municipal.',
  '2019|11|23543.000830/2019-94|2019-10-02|INSTITUTO NEGOCIOS PUBLICOS DO BRASIL - INP|3815|Inscricao em curso/treinamento - 13 Pregao Week.',
  '2019|10|23543.000404/2019-80|2019-06-25|CONSAE CONSULTORIA EM ASSUNTOS EDUCACIONAIS SIMPLES LTDA|3750|Contratacao de inscricao para Treinamento/Capacitacao referente ao curso sobre Controle e Registro Academico de Instituicoes de Ensino Superior, a ser realizado na cidade de Sao Paulo/SP, no periodo de 21 a 23/08/2019, ofertado pela empresa CONSAE CONSULTORIA EM ASSUNTOS EDUCACIONAIS SIMPLES LTDA.',
  '2019|09|23543.000725/2018-01|2019-04-22|Rede Nacional de Ensino e Pesquisa - RNP|2048|Inscricao em curso/treinamento - Planejamento e Contratacao de Servicos de TI.',
  '2019|08|23543.000159/2019-19|2019-04-03|Companhia Espirito Santense de Saneamento CESAN|10000|Contratacao de empresa fornecedora de agua tratada, coleta e tratamento de esgoto sanitario.',
  '2019|07|23543.000161/2019-80|2019-03-27|Nacional Treinamentos Eireli-Me|2390|Contratacao de inscricao em curso pratico de Legislacao de Pessoal.',
  '2019|06|23543.000024/2019-45|2019-03-27|Consultre - Consultoria e Treinamento Ltda|2590|Contratacao de inscricao em curso de Folha de Pagamento do Funcionalismo Publico, Servidores Civis, RPPS e Relacao Estatutaria.',
  '2019|05|23543.000140/2019-64|2019-03-13|Open Treinamentos Empresariais e Editora Ltda.|2980|Inscricao de participacao no curso Gestao Tributaria de Contratos e Convenios.',
  '2019|04|23543.000106/2019-90|2019-03-07|INSTITUTO NEGOCIOS PUBLICOS DO BRASIL - INP|7894|Inscricao em curso/treinamento - 14 Congresso de Pregoeiros.',
  '2019|03|23543.000127/2019-13|2019-02-22|DETRAN / Espirito Santo Secretaria de Estado da Fazenda|1400|Licenciamento e DPVAT.',
  '2019|02|23543.000112/2019-47|2019-02-21|EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS|2000|Correios/Postagens.',
  '2019|01|23543.000062/2019-06|2019-02-12|Companhia Espirito Santense de Saneamento CESAN|805.15|Analise de viabilidade tecnica para fornecimento de agua tratada e rede de coleta de esgoto dos predios do Campus BSF, Zona Rural.',
  '2018|19|23543.000725/2018-01|2018-09-25|Escola de Administracao Fazendaria - ESAF|2000|Inscricao de participacao em treinamento na XV Semana Orcamentaria - Etapa Rio de Janeiro.',
  '2018|18|23543.000717/2018-57|2018-09-25|Connect On Marketing de Eventos Ltda|4800|Inscricao em curso de capacitacao/Treinamento de elaboracao de Planilhas de Custos Segundo a IN05 e a Reforma Trabalhista.',
  '2018|17|23543.000720/2018-71|2018-09-13|Fundacao Parque Tecnologico Itaipu - Brasil|120|15 Congresso Latino-Americano de Software Livre e Tecnologias Abertas.',
  '2018|16|23543.000609/2018-84|2018-09-06|Instituto ESAFI de Treinamentos e Eventos Ltda|1590|Cursos de Planejamento e Gestao de Almoxarifado no setor publico.',
  '2018|15|23543.000538/2018-10|2018-08-22|INSTITUTO FEDERAL DE ALAGOAS|480|XXXVIII Encontro Nacional de Dirigentes de Pessoal e RH - IF.',
  '2018|14|23543.000381/2018-22|2018-07-05|ESAFI - Escola de Administracao e Treinamento Ltda|2690|Participacao em evento de capacitacao - SCDP: Sistema de Concessao de Diarias e Passagens (Legislacao e Pratica).',
  '2018|13|23543.000383/2018-11|2018-06-15|Con Treinamentos|2590|Inscricao em curso/treinamento de elaboracao de planilhas de orcamentos de obras - Sinapi Avancado.',
  '2018|12|23543.000368/2018-73|2018-06-11|One Cursos e Treinamentos|2790|Inscricao em curso pratico de Conformidade Contabil.',
  '2018|11|23543.000362/2018-04|2018-06-11|INSTITUTO FEDERAL DE ALAGOAS|450|XXXVIII Encontro Nacional de Dirigentes de Pessoal e RH - IF.',
  '2018|10|23543.000478/2018-35|2018-05-22|Consultre - Consultoria e Treinamento Ltda|490|Contratacao de inscricao em curso de Execucao Orcamentaria, Financeira e Contabil de forma integrada na Administracao Publica.',
  '2018|09|23543.000443/2018-04|2018-05-11|PRIORI TREINAMENTO E APERFEICOAMENTO LTDA EPP|2450|Inscricao em curso/treinamento Pratica Siape e SiapeCad.',
  '2018|08|23543.000296/2018-64|2018-04-20|Associacao Educacional para Multipla Deficiencia - AHIMSA|1090|Inscricao em curso/treinamento Guia-Interprete.',
  '2018|07|23543.000297/2018-17|2018-04-20|InoveCapacitacao - Consultoria e Treinamentos - ME|5980|Inscricao em curso de Capacitacao e Formacao de Pregoeiro.',
  '2018|06|23543.000280/2018-51|2018-04-05|ESAFI - Escola de Administracao e Treinamento Ltda|2690|Inscricao em curso/treinamento - Siafi Operacional e Siafi Web.',
  '2018|05|23543.000149/2018-41|2018-03-23|InoveCapacitacao - Consultoria e Treinamentos - ME|2690|Inscricao em curso/treinamento Planilha de Custos IN 05/2017.',
  '2018|04|23543.000152/2018-57|2018-03-12|ESAFI - Escola de Administracao e Treinamento Ltda|2490|Inscricao em curso/treinamento Legislacao de Pessoal.',
  '2018|03|23543.000083/2018-77|2018-02-27|S.A. A GAZETA|1147|Jornal A Gazeta.',
  '2018|02|23543.000017/2018-16|2018-01-10|ESPIRITO SANTO SECRETARIA DE ESTADO DA FAZENDA|670.67|Licenciamento e DPVAT.',
  '2018|01|23543.000003/2018-06|2018-01-10|EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS|4100|Correios.'
];

const HISTORICAL_PREGAO_LINES = [
  '2023|01|23543.000355/2023-61|2024-01-09|413834.44|Aquisicao de materiais diversos, para atender as necessidades da Coordenadoria de Servicos Auxiliares e Transporte do Ifes Campus Barra de Sao Francisco e demais orgaos participantes, conforme condicoes, quantidades e exigencias estabelecidas no edital e seus anexos.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2023/00_Edital_SRP_012023_Ifes_BSF_compressed.pdf',
  '2023|02|23543.000648/2023-49|2023-11-07|106683.84|Contratacao de pessoa juridica para prestacao de servicos de apoio administrativo - auxiliar administrativo, conforme condicoes, quantidades e exigencias estabelecidas no edital e seus anexos, nas dependencias do Ifes Campus Barra de Sao Francisco, pelo periodo de 12 meses, prorrogavel ate 60 meses.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2023/00_Edital_022023_Ifes_BSF_Apoio_Adm.pdf',
  '2022|01|23543.000913/2020-81|2022-03-28|73.28|Concessao onerosa de uso de espaco fisico pertencente ao Instituto Federal do Espirito Santo Campus Barra de Sao Francisco, visando a instalacao de uma cantina para atender as demandas de alunos, servidores e visitantes.|Licitacao deserta|https://saofrancisco.ifes.edu.br/images/stories/0._EDITAL_Completo.pdf',
  '2021|01|23543.000981/2019-91|2021-10-26|261973.44|Contratacao de servicos de vigilancia patrimonial armada, vinte e quatro horas ininterruptas, nas dependencias do Ifes Campus Barra de Sao Francisco.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2021/00_Edital_Vigil%C3%A2ncia_BSF_FINAL_2021.pdf',
  '2020|01|23543.000851/2019-12|2020-01-22||Contratacao de empresa especializada para prestacao de servico de manutencao corretiva e preventiva das instalacoes prediais, execucao indireta, atraves de posto de Oficial Polivalente, conforme condicoes, quantidades e exigencias estabelecidas no edital e seus anexos.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2020/Edital_PE_01_2020_Manut_Predial.pdf',
  '2020|02|23543.000033/2020-76|2020-05-04|170344.37|Contratacao de prestacao de servicos continuados de limpeza e conservacao, com fornecimento de equipamentos, uniformes, EPIs e materiais de limpeza necessarios a execucao dos servicos, nas dependencias do Ifes Campus Barra de Sao Francisco.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2020/Edital_022020_Limpeza_Conservacao_Completo.pdf',
  '2019|01|23543.000632/2018-79|2019-09-02|65383.26|Contratacao de servicos de conducao de veiculo (Motorista), conforme condicoes, quantidades e exigencias estabelecidas no edital e seus anexos.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Pregao_Eletronico/2019/Edital_012019_Motorista.pdf'
];

const HISTORICAL_DISPENSA_LINES = [
  '2024|90013|23543000698202415|2024-09-10|VERA CRUZ SERVICOS LTDA|24708.04|Contratacao de pessoa juridica para prestacao de servicos continuos de Apoio Administrativo Auxiliar Administrativo, em regime de dedicacao exclusiva de mao de obra, para o Ifes Campus Barra de Sao Francisco, nas condicoes estabelecidas no Edital do Pregao Eletronico n 02/2023 e seus anexos.|Divulgada no DOU|https://pesquisa.in.gov.br/imprensa/jsp/visualiza/index.jsp?data=10/09/2024&jornal=530&pagina=40|dispensa',
  '2022|05|23543.000285/2022-61||||Contratacao de empresa para fornecimento de eletrodomesticos (Forno Micro-ondas e Freezer) para o Ifes Campus Barra de Sao Francisco.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Edital/Cotacao_Eletronica/Termo_Referencia_Eletrodomesticos.pdf|cotacao',
  '2022|02|||||Contratacao de empresa para fornecimento de materiais eletricos para o Ifes Campus Barra de Sao Francisco.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/PDFs/TR_Mat_Eletrico_BSF_2022.pdf|cotacao',
  '2021|04|||||Placa de Inauguracao do Ifes Campus Barra de Sao Francisco.|Divulgada no site do campus|https://saofrancisco.ifes.edu.br/images/stories/Imagens/TR_Anexo_Final.pdf|cotacao'
];

function buildHistoricalRecord(line) {
  const [year, numeroCompra, processo, date, empresa, valor, objetoCompra] = line.split('|');
  return {
    year,
    anoCompra: Number(year),
    numeroCompra,
    processo,
    modalidadeNome: 'Inexigibilidade',
    modoDisputaNome: 'Nao se aplica',
    empresa,
    objetoCompra,
    valorTotalEstimado: Number(valor),
    valorTotalHomologado: Number(valor),
    dataPublicacaoPncp: `${date}T00:00:00`,
    dataInclusao: `${date}T00:00:00`,
    dataAtualizacao: `${date}T00:00:00`,
    situacaoCompraNome: 'Divulgada no site do campus',
    orgaoEntidade: BASE_ORGAO,
    unidadeOrgao: BASE_UNIDADE,
    tipoInstrumentoConvocatorioNome: 'Inexigibilidade',
    manualSource: 'manual_ifes_bsf_site'
  };
}

function buildHistoricalPregaoRecord(line) {
  const [year, numeroCompra, processo, date, valor, objetoCompra, situacaoCompraNome, sourceUrl] = line.split('|');
  const numericValue = Number(valor);
  const parsedValue = Number.isFinite(numericValue) ? numericValue : null;

  return {
    year,
    anoCompra: Number(year),
    numeroCompra,
    processo,
    modalidadeNome: 'Pregao Eletronico',
    modoDisputaNome: 'Aberto',
    objetoCompra,
    valorTotalEstimado: parsedValue,
    valorTotalHomologado: parsedValue,
    dataPublicacaoPncp: `${date}T00:00:00`,
    dataAberturaProposta: `${date}T00:00:00`,
    dataInclusao: `${date}T00:00:00`,
    dataAtualizacao: `${date}T00:00:00`,
    situacaoCompraNome: situacaoCompraNome || 'Divulgada no site do campus',
    orgaoEntidade: BASE_ORGAO,
    unidadeOrgao: BASE_UNIDADE,
    tipoInstrumentoConvocatorioNome: 'Edital',
    manualSource: 'manual_ifes_bsf_site',
    manualSourceUrl: sourceUrl || null
  };
}

function buildHistoricalDispensaRecord(line) {
  const [year, numeroCompra, processo, date, empresa, valor, objetoCompra, situacaoCompraNome, sourceUrl, entryType] = line.split('|');
  const numericValue = Number(valor);
  const parsedValue = Number.isFinite(numericValue) ? numericValue : null;
  const normalizedDate = date || null;
  const isCotacao = String(entryType || '').trim().toLowerCase() === 'cotacao';

  return {
    year,
    anoCompra: Number(year),
    numeroCompra,
    processo: processo || null,
    modalidadeNome: 'Dispensa',
    modoDisputaNome: isCotacao ? 'Cotacao Eletronica' : 'Dispensa Eletronica',
    empresa: empresa || null,
    objetoCompra,
    valorTotalEstimado: parsedValue,
    valorTotalHomologado: parsedValue,
    dataPublicacaoPncp: normalizedDate ? `${normalizedDate}T00:00:00` : null,
    dataAberturaProposta: normalizedDate ? `${normalizedDate}T00:00:00` : null,
    dataInclusao: normalizedDate ? `${normalizedDate}T00:00:00` : null,
    dataAtualizacao: normalizedDate ? `${normalizedDate}T00:00:00` : null,
    situacaoCompraNome: situacaoCompraNome || 'Divulgada no site do campus',
    orgaoEntidade: BASE_ORGAO,
    unidadeOrgao: BASE_UNIDADE,
    tipoInstrumentoConvocatorioNome: isCotacao ? 'Cotacao Eletronica' : 'Aviso de Contratacao Direta',
    manualSource: 'manual_ifes_bsf_site',
    manualSourceUrl: sourceUrl || null
  };
}

function buildEnrichmentRecord(line) {
  const [year, processo, empresa] = line.split('|');
  return { year, processo, empresa, manualSource: 'manual_ifes_bsf_site' };
}

export const MANUAL_GOV_CONTRACTS = {
  metadata: {
    updatedAt: '2026-03-12T00:00:00.000Z',
    source: 'manual_ifes_bsf_site'
  },
  data: [
    ...ENRICH_COMPANY_LINES.map(buildEnrichmentRecord),
    ...HISTORICAL_INEX_LINES.map(buildHistoricalRecord),
    ...HISTORICAL_PREGAO_LINES.map(buildHistoricalPregaoRecord),
    ...HISTORICAL_DISPENSA_LINES.map(buildHistoricalDispensaRecord)
  ]
};
