import * as pdfjsLib from 'pdfjs-dist';
import { SIPACProcess, ProcessFinancials, FinancialEvent } from '../../types';
import { classifyDocument } from './documentClassifier';
import { extractFinancialValue, extractDate } from './financialExtractor';

// @ts-ignore - Vite specific import for worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Default fetcher using the proxy
const defaultPdfFetcher = async (url: string): Promise<ArrayBuffer> => {
    // Use the proxy to avoid CORS
    // Encoded URL to ensure special characters don't break the query
    const proxyUrl = `/api/proxy/pdf?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch PDF via proxy: ${response.statusText}`);
    }
    return await response.arrayBuffer();
};

export const analyzeProcessFinancials = async (
    process: SIPACProcess,
    fetchPdfFn: (url: string) => Promise<ArrayBuffer> = defaultPdfFetcher
): Promise<ProcessFinancials> => {
    const events: FinancialEvent[] = [];
    const relevantDocs = process.documentos.filter(d => classifyDocument(d.tipo, d.natureza) !== null);

    console.log(`SmartScanner: Found ${relevantDocs.length} relevant docs out of ${process.documentos.length}`);

    for (const doc of relevantDocs) {
        const type = classifyDocument(doc.tipo, doc.natureza)!;

        try {
            console.log(`Analyzing: ${doc.tipo} (${doc.ordem})`);
            const arrayBuffer = await fetchPdfFn(doc.url);

            // Load PDF
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            // Extract text from first 3 pages
            let fullText = '';
            const maxPages = Math.min(pdf.numPages, 3);
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + ' ';
            }

            // Extract Data
            const value = extractFinancialValue(fullText);
            // Prefer extracted date, fallback to metadata date
            const date = extractDate(fullText) || (doc.data ? doc.data.split(' ')[0].split('/').reverse().join('-') : new Date().toISOString().split('T')[0]);

            if (value) {
                events.push({
                    id: doc.ordem,
                    date,
                    type,
                    value,
                    documentTitle: doc.tipo,
                    documentUrl: doc.url,
                    originalText: fullText.substring(0, 100) + '...' // Store snippet for debugging
                });
            }

        } catch (error) {
            console.error(`Failed to analyze doc ${doc.ordem}:`, error);
        }
    }

    // Sort by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate totals
    // Empenho - Anulacao
    const empenhado = events.filter(e => e.type === 'EMPENHO').reduce((acc, e) => acc + e.value, 0);
    const anulado = events.filter(e => e.type === 'ANULACAO').reduce((acc, e) => acc + e.value, 0);
    const totalEmpenhado = Math.max(0, empenhado - anulado);

    const totalLiquidado = events.filter(e => e.type === 'LIQUIDACAO').reduce((acc, e) => acc + e.value, 0);
    const totalPago = events.filter(e => e.type === 'PAGAMENTO').reduce((acc, e) => acc + e.value, 0);

    return {
        totalEmpenhado,
        totalLiquidado,
        totalPago,
        events,
        lastAnalysisDate: new Date().toISOString()
    };
};
