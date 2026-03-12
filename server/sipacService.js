import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import axios from 'axios';
import os from 'os';
import { load } from 'cheerio';




puppeteer.use(StealthPlugin());

const SIPAC_BASE_URL = 'https://sipac.ifes.edu.br';
const SIPAC_PORTAL_URL = `${SIPAC_BASE_URL}/public/jsp/portal.jsf`;
const SIPAC_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT; Windows NT 10.0; pt-BR) WindowsPowerShell/5.1.26100.4202'
];

function buildSIPACHeaders(userAgent, extraHeaders = {}) {
    return {
        'user-agent': userAgent,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6',
        ...extraHeaders
    };
}

function createCookieJar() {
    return new Map();
}

function updateCookieJar(cookieJar, response) {
    const cookies = typeof response?.headers?.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];

    for (const rawCookie of cookies) {
        const firstPart = String(rawCookie || '').split(';')[0];
        const separator = firstPart.indexOf('=');
        if (separator <= 0) continue;
        cookieJar.set(firstPart.slice(0, separator).trim(), firstPart.slice(separator + 1).trim());
    }
}

function serializeCookies(cookieJar) {
    return Array.from(cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
}

function isCaptchaResponse(response, html) {
    const finalUrl = String(response?.url || '');
    const body = String(html || '');
    return finalUrl.includes('validate.perfdrive.com') ||
        /radware captcha page/i.test(body) ||
        /we apologize for the inconvenience/i.test(body) ||
        /request unblock to the website/i.test(body);
}

async function openSIPACPortalSession() {
    for (const userAgent of SIPAC_USER_AGENTS) {
        const cookieJar = createCookieJar();
        const response = await fetch(SIPAC_PORTAL_URL, {
            headers: buildSIPACHeaders(userAgent),
            redirect: 'follow'
        });
        updateCookieJar(cookieJar, response);
        const html = await response.text();

        if (!isCaptchaResponse(response, html) && html.includes('id="processoForm"')) {
            return { html, userAgent, cookieJar };
        }
    }

    throw new Error('SIPAC anti-bot bloqueou a consulta publica.');
}

async function fetchSIPACText(url, context, options = {}) {
    const headers = buildSIPACHeaders(context.userAgent, options.headers || {});
    const cookieHeader = serializeCookies(context.cookieJar);
    if (cookieHeader) headers.cookie = cookieHeader;

    const response = await fetch(url, {
        redirect: 'follow',
        ...options,
        headers
    });

    updateCookieJar(context.cookieJar, response);
    const html = await response.text();

    if (isCaptchaResponse(response, html)) {
        throw new Error('SIPAC anti-bot bloqueou a consulta publica.');
    }

    return { response, html };
}

function normalizeWhitespace(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toAbsoluteSIPACUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return SIPAC_BASE_URL + (url.startsWith('/') ? '' : '/') + url;
}

function extractUrlFromOnclick(onclick) {
    const rawOnclick = String(onclick || '');
    const openMatch = rawOnclick.match(/window\.open\('([^']+)'/i);
    if (openMatch?.[1]) return openMatch[1];

    const detailMatch = rawOnclick.match(/(\/[^'"]*processo_detalhado[^'"]*)/i);
    if (detailMatch?.[1]) return detailMatch[1];

    const processIdMatch = rawOnclick.match(/detalhar\((\d+)\)/i);
    if (processIdMatch?.[1]) return `/public/jsp/processos/processo_detalhado.jsf?id=${processIdMatch[1]}`;

    const documentIdMatch = rawOnclick.match(/documentoPublicoDetalhado\((\d+)\)/i);
    if (documentIdMatch?.[1]) return `/public/jsp/processos/documento_visualizacao.jsf?idDoc=${documentIdMatch[1]}`;

    return '';
}

function getDirectRows($, $table) {
    const rows = [];
    ['thead', 'tbody', 'tfoot'].forEach((sectionName) => {
        $table.children(sectionName).each((_, section) => {
            rows.push(...$(section).children('tr').toArray());
        });
    });

    if (rows.length === 0) {
        rows.push(...$table.children('tr').toArray());
    }

    return rows;
}

function findProcessDetailUrl(html) {
    const $ = load(html);
    const candidates = $('a[href], a[onclick], img[onclick]').toArray();

    for (const element of candidates) {
        const $element = $(element);
        const href = $element.attr('href') || '';
        const onclick = $element.attr('onclick') || '';
        const title = ($element.attr('title') || '').toLowerCase();
        const alt = ($element.attr('alt') || '').toLowerCase();
        const text = normalizeWhitespace($element.text()).toLowerCase();

        if (
            href.includes('processo_detalhado') ||
            onclick.toLowerCase().includes('processo_detalhado') ||
            onclick.toLowerCase().includes('detalhar(') ||
            title.includes('visualizar processo') ||
            alt.includes('visualizar processo') ||
            text.includes('visualizar processo')
        ) {
            return toAbsoluteSIPACUrl(href || extractUrlFromOnclick(onclick));
        }
    }

    return '';
}

function parseListagemTable($, titleText, extractLinks = false) {
    const cleanTitle = normalizeTitle(titleText);
    const weakTitle = cleanTitle.slice(0, 8);
    const titleMatches = (text) => {
        const normalized = normalizeTitle(text);
        if (!normalized) return false;
        if (cleanTitle && normalized.includes(cleanTitle)) return true;
        if (cleanTitle && cleanTitle.includes(normalized)) return true;
        if (weakTitle.length >= 5 && normalized.includes(weakTitle)) return true;
        return false;
    };

    const table = $('table.subListagem, table.listagem').toArray().find((rawTable) => {
        const $table = $(rawTable);
        const captionText = normalizeWhitespace($table.children('caption').first().text());
        if (captionText && titleMatches(captionText)) return true;

        let previous = $table.prev();
        while (previous.length) {
            const text = normalizeWhitespace(previous.text());
            if (text && titleMatches(text)) return true;

            const tagName = String(previous.get(0)?.tagName || '').toLowerCase();
            if (tagName === 'table' || tagName === 'hr') break;
            previous = previous.prev();
        }

        return false;
    });

    if (!table) return [];

    return getDirectRows($, $(table))
        .filter((row) => {
            const $row = $(row);
            const text = normalizeWhitespace($row.text()).toUpperCase();
            if (text.includes('TIPO') && text.includes('NOME') && text.includes('IDENTIFICADOR')) return false;
            if (String($row.attr('class') || '').includes('header')) return false;
            return $row.children('td').length >= 2;
        })
        .map((row) => {
            const $row = $(row);
            const cells = $row.children('td').toArray();

            if (String(titleText || '').toUpperCase().includes('INTERESS')) {
                return {
                    tipo: normalizeWhitespace($(cells[0]).text()),
                    nome: normalizeWhitespace($(cells[2] || cells[1]).text())
                };
            }

            return cells.map((cell) => {
                const $cell = $(cell);
                if (extractLinks) {
                    const link = $cell.find('a[onclick], a[href]').first();
                    if (link.length) {
                        const href = link.attr('href') || '';
                        const onclick = link.attr('onclick') || '';
                        return {
                            text: normalizeWhitespace($cell.text()),
                            url: toAbsoluteSIPACUrl(href && href !== '#' ? href : extractUrlFromOnclick(onclick))
                        };
                    }
                }

                return normalizeWhitespace($cell.text());
            });
        });
}

function parseDocumentosCancelados($) {
    const table = $('table.subListagem, table.listagem').toArray().find((rawTable) => {
        const $table = $(rawTable);
        const captionText = normalizeWhitespace($table.children('caption').first().text());
        const tableText = normalizeWhitespace($table.text());
        return tableText.includes('Documentos Cancelados') || captionText.includes('Cancelados');
    });

    if (!table) return [];

    const rows = getDirectRows($, $(table));
    const results = [];

    for (let index = 0; index < rows.length; index += 1) {
        const cells = $(rows[index]).children('td').toArray();
        if (cells.length < 5) continue;

        const record = {
            numeroDocumento: normalizeWhitespace($(cells[0]).text()),
            tipoDocumento: normalizeWhitespace($(cells[1]).text()),
            usuarioSolicitacao: normalizeWhitespace($(cells[2]).text()),
            dataSolicitacao: normalizeWhitespace($(cells[3]).text()),
            usuarioCancelamento: normalizeWhitespace($(cells[4]).text()),
            dataCancelamento: normalizeWhitespace($(cells[5]).text()),
            justificativa: ''
        };

        const nextRowText = normalizeWhitespace($(rows[index + 1]).text());
        if (nextRowText.includes('Justificativa:')) {
            record.justificativa = nextRowText.replace(/Justificativa:\s*/i, '').trim();
            index += 1;
        }

        results.push(record);
    }

    return results;
}

function getCellText(value) {
    return typeof value === 'object' && value !== null ? value.text : value;
}

function getTextFromDetailPage($, label) {
    const normalizedLabel = normalizeWhitespace(label).toUpperCase();
    const cells = $('td, th').toArray();

    let targetCell = cells.find((cell) => normalizeWhitespace($(cell).text()).toUpperCase() === normalizedLabel);
    if (!targetCell) {
        targetCell = cells.find((cell) => normalizeWhitespace($(cell).text()).toUpperCase().startsWith(normalizedLabel));
    }

    if (targetCell) {
        const $targetCell = $(targetCell);
        const nextCell = $targetCell.next('td');
        if (nextCell.length) return normalizeWhitespace(nextCell.text());

        const fullText = normalizeWhitespace($targetCell.text());
        if (fullText.toUpperCase().includes(normalizedLabel)) {
            return fullText.slice(fullText.toUpperCase().indexOf(normalizedLabel) + normalizedLabel.length).replace(/^[:\s]+/, '').trim();
        }
    }

    const bodyText = normalizeWhitespace($('body').text());
    const match = bodyText.match(new RegExp(`${escapeRegExp(label)}\\s*:?\\s*(.*)`, 'i'));
    if (match?.[1]) return match[1].trim();

    return 'Não informado';
}

function parseSIPACDetailHtml(html) {
    const $ = load(html);

    const interessados = parseListagemTable($, 'INTERESSADOS')
        .map((item) => ({ tipo: item.tipo, nome: item.nome }))
        .filter((item) => item?.nome);

    const movimentacoes = parseListagemTable($, 'MOVIMENTACOES')
        .filter((row) => row.length >= 6)
        .map((row) => {
            const sentDate = String(row[0] || '').split(' ');
            const receivedDate = String(row[4] || '').split(' ');
            return {
                data: sentDate[0] || '',
                horario: sentDate[1] || '',
                unidadeOrigem: row[1] || '',
                unidadeDestino: row[2] || '',
                usuarioRemetente: row[3] || '',
                dataRecebimento: receivedDate[0] || '',
                horarioRecebimento: receivedDate[1] || '',
                usuarioRecebedor: row[5] || '',
                urgente: row[6] || 'Não'
            };
        })
        .filter((item) =>
            /^\d{2}\/\d{2}\/\d{4}$/.test(String(item.data || '').trim()) &&
            String(item.unidadeOrigem || '').trim() !== '' &&
            String(item.unidadeDestino || '').trim() !== ''
        );

    const documentos = [];
    const seenDocuments = new Set();

    parseListagemTable($, 'DOCUMENTOS DO PROCESSO', true)
        .filter((row) => {
            const ordem = String(getCellText(row[0]) || '').trim();
            const dataDocumento = String(getCellText(row[2]) || '').trim();
            return row.length >= 5 && /^\d+$/.test(ordem) && /^\d{2}\/\d{2}\/\d{4}$/.test(dataDocumento);
        })
        .forEach((row) => {
            const linkColumn = row.find((column) => typeof column === 'object' && column.url);
            const documentRecord = {
                ordem: getCellText(row[0]),
                tipo: getCellText(row[1]),
                data: getCellText(row[2]),
                unidadeOrigem: getCellText(row[3]),
                natureza: getCellText(row[4]),
                statusVisualizacao: 'Identificado',
                url: linkColumn ? linkColumn.url : ''
            };

            const key = `${documentRecord.ordem}|${documentRecord.tipo}|${documentRecord.data}`;
            if (seenDocuments.has(key)) return;
            seenDocuments.add(key);
            documentos.push(documentRecord);
        });

    let unidadeAtual = getTextFromDetailPage($, 'Unidade de Origem:');
    if (movimentacoes.length > 0) {
        unidadeAtual = movimentacoes[movimentacoes.length - 1].unidadeDestino;
    }

    return {
        numeroProcesso: getTextFromDetailPage($, 'Processo:').split('\n')[0].trim(),
        dataAutuacion: getTextFromDetailPage($, 'Data de Autuação:').split(' ')[0],
        horarioAutuacion: getTextFromDetailPage($, 'Data de Autuação:').split(' ')[1] || '',
        usuarioAutuacion: getTextFromDetailPage($, 'Usuário de Autuação:'),
        natureza: getTextFromDetailPage($, 'Natureza do Processo:'),
        status: getTextFromDetailPage($, 'Status:'),
        dataCadastro: getTextFromDetailPage($, 'Data de Cadastro:'),
        unidadeOrigem: getTextFromDetailPage($, 'Unidade de Origem:'),
        unidadeAtual,
        totalDocumentos: String(documentos.length),
        observacao: getTextFromDetailPage($, 'Observação:'),
        assuntoCodigo: getTextFromDetailPage($, 'Assunto do Processo:').split(' - ')[0],
        assuntoDescricao: getTextFromDetailPage($, 'Assunto do Processo:').split(' - ').slice(1).join(' - '),
        assuntoDetalhado: getTextFromDetailPage($, 'Assunto Detalhado:'),
        interessados,
        documentos,
        movimentacoes,
        incidentes: parseDocumentosCancelados($)
    };
}

function getPuppeteerLaunchOptions() {
    const executableCandidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH,
        process.env.EDGE_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ].filter(Boolean);

    const executablePath = executableCandidates.find(candidate => fs.existsSync(candidate));

    return {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        ...(executablePath ? { executablePath } : {})
    };
}

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
    try {
        const parts = protocol.match(/(\d{5})[.\s]*(\d{6})[/\s]*(\d{4})[- \s]*(\d{2})/);
        console.log(`[SIPAC] Starting HTTP scraper for ${protocol}...`);
        if (!parts) throw new Error('Formato de protocolo inválido. Use XXXXX.XXXXXX/XXXX-XX');

        console.log(`[SIPAC] Opening portal...`);
        const session = await openSIPACPortalSession();
        const context = {
            userAgent: session.userAgent,
            cookieJar: session.cookieJar
        };

        const formMatch = session.html.match(/<form[^>]*id="processoForm"[^>]*action="([^"]+)"[\s\S]*?<\/form>/i);
        if (!formMatch?.[0] || !formMatch?.[1]) {
            throw new Error('Falha ao localizar formulario publico do SIPAC.');
        }

        const hiddenInputs = Array.from(formMatch[0].matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi));
        const submitMatch = formMatch[0].match(/<input[^>]*type="submit"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/i);
        const params = new URLSearchParams();

        hiddenInputs.forEach((match) => params.set(match[1], match[2]));
        params.set('tipo_consulta', '100');
        params.set('RADICAL_PROTOCOLO', parts[1]);
        params.set('NUM_PROTOCOLO', parts[2]);
        params.set('ANO_PROTOCOLO', parts[3]);
        params.set('DV_PROTOCOLO', parts[4]);
        if (submitMatch?.[1]) {
            params.set(submitMatch[1], submitMatch[2] || 'Consultar Processo');
        }

        console.log(`[SIPAC] Submitting process search...`);
        const actionUrl = new URL(formMatch[1], SIPAC_BASE_URL).href;
        const { html: resultsHtml } = await fetchSIPACText(actionUrl, context, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (/Nenhum processo foi encontrado/i.test(resultsHtml)) {
            throw new Error('Nenhum processo foi encontrado com este numero/ano.');
        }

        console.log(`[SIPAC] Checking results...`);
        const detailUrl = findProcessDetailUrl(resultsHtml);
        if (!detailUrl) {
            throw new Error('Falha ao localizar resultado na tabela do SIPAC.');
        }

        console.log(`[SIPAC] Opening process detail page...`);
        const { html: detailHtml } = await fetchSIPACText(detailUrl, context);

        console.log(`[SIPAC] Extracting data...`);
        const result = parseSIPACDetailHtml(detailHtml);
        result.detailUrl = detailUrl;
        result.totalDocumentos = result.documentos.length.toString();
        result.snapshot_hash = generateSnapshotHash(result);
        result.scraping_last_error = null;

        return result;

    } catch (error) {
        console.error('[SIPAC SCRAPER ERROR]', error);

        const rawError = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
        let errorMessage = "Erro Desconhecido";

        if (error.message.includes('timeout')) errorMessage = "Timeout (Portal Lento)";
        if (error.message.includes('Protocolo nÃ£o encontrado')) errorMessage = "Processo NÃ£o Encontrado";
        if (error.message.includes('formato de protocolo')) errorMessage = "Protocolo InvÃ¡lido";
        if (error.message.includes('Navigation failed')) errorMessage = "Falha de Rede/ConexÃ£o";
        if (rawError.includes('timeout')) errorMessage = "Timeout (Portal Lento)";
        if (rawError.includes('protocolo nÃ£') || rawError.includes('protocolo na')) errorMessage = "Processo Nao Encontrado";
        if (rawError.includes('formato de protocolo')) errorMessage = "Protocolo Invalido";
        if (rawError.includes('navigation failed')) errorMessage = "Falha de Rede/Conexao";
        if (rawError.includes('falha ao localizar resultado')) errorMessage = "Falha ao localizar resultado na busca publica";
        if (rawError.includes('anti-bot')) errorMessage = "SIPAC bloqueou a consulta automatizada";

        return {
            numeroProcesso: protocol,
            scraping_last_error: errorMessage,
            status: "ERRO_SCRAPING",
            interessados: [],
            documentos: [],
            movimentacoes: [],
            incidentes: []
        };
    }
}

async function scrapeSIPACProcessBrowser(protocol) {
    // Mock data for test keys to ensure instant success during demo


    // Real scraping attempt
    console.log(`[SIPAC] Starting real scraper for ${protocol}...`);
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

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

        // 1. Go to portal and then open the public process search page with the session established.
        console.log(`[SIPAC] Opening portal...`);
        await page.goto('https://sipac.ifes.edu.br/public/jsp/portal.jsf', { waitUntil: 'networkidle2', timeout: 90000 });

        const hasSearchForm = async () => page.evaluate(() =>
            !!document.querySelector('form#processoForm input[name="RADICAL_PROTOCOLO"], form#processoForm input[name="NUM_PROTOCOLO"]')
        );

        const tryDirectSearchPage = async () => {
            await page.goto('https://sipac.ifes.edu.br/public/jsp/portal.jsf', {
                waitUntil: 'networkidle2',
                timeout: 30000
            }).catch(() => null);

            if (await hasSearchForm()) return true;

            await page.waitForSelector('#n_proc_p, input[name*="RADICAL_PROTOCOLO"]', { timeout: 5000 }).catch(() => null);
            return hasSearchForm();
        };

        console.log(`[SIPAC] Opening process search page...`);
        let searchPageReady = await tryDirectSearchPage();

        if (!searchPageReady) {
            console.warn('[SIPAC] Direct search page failed. Trying menu fallback...');
            await page.goto('https://sipac.ifes.edu.br/public/jsp/portal.jsf', { waitUntil: 'networkidle2', timeout: 60000 });

            await page.evaluate(() => {
                const el = document.querySelector('div#l-processos') ||
                    Array.from(document.querySelectorAll('span, div, a')).find(e => e.innerText.trim() === 'Processos');
                if (el) el.click();
            });

            await page.waitForSelector('#n_proc_p, input[name*="RADICAL_PROTOCOLO"]', { timeout: 10000 }).catch(() => null);
            searchPageReady = await hasSearchForm();
        }

        if (!searchPageReady) {
            console.warn('[SIPAC] Menu fallback unavailable. Trying direct recovery...');
            searchPageReady = await tryDirectSearchPage();
        }

        // 3. Ensure "Nº Processo" is selected and fill fields
        console.log(`[SIPAC] Preparing search form...`);
        try {
            await page.waitForSelector('#n_proc_p, input[name*="RADICAL_PROTOCOLO"]', { timeout: 20000 });
        } catch (e) {
            console.log('[SIPAC] Selector #n_proc_p not found, but trying to proceed...');
        }

        await page.evaluate(() => {
            const radio = document.querySelector('form#processoForm #n_proc_p');
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
            const form = document.querySelector('form#processoForm');
            const findInput = (namePart) => Array.from(form?.querySelectorAll('input') || []).find(i => i.name && i.name.includes(namePart));
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
        const clickedConsultar = await page.evaluate(() => {
            const form = document.querySelector('form#processoForm');
            const submitBtn = Array.from(form?.querySelectorAll('input[type="submit"]') || []).find(b =>
                (b.value || '').toLowerCase().includes('consultar')
            );
            if (submitBtn) {
                submitBtn.click();
                return true;
            }

            const genericBtn = Array.from(form?.querySelectorAll('button, a, span, div') || []).find(el =>
                (el.innerText || '').trim().toLowerCase() === 'consultar'
            );
            if (genericBtn && typeof genericBtn.click === 'function') {
                genericBtn.click();
                return true;
            }

            if (form && typeof form.submit === 'function') {
                form.submit();
                return true;
            }
            return false;
        });

        if (!clickedConsultar) throw new Error('Falha ao acionar consulta no SIPAC.');

        // Some SIPAC screens update via JSF/AJAX without full navigation.
        await Promise.race([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => null),
            page.waitForSelector('img[title*="Visualizar"], img[alt*="Visualizar"], a[id*="detalhar"], a[href*="processo_detalhado"]', { timeout: 45000 }).catch(() => null),
            page.waitForFunction(() => {
                const text = (document.body?.innerText || '').toLowerCase();
                return text.includes('nenhum processo foi encontrado');
            }, { timeout: 45000 }).catch(() => null)
        ]);

        // 5. Look for results and open process details
        console.log(`[SIPAC] Checking results...`);
        const detailUrl = await page.evaluate(() => {
            const SIPAC_DOMAIN = 'https://sipac.ifes.edu.br';
            const toAbs = (url) => {
                if (!url) return '';
                if (url.startsWith('http')) return url;
                return SIPAC_DOMAIN + (url.startsWith('/') ? '' : '/') + url;
            };

            const extractUrlFromOnclick = (onclick) => {
                if (!onclick) return '';
                const openMatch = onclick.match(/window\.open\('([^']+)'/i);
                if (openMatch && openMatch[1]) return openMatch[1];
                const detailMatch = onclick.match(/(\/[^'"]*processo_detalhado[^'"]*)/i);
                if (detailMatch && detailMatch[1]) return detailMatch[1];
                const idMatch = onclick.match(/detalhar\((\d+)\)/i);
                if (idMatch && idMatch[1]) return `/public/jsp/processos/processo_detalhado.jsf?id=${idMatch[1]}`;
                return '';
            };

            const candidates = Array.from(document.querySelectorAll('a[href], a[onclick], img[onclick]'));
            for (const el of candidates) {
                const href = el.getAttribute('href') || '';
                const onclick = el.getAttribute('onclick') || '';
                const title = (el.getAttribute('title') || '').toLowerCase();
                const alt = (el.getAttribute('alt') || '').toLowerCase();
                const text = (el.textContent || '').toLowerCase();

                if (
                    href.includes('processo_detalhado') ||
                    onclick.toLowerCase().includes('processo_detalhado') ||
                    onclick.toLowerCase().includes('detalhar(') ||
                    title.includes('visualizar processo') ||
                    alt.includes('visualizar processo') ||
                    text.includes('visualizar processo')
                ) {
                    const resolved = href || extractUrlFromOnclick(onclick);
                    if (resolved) return toAbs(resolved);
                }
            }
            return '';
        });

        if (!detailUrl) {
            const noResults = await page.evaluate(() => (document.body?.innerText || '').includes('Nenhum processo foi encontrado'));
            if (noResults) throw new Error('Nenhum processo foi encontrado com este numero/ano.');
            throw new Error('Falha ao localizar resultado na tabela do SIPAC.');
        }

        console.log(`[SIPAC] Opening process detail page...`);
        await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 120000 });

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

            const normalizeTitle = (value) => String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');

            const getDirectCaptionText = (table) => {
                const caption = Array.from(table.children).find(child => child.tagName === 'CAPTION');
                return caption ? caption.innerText.trim() : '';
            };

            const getDirectRows = (table) => {
                const rows = [];
                if (table.tHead) rows.push(...Array.from(table.tHead.rows));
                Array.from(table.tBodies || []).forEach(body => rows.push(...Array.from(body.rows)));
                if (table.tFoot) rows.push(...Array.from(table.tFoot.rows));
                return rows;
            };

            const parseListagemTable = (titleText, extractLinks = false) => {
                const tables = Array.from(document.querySelectorAll('table.subListagem, table.listagem'));

                const table = tables.find(t => {
                    const cleanTitle = normalizeTitle(titleText);
                    const weakTitle = cleanTitle.slice(0, 8);
                    const titleMatches = (text) => {
                        const normalized = normalizeTitle(text);
                        if (!normalized) return false;
                        if (cleanTitle && normalized.includes(cleanTitle)) return true;
                        if (cleanTitle && cleanTitle.includes(normalized)) return true;
                        if (weakTitle.length >= 5 && normalized.includes(weakTitle)) return true;
                        return false;
                    };

                    const caption = getDirectCaptionText(t);
                    if (caption && titleMatches(caption)) return true;

                    let prev = t.previousElementSibling;
                    while (prev) {
                        if (prev.innerText && titleMatches(prev.innerText)) return true;
                        if (prev.tagName === 'TABLE' || prev.tagName === 'HR') break;
                        prev = prev.previousElementSibling;
                    }

                    return false;
                });

                if (!table) return [];

                const SIPAC_DOMAIN = 'https://sipac.ifes.edu.br';

                return getDirectRows(table)
                    .filter(r => {
                        const text = String(r.innerText || '').toUpperCase();
                        if (text.includes('TIPO') && text.includes('NOME') && text.includes('IDENTIFICADOR')) return false;
                        if (r.className.includes('header')) return false;

                        const cells = Array.from(r.children).filter(cell => cell.tagName === 'TD');
                        return cells.length >= 2;
                    })
                    .map(r => {
                        const cells = Array.from(r.children).filter(cell => cell.tagName === 'TD');
                        if (String(titleText || '').toUpperCase().includes('INTERESS')) {
                            const tipo = cells[0] ? cells[0].innerText.trim() : '';
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

            const getCellText = (value) => typeof value === 'object' ? value.text : value;

            const interessadosRaw = parseListagemTable('INTERESSADOS').map(r => ({ tipo: r.tipo, nome: r.nome }));
            // Filter out empty interessados
            const interessados = interessadosRaw.filter(i => i && i.nome && i.nome.trim() !== '');

            const movimentacoes = parseListagemTable('MOVIMENTACOES').filter(r => r.length >= 6).map(r => {
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

            const movimentacoesFiltradas = movimentacoes.filter(mov =>
                /^\d{2}\/\d{2}\/\d{4}$/.test(String(mov.data || '').trim()) &&
                String(mov.unidadeOrigem || '').trim() !== '' &&
                String(mov.unidadeDestino || '').trim() !== ''
            );

            const documentosProcessoRaw = parseListagemTable('DOCUMENTOS DO PROCESSO', true)
                .filter(r => {
                    const ordem = String(getCellText(r[0]) || '').trim();
                    const dataDocumento = String(getCellText(r[2]) || '').trim();
                    return r.length >= 5 && /^\d+$/.test(ordem) && /^\d{2}\/\d{2}\/\d{4}$/.test(dataDocumento);
                })
                .map(r => {
                    const findLink = r.find(col => typeof col === 'object' && col.url);
                    return {
                        ordem: getCellText(r[0]),
                        tipo: getCellText(r[1]),
                        data: getCellText(r[2]),
                        unidadeOrigem: getCellText(r[3]),
                        natureza: getCellText(r[4]),
                        statusVisualizacao: 'Identificado',
                        url: findLink ? findLink.url : ''
                    };
                });

            const documentosProcesso = [];
            const documentosKeys = new Set();
            for (const doc of documentosProcessoRaw) {
                const docKey = `${doc.ordem}|${doc.tipo}|${doc.data}`;
                if (documentosKeys.has(docKey)) continue;
                documentosKeys.add(docKey);
                documentosProcesso.push(doc);
            }

            // Determine Unidade Atual based on last movement destination or falling back to origin
            let unidadeAtual = getText('Unidade de Origem:');
            if (movimentacoesFiltradas.length > 0) {
                // The list usually comes ordered, but let's confirm logic if needed. 
                // Assuming top-down or bottom-up, checking the most recent date is safer, 
                // but usually the first row in "Movimentações" is the oldest. 
                // Actually in SIPAC, usually the last one in the list is the most recent action? 
                // Let's trust the 'Unidade de Origem' field from the header mostly, OR the last destination.
                // A safe bet for "Current Unit" is the destination of the last movement.
                const lastMov = movimentacoesFiltradas[movimentacoesFiltradas.length - 1];
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
                documentos: documentosProcesso,
                movimentacoes: movimentacoesFiltradas,
                incidentes: parseDocumentosCancelados()
            };
        });

        result.totalDocumentos = result.documentos.length.toString();
        result.snapshot_hash = generateSnapshotHash(result);
        result.scraping_last_error = null; // Sucesso

        return result;

    } catch (error) {
        console.error('[SIPAC SCRAPER ERROR]', error);

        const rawError = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();

        let errorMessage = "Erro Desconhecido";
        if (error.message.includes('timeout')) errorMessage = "Timeout (Portal Lento)";
        if (error.message.includes('Protocolo não encontrado')) errorMessage = "Processo Não Encontrado";
        if (error.message.includes('formato de protocolo')) errorMessage = "Protocolo Inválido";
        if (error.message.includes('Navigation failed')) errorMessage = "Falha de Rede/Conexão";
        if (rawError.includes('timeout')) errorMessage = "Timeout (Portal Lento)";
        if (rawError.includes('protocolo nã') || rawError.includes('protocolo na')) errorMessage = "Processo Nao Encontrado";
        if (rawError.includes('formato de protocolo')) errorMessage = "Protocolo Invalido";
        if (rawError.includes('navigation failed')) errorMessage = "Falha de Rede/Conexao";
        if (rawError.includes('falha ao localizar resultado')) errorMessage = "Falha ao localizar resultado na busca publica";

        return {
            numeroProcesso: protocol,
            scraping_last_error: errorMessage,
            status: "ERRO_SCRAPING",
            interessados: [],
            documentos: [],
            movimentacoes: [],
            incidentes: []
        };
    } finally {
        await browser.close();
    }
}

export async function scrapeSIPACDocumentHTML(url) {
    console.log(`[SIPAC] Fetching document HTML from: ${url}`);
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(45000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Extrai o conteúdo relevante do despacho ou o body inteiro se não achar seletor
        const html = await page.evaluate(() => {
            const contentArea = document.querySelector('div.conteudo, table.listagem, #visualizacaoDocumento') || document.body;
            // Remove botões de impressão e scripts para uma visualização limpa
            return contentArea.innerHTML;
        });

        // Fix encoding: SIPAC often uses ISO-8859-1 in meta tags, but Puppeteer returns UTF-8
        return html.replace(/ISO-8859-1/gi, 'UTF-8');
    } finally {
        await browser.close();
    }
}

export async function scrapeSIPACDocumentContent(url) {
    console.log(`[SIPAC] Fetching document content from: ${url}`);
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

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
    } finally {
        await browser.close();
    }
}

/**
 * Downloads a document from SIPAC and returns its content as a buffer, with metadata.
 */
export async function downloadSIPACDocument(url) {
    console.log(`[SIPAC] Downloading document from: ${url}`);

    // Tática 1: Se o link parece ser de download direto (verArquivoDocumento), 
    // usamos axios para evitar o erro de 'ERR_ABORTED' do Puppeteer, MAS com headers reais para evitar 403/WAF.
    if (url.includes('verArquivoDocumento') || url.includes('downloadArquivo=true')) {
        try {
            console.log(`[SIPAC] Link de download direto detectado, tentando Axios com headers...`);
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Referer': 'https://sipac.ifes.edu.br/public/jsp/portal.jsf',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });

            let contentType = response.headers['content-type'];
            let buffer = Buffer.from(response.data);

            // Verificação de Integridade e Correção de Encoding: SIPAC usa ISO-8859-1
            if (contentType && contentType.includes('text/html')) {
                try {
                    // Converte de ISO-8859-1 (nativo SIPAC) para UTF-8 string
                    const decoder = new TextDecoder('iso-8859-1');
                    let htmlContent = decoder.decode(buffer);

                    if (htmlContent.includes('Anomaly Detected') || htmlContent.includes('think that you are a bot')) {
                        throw new Error('WAF/Bot Detection triggered (Axios)');
                    }

                    // Corrige meta tags e retorna como UTF-8
                    htmlContent = htmlContent.replace(/ISO-8859-1/gi, 'UTF-8');
                    buffer = Buffer.from(htmlContent, 'utf-8');
                    contentType = 'text/html; charset=utf-8';
                } catch (encError) {
                    console.warn(`[SIPAC] Axios block error: ${encError.message}`);
                    throw encError; // Rethrow to trigger Puppeteer fallback
                }
            }

            let fileName = 'documento_sipac';
            const contentDisp = response.headers['content-disposition'];
            if (contentDisp && contentDisp.includes('filename=')) {
                fileName = contentDisp.split('filename=')[1].replace(/["']/g, '');
            }

            if (!path.extname(fileName) && contentType) {
                const ext = mime.extension(contentType);
                if (ext) fileName += `.${ext}`;
            }

            const hash = crypto.createHash('md5').update(buffer).digest('hex');
            return { buffer, contentType, fileName, fileHash: hash, sizeBytes: buffer.length };
        } catch (e) {
            console.warn(`[SIPAC] Axios download failed/blocked (${e.message}), falling back to Puppeteer Stealth...`);
            // Pequeno delay para o WAF "esquecer" o IP se for por frequência
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
        }
    }

    // Tática 2: Fallback para Puppeteer (Download via CDP para evitar ERR_ABORTED)
    const browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    try {
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Configura pasta temporária para downloads
        const downloadPath = path.join(os.tmpdir(), crypto.randomBytes(16).toString('hex'));
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
        }

        // Configura comportamento de download via CDP
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath,
        });

        // Variáveis para captura
        let buffer = null;
        let contentType = '';
        let fileName = '';

        try {
            // Tenta navegar. Se for download, pode dar ERR_ABORTED ou timeout, mas o arquivo deve baixar.
            // Se for HTML (visualização), a página carrega.
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Se chegou aqui, não "abortou", então pode ser HTML ou o download terminou sem abortar a nav.
            if (response) {
                contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('text/html')) {
                    // É uma página HTML (Ex: Despacho ou Erro)
                    console.log(`[SIPAC] Document is HTML (Despacho detected). Fixing encoding...`);
                    fileName = 'despacho_sipac.html';
                    let htmlContent = await page.content();
                    // Fix encoding: SIPAC often uses ISO-8859-1 in meta tags, but page.content() is UTF-8
                    htmlContent = htmlContent.replace(/ISO-8859-1/gi, 'UTF-8');
                    buffer = Buffer.from(htmlContent, 'utf-8');
                    contentType = 'text/html; charset=utf-8';
                }
            }
        } catch (gotoError) {
            console.log(`[SIPAC] Navigation aborted/failed (${gotoError.message}), checking for downloaded file...`);
        }

        // Se buffer ainda é nulo, verifica a pasta de downloads com polling estendido
        if (!buffer) {
            // Aguarda até 60 segundos (120 * 500ms) para o arquivo aparecer e terminar de baixar
            let downloadedFile = null;
            let downloadStarted = false;

            for (let i = 0; i < 120; i++) {
                const files = fs.readdirSync(downloadPath);

                // Verifica se há arquivo temporário de download (.crdownload ou .tmp)
                const isDownloading = files.some(f => f.endsWith('.crdownload') || f.endsWith('.tmp'));

                if (isDownloading) {
                    if (!downloadStarted) {
                        console.log('[SIPAC] Download large file started...');
                        downloadStarted = true;
                    }
                    // Se estiver baixando, estendemos a espera resetando o contador periodicamente ou apenas não desistindo
                    // Aqui vamos apenas continuar o loop. Se o loop acabar e ainda estiver baixando, falhamos (timeout de 60s)
                    // Mas se o arquivo for muito grande, talvez precisemos de mais tempo. 
                    // Vamos adicionar +1 ao contador "i" para "pausar" o timeout enquanto baixa? Não, pode ser infinito.
                    // Vamos dar mais 60s se detectar downloadStarted?
                    // Simples: se detectar .crdownload, apenas continue.
                }

                // Procura arquivo finalizado
                const finalFile = files.find(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));

                if (finalFile) {
                    // Garante que o tamanho parou de mudar? (Chrome remove .crdownload atomicamente)
                    // Pequeno delay safe
                    await new Promise(r => setTimeout(r, 500));
                    downloadedFile = finalFile;
                    break;
                }

                await new Promise(r => setTimeout(r, 500));
            }

            if (downloadedFile) {
                console.log(`[SIPAC] Downloaded file found: ${downloadedFile}`);
                const fullPath = path.join(downloadPath, downloadedFile);
                buffer = fs.readFileSync(fullPath);
                fileName = downloadedFile;
                // Tenta adivinhar content-type pela extensão se não tiver
                if (!contentType) contentType = mime.lookup(fileName) || 'application/octet-stream';
            }
        }

        // Limpeza
        try {
            fs.rmSync(downloadPath, { recursive: true, force: true });
        } catch (e) {
            console.warn(`[SIPAC] Failed to clean temp dir: ${e.message}`);
        }

        if (!buffer || buffer.length === 0) throw new Error('Falha ao capturar conteúdo do documento (Buffer vazio ou download falhou)');

        const hash = crypto.createHash('md5').update(buffer).digest('hex');

        return {
            buffer,
            contentType,
            fileName,
            fileHash: hash,
            sizeBytes: buffer.length
        };

    } catch (error) {
        console.error(`[SIPAC DOWNLOAD ERROR] ${url}:`, error.message);
        throw error;
    } finally {
        await browser.close();
    }
}
