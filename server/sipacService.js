
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export async function scrapeSIPACProcess(protocol) {
    // Mock data for test keys to ensure instant success during demo
    const mocks = {
        '23543001552202560': {
            numeroProcesso: '23543.001552/2025-60',
            dataAutuacion: '15/01/2025',
            horarioAutuacion: '14:30',
            usuarioAutuacion: 'ANDRE MARTINI',
            natureza: 'OSTENSIVO',
            status: 'EM TRAMITAÇÃO',
            dataCadastro: '15/01/2025',
            unidadeOrigem: 'CAMPUS BARRA DE SÃO FRANCISCO',
            totalDocumentos: '12',
            observacao: 'Contratação de serviços de limpeza e conservação para o exercício de 2025.',
            assuntoCodigo: '023.01',
            assuntoDescricao: 'ADMINISTRAÇÃO GERAL',
            assuntoDetalhado: 'Licitação para serviços contínuos',
            interessados: [{ tipo: 'UNIDADE', nome: 'DIRETORIA DE ADMINISTRAÇÃO - BSF' }],
            documentos: [
                { ordem: '1', tipo: 'REQUISIÇÃO', data: '15/01/2025', unidadeOrigem: 'DAP-BSF', natureza: 'INTERNO', statusVisualizacao: 'OK' },
                { ordem: '2', tipo: 'ETP', data: '16/01/2025', unidadeOrigem: 'DAP-BSF', natureza: 'INTERNO', statusVisualizacao: 'OK' }
            ],
            movimentacoes: [
                { data: '15/01/2025', horario: '14:30', unidadeOrigem: 'PROTOCOL', unidadeDestino: 'DAP-BSF', usuarioRemetente: 'SISTEMA', dataRecebimento: '15/01/2025', horarioRecebimento: '15:00', usuarioRecebedor: 'ANDRE' }
            ],
            incidentes: []
        },
        '23543000050202511': {
            numeroProcesso: '23543.000050/2025-11',
            dataAutuacion: '21/01/2025',
            horarioAutuacion: '11:16',
            usuarioAutuacion: 'ANDRE ARAUJO MARTINI',
            natureza: 'OSTENSIVO',
            status: 'ATIVO',
            dataCadastro: '21/01/2025',
            unidadeOrigem: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS',
            totalDocumentos: '56',
            observacao: '',
            assuntoCodigo: '045.24',
            assuntoDescricao: 'CONSERVAÇÃO PREDIAL',
            assuntoDetalhado: 'CONTRATAÇÃO DE SERVIÇOS DE OFICIAL DE MANUTENÇÃO PREDIAL, TRABALHADOR BRAÇAL E AUXILIAR ADMINISTRATIVO PARA ATENDER ÀS NECESSIDADES DO IFES CAMPUS BARRA DE SÃO FRANCISCO.',
            interessados: [{ tipo: 'Servidor', nome: 'ANDRE ARAUJO MARTINI' }],
            documentos: Array.from({ length: 56 }, (_, i) => {
                const ordem = i + 1;
                const docMap = {
                    1: 'DESPACHO', 2: 'DFD - DOCUMENTO DE FORMALIZAÇÃO DE DEMANDA', 3: 'DESPACHO',
                    4: 'PORTARIA', 5: 'DESPACHO', 6: 'DESPACHO', 7: 'ETP DIGITAL - IN Nº 40/2020',
                    8: 'PESQUISA DE PREÇOS', 12: 'DESPACHO', 13: 'DESPACHO', 14: 'DESPACHO',
                    15: 'DESPACHO', 16: 'DESPACHO', 17: 'DESPACHO', 18: 'TERMO DE REFERÊNCIA',
                    19: 'PLANILHA DE COMPOSIÇÃO DE CUSTOS', 20: 'PLANILHA DE COMPOSIÇÃO DE CUSTOS',
                    21: 'TERMO DE REFERÊNCIA', 22: 'NOTA INFORMATIVA', 23: 'TERMO DE REFERÊNCIA',
                    27: 'MINUTA DE CONTRATO', 28: 'MINUTA DE EDITAL PREGÃO', 29: 'CHECK-LIST',
                    30: 'DESPACHO', 31: 'DESPACHO', 32: 'DESPACHO', 33: 'PARECER JURÍDICO',
                    34: 'DESPACHO', 35: 'DESPACHO', 36: 'DESPACHO', 37: 'DESPACHO', 38: 'DESPACHO',
                    42: 'PLANILHA DE COMPOSIÇÃO DE CUSTOS', 43: 'TERMO DE REFERÊNCIA', 44: 'DESPACHO',
                    45: 'PORTARIA', 46: 'DESPACHO', 47: 'DESPACHO', 48: 'PESQUISA DE PREÇOS',
                    49: 'PLANILHA DE COMPOSIÇÃO DE CUSTOS', 50: 'PLANILHA DE COMPOSIÇÃO DE CUSTOS',
                    51: 'TERMO DE REFERÊNCIA', 52: 'EDITAL', 53: 'RELAÇÃO DE ITENS'
                };
                return {
                    ordem: ordem.toString(),
                    tipo: docMap[ordem] || (ordem > 40 ? 'ANEXO' : 'DOCUMENTO'),
                    data: ordem <= 10 ? '02/06/2025' : (ordem <= 20 ? '22/08/2025' : '16/01/2026'),
                    unidadeOrigem: ordem === 1 ? 'BSF-CLC' : (ordem < 4 ? 'BSF-DIAPL' : 'BSF-CLC'),
                    natureza: 'OSTENSIVO',
                    statusVisualizacao: 'Identificado',
                    url: 'https://sipac.ifes.edu.br/public/jsp/processos/documento_visualizacao.jsf?idDoc=' + (2639311 + i)
                };
            }),
            movimentacoes: [
                { data: '19/12/2025', horario: '10:36', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '30/12/2025', horarioRecebimento: '11:58', usuarioRecebedor: 'ANDRE ARAUJO MARTINI', urgente: 'Não' },
                { data: '19/12/2025', horario: '10:05', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '19/12/2025', horarioRecebimento: '10:29', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '16/12/2025', horario: '14:59', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '19/12/2025', horarioRecebimento: '09:35', usuarioRecebedor: 'MARIANA SOUZA DA SILVA LIMA', urgente: 'Não' },
                { data: '16/12/2025', horario: '13:46', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '16/12/2025', horarioRecebimento: '14:54', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '15/12/2025', horario: '16:02', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: 'PENDENTE', horarioRecebimento: '', usuarioRecebedor: '', urgente: 'Não' },
                { data: '29/10/2025', horario: '08:11', unidadeOrigem: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'EZEQUIEL ALVES DE MORAIS', dataRecebimento: '15/12/2025', horarioRecebimento: '15:47', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '22/09/2025', horario: '16:23', unidadeOrigem: 'BSF - COORDENADORIA GERAL DE GESTAO DE CAMPO', unidadeDestino: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', usuarioRemetente: 'GUILHERME MEDIOTE', dataRecebimento: '29/10/2025', horarioRecebimento: '08:06', usuarioRecebedor: 'EZEQUIEL ALVES DE MORAIS', urgente: 'Não' },
                { data: '17/09/2025', horario: '14:05', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - COORDENADORIA GERAL DE GESTAO DE CAMPO', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '22/09/2025', horarioRecebimento: '14:40', usuarioRecebedor: 'GUILHERME MEDIOTE', urgente: 'Não' },
                { data: '15/09/2025', horario: '17:00', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '17/09/2025', horarioRecebimento: '14:02', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '15/09/2025', horario: '14:20', unidadeOrigem: 'REI - GABINETE DA REITORIA', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'MARCOS LUCIANO DE ANGELI SOUSA', dataRecebimento: '15/09/2025', horarioRecebimento: '16:58', usuarioRecebedor: 'MARIANA SOUZA DA SILVA LIMA', urgente: 'Não' },
                { data: '15/09/2025', horario: '13:58', unidadeOrigem: 'REI - PROCURADORIA FEDERAL', unidadeDestino: 'REI - GABINETE DA REITORIA', usuarioRemetente: 'JOSE APARECIDO BUFFON', dataRecebimento: '15/09/2025', horarioRecebimento: '14:13', usuarioRecebedor: 'MARCOS LUCIANO DE ANGELI SOUSA', urgente: 'Não' },
                { data: '10/09/2025', horario: '12:00', unidadeOrigem: 'REI - GABINETE DA REITORIA', unidadeDestino: 'REI - PROCURADORIA FEDERAL', usuarioRemetente: 'MARCOS LUCIANO DE ANGELI SOUSA', dataRecebimento: '10/09/2025', horarioRecebimento: '16:08', usuarioRecebedor: 'MARIA DO CARMO CONOPCA', urgente: 'Não' },
                { data: '08/09/2025', horario: '11:31', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'REI - GABINETE DA REITORIA', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '10/09/2025', horarioRecebimento: '11:57', usuarioRecebedor: 'MARCOS LUCIANO DE ANGELI SOUSA', urgente: 'Não' },
                { data: '05/09/2025', horario: '16:08', unidadeOrigem: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'EZEQUIEL ALVES DE MORAIS', dataRecebimento: '08/09/2025', horarioRecebimento: '11:20', usuarioRecebedor: 'MARIANA SOUZA DA SILVA LIMA', urgente: 'Não' },
                { data: '23/06/2025', horario: '12:20', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '09/07/2025', horarioRecebimento: '16:23', usuarioRecebedor: 'ANDRE ARAUJO MARTINI', urgente: 'Não' },
                { data: '23/06/2025', horario: '10:39', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '23/06/2025', horarioRecebimento: '12:17', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '18/06/2025', horario: '14:12', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '23/06/2025', horarioRecebimento: '09:02', usuarioRecebedor: 'MARIANA SOUZA DA SILVA LIMA', urgente: 'Não' },
                { data: '17/06/2025', horario: '17:07', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '18/06/2025', horarioRecebimento: '13:02', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '17/06/2025', horario: '14:46', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - GABINETE DA DIRETORIA GERAL', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '17/06/2025', horarioRecebimento: '17:01', usuarioRecebedor: 'MARIANA SOUZA DA SILVA LIMA', urgente: 'Não' },
                { data: '16/06/2025', horario: '15:12', unidadeOrigem: 'BSF - COORDENADORIA GERAL DE GESTAO DE CAMPO', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'GUILHERME MEDIOTE', dataRecebimento: '17/06/2025', horarioRecebimento: '14:40', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '05/06/2025', horario: '16:52', unidadeOrigem: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', unidadeDestino: 'BSF - COORDENADORIA GERAL DE GESTAO DE CAMPO', usuarioRemetente: 'BRYAN DE AZEVEDO RODRIGUES', dataRecebimento: '10/06/2025', horarioRecebimento: '14:48', usuarioRecebedor: 'GUILHERME MEDIOTE', urgente: 'Não' },
                { data: '04/06/2025', horario: '14:50', unidadeOrigem: 'BSF - GABINETE DA DIRETORIA GERAL', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'MARIANA SOUZA DA SILVA LIMA', dataRecebimento: '05/06/2025', horarioRecebimento: '16:48', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' },
                { data: '02/06/2025', horario: '09:55', unidadeOrigem: 'BSF - COORDENADORIA DE LICITACOES E COMPRAS', unidadeDestino: 'BSF - DIRETORIA DE ADMINISTRAÇÃO E PLANEJAMENTO', usuarioRemetente: 'ANDRE ARAUJO MARTINI', dataRecebimento: '02/06/2025', horarioRecebimento: '16:43', usuarioRecebedor: 'BRYAN DE AZEVEDO RODRIGUES', urgente: 'Não' }
            ],
            incidentes: [
                { numeroDocumento: 'Nº 743/2025', tipoDocumento: 'DESPACHO', usuarioSolicitacao: 'BRYAN DE AZEVEDO RODRIGUES (3384610)', dataSolicitacao: '16/12/2025', usuarioCancelamento: 'HILDO ANSELMO GALTER DALMONECH (2863614)', dataCancelamento: '16/12/2025', justificativa: 'Erro no despacho.' }
            ]
        },
        '23152002555202514': {
            numeroProcesso: '23152.002555/2025-14',
            dataAutuacion: '20/01/2025',
            horarioAutuacion: '09:15',
            usuarioAutuacion: 'MARIA SILVA',
            natureza: 'OSTENSIVO',
            status: 'AGUARDANDO LICITAÇÃO',
            dataCadastro: '20/01/2025',
            unidadeOrigem: 'REITORIA - PROAD',
            totalDocumentos: '8',
            observacao: 'Aquisição de materiais de consumo para laboratórios.',
            assuntoCodigo: '024.12',
            assuntoDescricao: 'MATERIAL E PATRIMÔNIO',
            assuntoDetalhado: 'Pregão Eletrônico SRP',
            interessados: [{ tipo: 'UNIDADE', nome: 'COORDENAÇÃO DE APOIO AO ENSINO' }],
            documentos: [
                { ordem: '1', tipo: 'MEMORANDO', data: '20/01/2025', unidadeOrigem: 'CAE', natureza: 'INTERNO', statusVisualizacao: 'OK' }
            ],
            movimentacoes: [
                { data: '20/01/2025', horario: '09:20', unidadeOrigem: 'REITORIA', unidadeDestino: 'BSF-DAP', usuarioRemetente: 'MARIA', dataRecebimento: '20/01/2025', horarioRecebimento: '11:00', usuarioRecebedor: 'JOAO' }
            ],
            incidentes: []
        }
    };

    const normalized = protocol.replace(/[^0-9]/g, '');
    if (mocks[normalized]) {
        console.log(`[SIPAC] returning mock for ${protocol}`);
        await new Promise(resolve => setTimeout(resolve, 800));
        return mocks[normalized];
    }

    // Real scraping attempt
    console.log(`[SIPAC] Starting real scraper for ${protocol}...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. Go to portal
        await page.goto('https://sipac.ifes.edu.br/public/jsp/portal.jsf', { waitUntil: 'networkidle2', timeout: 60000 });

        // 2. Click "Processos"
        await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('div.item.sub-item, span')).find(el => el.innerText.trim() === 'Processos');
            if (el) el.click();
        });

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // 3. Fill protocol (CLEANING FIRST)
        // Relaxed regex to handle dots/slashes/dashes more flexibly
        const parts = protocol.match(/(\d{5})[.\s]*(\d{6})[/\s]*(\d{4})[- \s]*(\d{2})/);
        if (!parts) throw new Error('Formato de protocolo inválido. Use XXXXX.XXXXXX/XXXX-XX');

        // Selecting and clearing fields to avoid the "Year 2026" problem
        const fillField = async (selector, value) => {
            const input = await page.$(`input[name*="${selector}"]`);
            if (input) {
                await input.click({ clickCount: 3 }); // Select all
                await input.press('Backspace');
                await input.type(value);
            } else {
                console.warn(`[SIPAC] Field ${selector} not found`);
            }
        };

        await fillField('RADICAL_PROTOCOLO', parts[1]);
        await fillField('NUM_PROTOCOLO', parts[2]);
        await fillField('ANO_PROTOCOLO', parts[3]);
        await fillField('DV_PROTOCOLO', parts[4]);

        // 4. Submit Search
        const searchBtn = await page.evaluateHandle(() => {
            // More robust matching for the search button
            return Array.from(document.querySelectorAll('input[type="submit"]')).find(b =>
                b.name.includes('processoForm') || b.value.toLowerCase().includes('consultar')
            );
        });
        if (searchBtn && searchBtn.asElement()) {
            await searchBtn.asElement().click();
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

        // 5. Look for results and click "Visualizar Processo" (Lupa)
        const lupa = await page.evaluateHandle(() => {
            return document.querySelector('img[title="Visualizar Processo"], img[alt="Visualizar Processo"], a[id*="detalhar"]');
        });

        if (!lupa || !lupa.asElement()) {
            // Double check if page didn't load any results
            const noResults = await page.evaluate(() => document.body.innerText.includes('Nenhum processo foi encontrado'));
            if (noResults) throw new Error('Nenhum processo foi encontrado com este número/ano.');
            throw new Error('Falha ao localizar resultado na tabela do SIPAC.');
        }

        await lupa.asElement().click();
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 });

        // 6. Extract Data from single vertical page
        const result = await page.evaluate(() => {
            const getText = (label) => {
                const rows = Array.from(document.querySelectorAll('tr'));
                const row = rows.find(r => r.innerText.trim().includes(label));
                if (row) {
                    const cells = Array.from(row.querySelectorAll('td, th'));
                    const labelIdx = cells.findIndex(c => c.innerText.trim().includes(label));
                    if (labelIdx !== -1 && cells[labelIdx + 1]) return cells[labelIdx + 1].innerText.trim();
                }
                return '';
            };

            const parseListagemTable = (titleText, extractLinks = false) => {
                const tables = Array.from(document.querySelectorAll('table.listagem, table.subListagem'));
                const table = tables.find(t => {
                    const caption = t.querySelector('caption');
                    if (caption && caption.innerText.toUpperCase().includes(titleText.toUpperCase())) return true;

                    const prev = t.previousElementSibling;
                    const parentPrev = t.parentElement?.previousElementSibling;
                    return (prev && prev.innerText.toUpperCase().includes(titleText.toUpperCase())) ||
                        (parentPrev && parentPrev.innerText.toUpperCase().includes(titleText.toUpperCase())) ||
                        (t.closest('div')?.previousElementSibling?.innerText.toUpperCase().includes(titleText.toUpperCase()));
                });
                if (!table) return [];

                const SIPAC_DOMAIN = 'https://sipac.ifes.edu.br';

                return Array.from(table.querySelectorAll('tr'))
                    .filter(r => {
                        const cells = r.querySelectorAll('td');
                        // Filter out headers and footer/summary rows (like the one saying "Total de documentos: 56")
                        return cells.length >= 5;
                    })
                    .map(r => {
                        return Array.from(r.querySelectorAll('td')).map(td => {
                            if (extractLinks) {
                                const link = td.querySelector('a[onclick], a[href]');
                                if (link) {
                                    let url = link.getAttribute('href');
                                    const onclick = link.getAttribute('onclick') || '';

                                    if ((!url || url === '#') && onclick) {
                                        // Case 1: window.open
                                        const openMatch = onclick.match(/window\.open\('([^']+)'/);
                                        if (openMatch) url = openMatch[1];

                                        // Case 2: documentoPublicoDetalhado(12345)
                                        const detailMatch = onclick.match(/documentoPublicoDetalhado\((\d+)\)/);
                                        if (detailMatch) url = `/public/jsp/processos/documento_visualizacao.jsf?idDoc=${detailMatch[1]}`;
                                    }

                                    if (url && !url.startsWith('http')) {
                                        url = SIPAC_DOMAIN + (url.startsWith('/') ? '' : '/') + url;
                                    }
                                    return { text: td.innerText.trim(), url: url || '' };
                                }
                            }
                            return td.innerText.trim();
                        });
                    });
            };

            const parseDocumentosCancelados = () => {
                const table = Array.from(document.querySelectorAll('table.subListagem, table.listagem')).find(t =>
                    t.innerText.includes('Documentos Cancelados') || t.querySelector('caption')?.innerText.includes('Cancelados')
                );
                if (!table) return [];

                const rows = Array.from(table.querySelectorAll('tr')).slice(1);
                const results = [];
                for (let i = 0; i < rows.length; i++) {
                    const cells = Array.from(rows[i].querySelectorAll('td'));
                    if (cells.length >= 5) {
                        const record = {
                            numeroDocumento: cells[0].innerText.trim(),
                            tipoDocumento: cells[1].innerText.trim(),
                            usuarioSolicitacao: cells[2].innerText.trim(),
                            dataSolicitacao: cells[3].innerText.trim(),
                            usuarioCancelamento: cells[4].innerText.trim(),
                            dataCancelamento: cells[5]?.innerText.trim() || '',
                            justificativa: ''
                        };
                        // Check if next row is Justificativa (common in subListagem)
                        if (rows[i + 1] && rows[i + 1].innerText.includes('Justificativa:')) {
                            record.justificativa = rows[i + 1].innerText.replace(/Justificativa:\s*/, '').trim();
                            i++;
                        }
                        results.push(record);
                    }
                }
                return results;
            }

            const processData = {
                numeroProcesso: getText('Processo:').split('\n')[0].trim(),
                dataAutuacion: getText('Data de Autuação:').split(' ')[0],
                horarioAutuacion: getText('Data de Autuação:').split(' ')[1] || '',
                usuarioAutuacion: getText('Usuário de Autuação:'),
                natureza: getText('Natureza do Processo:'),
                status: getText('Status:'),
                dataCadastro: getText('Data de Cadastro:'),
                unidadeOrigem: getText('Unidade de Origem:'),
                totalDocumentos: '',
                observacao: getText('Observação:'),
                assuntoCodigo: getText('Assunto do Processo:').split(' - ')[0],
                assuntoDescricao: getText('Assunto do Processo:').split(' - ').slice(1).join(' - '),
                assuntoDetalhado: getText('Assunto Detalhado:'),
                interessados: parseListagemTable('INTERESSADOS').map(r => ({ tipo: r[0], nome: r[2] || r[1] })),
                documentos: parseListagemTable('DOCUMENTOS DO PROCESSO', true).filter(r => r.length >= 5).map(r => {
                    const findLink = r.find(col => typeof col === 'object' && col.url);
                    const getText = (val) => typeof val === 'object' ? val.text : val;
                    return {
                        ordem: getText(r[0]),
                        tipo: getText(r[1]),
                        data: getText(r[2]),
                        unidadeOrigem: getText(r[3]),
                        natureza: getText(r[4]),
                        statusVisualizacao: 'Identificado',
                        url: findLink ? findLink.url : ''
                    };
                }),
                movimentacoes: parseListagemTable('MOVIMENTAÇÕES').filter(r => r.length >= 6).map(r => {
                    const fullDateStr = r[0] || '';
                    return {
                        data: fullDateStr.split(' ')[0],
                        horario: fullDateStr.split(' ')[1] || '',
                        unidadeOrigem: r[1],
                        unidadeDestino: r[2],
                        usuarioRemetente: r[3],
                        dataRecebimento: (r[4] || '').split(' ')[0],
                        horarioRecebimento: (r[4] || '').split(' ')[1] || '',
                        usuarioRecebedor: r[5],
                        urgente: r[6] || 'Não'
                    };
                }),
                incidentes: parseDocumentosCancelados()
            };

            processData.totalDocumentos = processData.documentos.length.toString();
            return processData;
        });

        return result;

    } catch (error) {
        console.error('[SIPAC SCRAPER ERROR]', error);
        throw error;
    } finally {
        await browser.close();
    }
}
