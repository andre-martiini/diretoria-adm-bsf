import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import crypto from 'crypto';

puppeteer.use(StealthPlugin());

/**
 * Gera um hash MD5 determinístico para o conteúdo do processo.
 * Usado para detectar mudanças e evitar chamadas redundantes de IA.
 */
function generateSnapshotHash(data) {
    // Selecionamos campos que realmente indicam mudança no trâmite ou conteúdo
    const relevantContent = {
        status: data.status,
        unidadeAtual: data.unidadeAtual,
        movimentacoesCount: data.movimentacoes?.length,
        documentosCount: data.documentos?.length,
        ultimaMovimentacao: data.movimentacoes?.[data.movimentacoes.length - 1]?.data || '',
        assuntoDetalhado: data.assuntoDetalhado
    };
    return crypto.createHash('md5').update(JSON.stringify(relevantContent)).digest('hex');
}

export async function scrapeSIPACProcess(protocol) {
    // Mock data for test keys to ensure instant success during demo


    // Real scraping attempt
    console.log(`[SIPAC] Starting real scraper for ${protocol}...`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Optimize: Block images but keep CSS/Scripts as JSF can be sensitive
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // 1. Go to portal (Establishing session)
        console.log(`[SIPAC] Opening portal...`);
        await page.goto('https://sipac.ifes.edu.br/public/jsp/portal.jsf', { waitUntil: 'networkidle2', timeout: 90000 });

        // 2. Click "Processos" (AJAX Navigation)
        console.log(`[SIPAC] Clicking 'Processos' menu...`);
        try {
            await page.waitForSelector('div#l-processos, span#ext-gen10, .item.sub-item', { timeout: 30000 });
            await page.evaluate(() => {
                const el = document.querySelector('div#l-processos') ||
                    Array.from(document.querySelectorAll('span, div, a')).find(e => e.innerText.trim() === 'Processos');
                if (el) el.click();
            });

            // Wait for the AJAX form to appear
            console.log(`[SIPAC] Waiting for search form to load...`);
            await page.waitForSelector('#n_proc_p', { timeout: 30000 });
        } catch (err) {
            console.warn(`[SIPAC] Menu click or form load failed: ${err.message}. Trying direct recovery...`);
            // Only try direct jump if AJAX fails, though portal usually requires session
            await page.goto('https://sipac.ifes.edu.br/public/jsp/processos/processo_consulta.jsf', { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
        }

        // 3. Ensure "Nº Processo" is selected and fill fields
        console.log(`[SIPAC] Preparing search form...`);
        try {
            await page.waitForSelector('#n_proc_p', { timeout: 20000 });
        } catch (e) {
            console.log('[SIPAC] Selector #n_proc_p not found, but trying to proceed...');
        }

        await page.evaluate(() => {
            const radio = document.getElementById('n_proc_p');
            if (radio) {
                // The site uses a checkbox/radio that triggers divProcessoP(true)
                radio.click();
                radio.checked = true;
                // Force triggering the UI expansion if it hasn't happened
                if (typeof window.divProcessoP === 'function') window.divProcessoP(true);
            }
        });

        const parts = protocol.match(/(\d{5})[.\s]*(\d{6})[/\s]*(\d{4})[- \s]*(\d{2})/);
        if (!parts) throw new Error('Formato de protocolo inválido. Use XXXXX.XXXXXX/XXXX-XX');

        await page.evaluate((p) => {
            const findInput = (namePart) => Array.from(document.querySelectorAll('input')).find(i => i.name && i.name.includes(namePart));
            const fields = {
                'RADICAL_PROTOCOLO': p[1], 'NUM_PROTOCOLO': p[2], 'ANO_PROTOCOLO': p[3], 'DV_PROTOCOLO': p[4]
            };
            for (const [name, value] of Object.entries(fields)) {
                const input = findInput(name);
                if (input) {
                    input.value = value;
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('blur', { bubbles: true }));
                }
            }
        }, parts);

        // 4. Submit Search
        console.log(`[SIPAC] Clicking 'Consultar'...`);
        await Promise.all([
            page.evaluate(() => {
                const b = Array.from(document.querySelectorAll('input[type="submit"]')).find(b =>
                    b.value.toLowerCase().includes('consultar')
                );
                if (b) b.click();
            }),
            page.waitForNavigation({ waitUntil: 'load', timeout: 90000 })
        ]);

        // 5. Look for results and click "Visualizar Processo" (Lupa)
        console.log(`[SIPAC] Checking results...`);
        const lupa = await page.evaluateHandle(() => {
            return document.querySelector('img[title="Visualizar Processo"], img[alt="Visualizar Processo"], a[id*="detalhar"]');
        });

        if (!lupa || !lupa.asElement()) {
            const noResults = await page.evaluate(() => document.body.innerText.includes('Nenhum processo foi encontrado'));
            if (noResults) throw new Error('Nenhum processo foi encontrado com este número/ano.');
            throw new Error('Falha ao localizar resultado na tabela do SIPAC.');
        }

        console.log(`[SIPAC] Clicking 'Visualizar Processo'...`);
        await Promise.all([
            lupa.asElement().click(),
            page.waitForNavigation({ waitUntil: 'load', timeout: 120000 })
        ]);

        console.log(`[SIPAC] Extracting data...`);
        // 6. Extract Data from single vertical page
        const result = await page.evaluate(() => {
            const getText = (label) => {
                // Try finding the label in <td> or <th>
                const cells = Array.from(document.querySelectorAll('td, th'));

                // 1. Exact match with colon
                let targetCell = cells.find(c => c.innerText.trim().replace(/\s+/g, ' ').toUpperCase() === label.toUpperCase());

                // 2. Or starts with label
                if (!targetCell) {
                    targetCell = cells.find(c => c.innerText.trim().replace(/\s+/g, ' ').toUpperCase().startsWith(label.toUpperCase()));
                }

                if (targetCell) {
                    // Strategy A: Value is in the next sibling cell
                    const next = targetCell.nextElementSibling;
                    if (next && next.tagName === 'TD') {
                        return next.innerText.trim();
                    }

                    // Strategy B: Value is text node inside the same cell (after a <br> or <b>)
                    // If the cell text contains the label, remove the label from it
                    const fullText = targetCell.innerText.trim();
                    if (fullText.toUpperCase().includes(label.toUpperCase())) {
                        const valueInfo = fullText.slice(fullText.toUpperCase().indexOf(label.toUpperCase()) + label.length).trim();
                        // Clean up colons if they remain
                        return valueInfo.replace(/^[:\s]+/, '').trim();
                    }
                }

                // Fallback for very specific layouts (like "Processo: XXXXX")
                const allText = document.body.innerText;
                const regex = new RegExp(`${label}\\s*[:]?\\s*(.*)`, 'i');
                const match = allText.match(regex);
                if (match && match[1]) return match[1].trim();

                return 'Não informado';
            };

            const parseListagemTable = (titleText, extractLinks = false) => {
                const tables = Array.from(document.querySelectorAll('table'));

                const table = tables.find(t => {
                    const cleanTitle = titleText.toUpperCase();

                    // 1. Check caption
                    const caption = t.querySelector('caption');
                    if (caption && caption.innerText.toUpperCase().includes(cleanTitle)) return true;

                    // 2. Check first row header
                    const firstHeader = t.querySelector('th');
                    if (firstHeader && firstHeader.innerText.toUpperCase().includes(cleanTitle)) return true;

                    // 3. Check previous siblings (often a div or span with the title)
                    let prev = t.previousElementSibling;
                    while (prev) {
                        if (prev.innerText && prev.innerText.toUpperCase().includes(titleText.toUpperCase())) return true;
                        // Don't look too far up
                        if (prev.tagName === 'TABLE' || prev.tagName === 'HR') break;
                        prev = prev.previousElementSibling;
                    }

                    // 4. Check parent's previous sibling (common structure in SIPAC)
                    const parentPrev = t.parentElement?.previousElementSibling;
                    if (parentPrev && parentPrev.innerText.toUpperCase().includes(cleanTitle)) return true;

                    return false;
                });

                if (!table) return [];

                const SIPAC_DOMAIN = 'https://sipac.ifes.edu.br';

                return Array.from(table.querySelectorAll('tr'))
                    .filter(r => {
                        // Skip header rows explicitly
                        const text = r.innerText.toUpperCase();
                        if (text.includes('TIPO') && text.includes('NOME') && text.includes('IDENTIFICADOR')) return false;
                        if (r.className.includes('header')) return false;

                        const cells = r.querySelectorAll('td');
                        return cells.length >= 2;
                    })
                    .map(r => {
                        const cells = Array.from(r.querySelectorAll('td'));
                        // If specifically looking for Interessados, we expect [Tyoe, Name] or similar
                        if (titleText === 'INTERESSADOS') {
                            // layout: [Tipo, Identificador, Nome]
                            const tipo = cells[0] ? cells[0].innerText.trim() : '';
                            // cells[1] is identifier, usually masked
                            const nome = cells[2] ? cells[2].innerText.trim() : (cells[1] ? cells[1].innerText.trim() : '');
                            return { tipo, nome };
                        }

                        return cells.map(td => {
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

            const interessadosRaw = parseListagemTable('INTERESSADOS').map(r => ({ tipo: r.tipo, nome: r.nome }));
            // Filter out empty interessados
            const interessados = interessadosRaw.filter(i => i && i.nome && i.nome.trim() !== '');

            const movimentacoes = parseListagemTable('MOVIMENTAÇÕES').filter(r => r.length >= 6).map(r => {
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
            });

            // Determine Unidade Atual based on last movement destination or falling back to origin
            let unidadeAtual = getText('Unidade de Origem:');
            if (movimentacoes.length > 0) {
                // The list usually comes ordered, but let's confirm logic if needed. 
                // Assuming top-down or bottom-up, checking the most recent date is safer, 
                // but usually the first row in "Movimentações" is the oldest. 
                // Actually in SIPAC, usually the last one in the list is the most recent action? 
                // Let's trust the 'Unidade de Origem' field from the header mostly, OR the last destination.
                // A safe bet for "Current Unit" is the destination of the last movement.
                const lastMov = movimentacoes[movimentacoes.length - 1];
                if (lastMov) unidadeAtual = lastMov.unidadeDestino;
            }

            return {
                numeroProcesso: getText('Processo:').split('\n')[0].trim(),
                dataAutuacion: getText('Data de Autuação:').split(' ')[0],
                horarioAutuacion: getText('Data de Autuação:').split(' ')[1] || '',
                usuarioAutuacion: getText('Usuário de Autuação:'),
                natureza: getText('Natureza do Processo:'),
                status: getText('Status:'),
                dataCadastro: getText('Data de Cadastro:'),
                unidadeOrigem: getText('Unidade de Origem:'),
                unidadeAtual: unidadeAtual, // Explicitly return this field
                totalDocumentos: '',
                observacao: getText('Observação:'),
                assuntoCodigo: getText('Assunto do Processo:').split(' - ')[0],
                assuntoDescricao: getText('Assunto do Processo:').split(' - ').slice(1).join(' - '),
                assuntoDetalhado: getText('Assunto Detalhado:'),
                interessados: interessados,
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
                movimentacoes: movimentacoes,
                incidentes: parseDocumentosCancelados()
            };
        });

        result.totalDocumentos = result.documentos.length.toString();
        result.snapshot_hash = generateSnapshotHash(result);
        result.scraping_last_error = null; // Sucesso

        return result;

    } catch (error) {
        console.error('[SIPAC SCRAPER ERROR]', error);

        let errorMessage = "Erro Desconhecido";
        if (error.message.includes('timeout')) errorMessage = "Timeout (Portal Lento)";
        if (error.message.includes('Protocolo não encontrado')) errorMessage = "Processo Não Encontrado";
        if (error.message.includes('formato de protocolo')) errorMessage = "Protocolo Inválido";
        if (error.message.includes('Navigation failed')) errorMessage = "Falha de Rede/Conexão";

        return {
            numeroProcesso: protocol,
            scraping_last_error: errorMessage,
            status: "ERRO_SCRAPING",
            documentos: [],
            movimentacoes: [],
            incidentes: []
        };
    } finally {
        await browser.close();
    }
}

export async function scrapeSIPACDocumentContent(url) {
    console.log(`[SIPAC] Fetching document content from: ${url}`);
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(45000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for content container if possible, or just extract body text
        // Despachos are usually in a specific table or div
        const content = await page.evaluate(() => {
            // SIPAC specific content areas
            const contentArea = document.querySelector('div.conteudo, table.listagem, #visualizacaoDocumento');
            if (contentArea) return contentArea.innerText.trim();

            // Fallback for PDF or other types (though PDF won't return text this way)
            // But for Despachos (which are HTML), this works.
            const bodyText = document.body.innerText.trim();

            // Clean up common header/footer if needed
            return bodyText.split('Imprimir')[0].trim();
        });

        return content;
    } catch (error) {
        console.error(`[SIPAC DOC ERROR] ${url}:`, error);
        throw error;
    } finally {
        await browser.close();
    }
}
