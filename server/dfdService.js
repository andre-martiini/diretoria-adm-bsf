import pdf from 'pdf-parse';
import { scrapeSIPACProcess, downloadSIPACDocument } from './sipacService.js';

/**
 * Extracts structured data from DFD text content using Regex.
 * Fields: Quantidade, Valor, Grupo, Categoria.
 */
function extractDFDData(text) {
    const cleanText = text.replace(/\s+/g, ' ').trim();

    // 1. Quantidade
    // Patterns: "Quantidade: 123", "Qtd: 123", or table column
    let quantidade = null;
    const qtdMatch = cleanText.match(/(?:Quantidade|Qtd|Quant)\s*[:.]?\s*(\d+)/i);
    if (qtdMatch) {
        quantidade = parseInt(qtdMatch[1], 10);
    }

    // 2. Valor
    // Patterns: "Valor Total Estimado: R$ 1.234,56", "Valor: 1000"
    let valor = null;
    const valorMatch = cleanText.match(/(?:Valor Total|Valor Estimado|Valor)\s*(?:Estimado)?\s*[:.]?\s*(?:R\$)?\s*([\d.,]+)/i);
    if (valorMatch) {
        // Normalize: remove dots, replace comma with dot
        const valStr = valorMatch[1].replace(/\./g, '').replace(',', '.');
        valor = parseFloat(valStr);
    }

    // 3. Grupo de Contratação
    // Patterns: "Grupo de Contratação: Material de Consumo", "Natureza: Obras"
    let grupo = null;
    const grupoMatch = cleanText.match(/(?:Grupo de Contratação|Natureza de Despesa|Natureza)\s*[:.]?\s*([^\n\r]+?)(?:\s-\s|\s\(|$)/i);
    if (grupoMatch) {
        grupo = grupoMatch[1].trim();
    }

    // 4. Categoria (Bens, Serviços, TIC)
    // Infer from text if not explicit
    let categoria = 'Outros';
    const lowerText = cleanText.toLowerCase();
    if (lowerText.includes('serviço') || lowerText.includes('mão de obra')) {
        categoria = 'Serviços';
    } else if (lowerText.includes('tic') || lowerText.includes('tecnologia') || lowerText.includes('software') || lowerText.includes('hardware')) {
        categoria = 'TIC';
    } else if (lowerText.includes('bem') || lowerText.includes('material') || lowerText.includes('aquisição')) {
        categoria = 'Bens';
    } else if (lowerText.includes('obra') || lowerText.includes('engenharia')) {
        categoria = 'Obras';
    }

    return {
        quantidade,
        valor,
        grupo,
        categoria,
        rawTextPreview: cleanText.substring(0, 500) // Debug
    };
}

/**
 * Analyzes a SIPAC Process to find and extract DFD data.
 * @param {string} processId - The SIPAC process number (formatted or not).
 */
export async function analyzeProcessDFD(processId) {
    console.log(`[DFD ANALYSIS] Starting analysis for process: ${processId}`);

    // 1. Scrape Process to find documents
    const processData = await scrapeSIPACProcess(processId);

    if (!processData || !processData.documentos) {
        throw new Error('Processo não encontrado ou sem documentos acessíveis.');
    }

    // 2. Find DFD Document
    // Look for "Formalização da Demanda", "DFD", or "Estudo Técnico" as fallback?
    // User specifically asked for DFD.
    const dfdDoc = processData.documentos.find(d =>
        d.tipo.toLowerCase().includes('formalização da demanda') ||
        d.tipo.toLowerCase().includes('dfd')
    );

    if (!dfdDoc) {
        console.warn(`[DFD ANALYSIS] DFD Document not found in list: ${processData.documentos.map(d => d.tipo).join(', ')}`);
        return {
            success: false,
            error: 'Documento de Formalização da Demanda (DFD) não encontrado no processo.',
            processData
        };
    }

    if (!dfdDoc.url) {
        return {
            success: false,
            error: 'URL do DFD não disponível (Acesso restrito ou documento sigiloso).',
            processData
        };
    }

    console.log(`[DFD ANALYSIS] Found DFD: ${dfdDoc.tipo} (${dfdDoc.url})`);

    // 3. Download PDF
    try {
        const { buffer } = await downloadSIPACDocument(dfdDoc.url);

        // 4. Extract Text
        const pdfData = await pdf(buffer);
        const text = pdfData.text;

        // 5. Extract Structured Data
        const extractedData = extractDFDData(text);

        return {
            success: true,
            processData,
            dfdDoc,
            extractedData
        };

    } catch (err) {
        console.error(`[DFD ANALYSIS] Error processing PDF: ${err.message}`);
        return {
            success: false,
            error: `Erro ao processar o PDF do DFD: ${err.message}`,
            processData
        };
    }
}
