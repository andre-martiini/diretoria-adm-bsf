import * as pdfjsLib from 'pdfjs-dist';
import { SIPACProcess, ProcessFinancials, FinancialEvent } from '../../types';
import { classifyDocument } from './documentClassifier';
import { extractFinancialValue, extractDate } from './financialExtractor';
import { API_SERVER_URL } from '../../constants';

// Configure worker using local public file for maximum stability
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Default fetcher using the proxy that can handle PDFs and HTML
const fetchDocumentText = async (url: string): Promise<string> => {
    console.log(`[SmartScanner] Fetching text for URL: ${url}`);
    // Check if it's likely a PDF or HTML based on URL or title
    const isDespacho = url.includes('documento_visualizacao.jsf') || url.includes('idDoc=');

    if (isDespacho) {
        // Use full API URL with proxy to avoid hitting Vite dev server
        const textProxyUrl = `${API_SERVER_URL}/api/sipac/documento/conteudo?url=${encodeURIComponent(url)}`;
        const response = await fetch(textProxyUrl);
        if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    const data = await response.json();
                    return data.text || '';
                } catch (jsonErr) {
                    console.warn("Failed to parse JSON response from document content API, falling back to text parsing.");
                    const text = await response.text();
                    return text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
                }
            } else {
                const text = await response.text();
                // If we got HTML (like an error page), try to get text from it as a last resort
                return text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
            }
        } else {
            console.error(`Backend returned ${response.status} for doc content. URL: ${textProxyUrl}`);
        }
    }

    // Try PDF route via proxy
    const proxyUrl = `/api/proxy/pdf?url=${encodeURIComponent(url)}`;
    console.log(`[SmartScanner] Attempting PDF proxy fetch: ${proxyUrl}`);
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch document via proxy: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    console.log(`[SmartScanner] Response Content-Type: ${contentType}`);

    if (contentType?.includes('text/html')) {
        const text = await response.text();
        console.warn(`[SmartScanner] Received HTML content (length ${text.length}). First 100 chars: ${text.substring(0, 100)}`);
        // Simple HTML to text
        return text.replace(/<[^>]*>?/gm, ' ');
    }

    const arrayBuffer = await response.arrayBuffer();

    // Load PDF
    try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = '';
        const maxPages = Math.min(pdf.numPages, 5); // Scanners can be deep
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + ' ';
        }
        console.log(`[SmartScanner] PDF extracted ${fullText.length} chars from ${pdf.numPages} pages.`);
        return fullText;
    } catch (e) {
        console.warn("[SmartScanner] Failed to parse as PDF, attempting as text:", e);
        const decoder = new TextDecoder();
        return decoder.decode(arrayBuffer).replace(/<[^>]*>?/gm, ' ');
    }
};

// Regex based extractor for Nota de Empenho
const extractNEData = (text: string, title: string): { value: number; date: string; numNE: string } | null => {
    // Normalização agressiva para evitar erros de encoding/espaçamento do PDF
    const cleanText = text.replace(/\s+/g, ' ');
    const upperText = cleanText.toUpperCase();

    // 1. Assinatura do Documento
    if (!upperText.includes('NOTA DE EMPENHO') && !upperText.includes('SIAFI')) {
        return null;
    }

    // 2. Extração do Valor (Ajustado para ser mais flexível)
    // Busca "Valor" ou "Total" seguido de qualquer caractere até o padrão monetário
    const valueRegex = /(?:VALOR|TOTAL).*?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
    let maxValue = 0;
    let match;
    while ((match = valueRegex.exec(cleanText)) !== null) {
        const valStr = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(valStr);
        if (!isNaN(val) && val > maxValue && val < 1000000000) {
            maxValue = val;
        }
    }

    // 3. Extração da Data (Ajustado para capturar "Data de Emissão Tipo 12/12/2025")
    let date = new Date().toISOString().split('T')[0];
    const dateMatch = cleanText.match(/Data de Emissão.*?(\d{2}\/\d{2}\/\d{4})/i);
    if (dateMatch) {
        date = dateMatch[1].split('/').reverse().join('-');
    }

    // 4. Extração do Número da NE
    let numNE = "";
    const neMatch = cleanText.match(/(\d{4})\s*NE\s*(\d+)/i) || cleanText.match(/NOTA DE EMPENHO Nº\s*(\d+)\/(\d{4})/i);

    if (neMatch) {
        // Se for o padrão 2025 NE 111, neMatch[1] é o ano e neMatch[2] é o número
        // Se for o padrão 212/2025, neMatch[1] é o número e neMatch[2] é o ano
        const isSiafi = neMatch[0].includes('NE');
        const ano = isSiafi ? neMatch[1] : neMatch[2];
        const num = isSiafi ? neMatch[2] : neMatch[1];
        numNE = `${ano}NE${num.padStart(6, '0')}`;
    }

    if (maxValue > 0) {
        return { value: maxValue, date, numNE: numNE || title };
    }
    return null;
};

export const analyzeProcessFinancials = async (
    process: SIPACProcess,
    fetchTextFn: (url: string) => Promise<string> = fetchDocumentText
): Promise<ProcessFinancials> => {
    const events: FinancialEvent[] = [];

    // Foco estrito: Apenas Nota de Empenho
    const neDocs = process.documentos.filter(d =>
        d.tipo.toUpperCase().includes('NOTA DE EMPENHO') ||
        d.tipo.toUpperCase() === 'NE'
    );

    console.log(`SmartScanner: Localizados ${neDocs.length} documentos do tipo Nota de Empenho para análise automática.`);

    if (neDocs.length > 0) {
        for (const doc of neDocs) {
            try {
                const text = await fetchTextFn(doc.url);
                if (!text || text.length < 50) continue;

                // Extração via Regex (Script)
                const data = extractNEData(text, doc.tipo);
                console.log(`[SmartScanner] Extraction Result for #${doc.ordem}:`, data);

                if (data) {
                    events.push({
                        id: doc.ordem,
                        date: data.date,
                        type: 'EMPENHO',
                        value: data.value,
                        documentTitle: doc.tipo,
                        documentUrl: doc.url,
                        originalText: `Nota de Empenho identificada: ${data.numNE}`
                    });
                } else {
                    console.warn(`SmartScanner: Nenhum valor monetário encontrado na NE #${doc.ordem}`);
                }
            } catch (e) {
                console.warn(`Erro ao processar NE #${doc.ordem}:`, e);
            }
        }
    }

    // Ordenar por data
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Soma simples dos empenhos
    const totalEmpenhado = events.reduce((acc, e) => acc + e.value, 0);

    return {
        totalEmpenhado,
        totalLiquidado: 0,
        totalPago: 0,
        events,
        lastAnalysisDate: new Date().toISOString()
    };
};
