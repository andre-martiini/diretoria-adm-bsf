import { PDFParse } from 'pdf-parse';
import { scrapeSIPACProcess, downloadSIPACDocument } from './sipacService.js';

/**
 * Extracts structured data from DFD text content.
 * Fields: Quantidade, Valor, Grupo, Categoria, Descricao.
 */
function extractDFDData(text) {
    const cleanText = text.replace(/\s+/g, ' ').trim();

    const normalizeText = (str) =>
        String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

    const parsePtBrNumber = (value) => {
        if (!value) return null;
        const normalized = String(value).replace(/\./g, '').replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    };

    // 1. Quantidade (layout textual)
    let quantidade = null;
    const qtdMatch = cleanText.match(/(?:Quantidade|Qtd|Quant)\s*[:.]?\s*(\d+(?:,\d+)?)/i);
    if (qtdMatch) {
        quantidade = parsePtBrNumber(qtdMatch[1]);
    }

    // 2. Valor (layout textual)
    let valor = null;
    const valorMatch = cleanText.match(/(?:Valor Total|Valor Estimado|Valor)\s*(?:Estimado)?\s*[:.]?\s*(?:R\$)?\s*([\d.,]+)/i);
    if (valorMatch) {
        valor = parsePtBrNumber(valorMatch[1]);
    }

    // 3. Grupo (layout textual)
    let grupo = null;
    const grupoMatch = cleanText.match(/(?:Grupo de Contrata[çc][aã]o|Natureza de Despesa|Natureza)\s*[:.]?\s*([^\n\r]+?)(?:\s-\s|\s\(|$)/i);
    if (grupoMatch) {
        grupo = grupoMatch[1].trim();
    }

    // 3.1 Descricao do item no DFD
    let descricao = null;

    // Fallback para layout em tabela de servicos: "Qtd Val. unit. Val. total"
    // Exemplo: "... Instalacao ... 1,0020.000,00 20.000,00 ..."
    const tableNumericTriplet = cleanText.match(/(\d+(?:,\d{1,2})?)\s*([\d.]+,\d{2})\s+([\d.]+,\d{2})/u);
    if (tableNumericTriplet && tableNumericTriplet.index !== undefined) {
        if (quantidade === null) quantidade = parsePtBrNumber(tableNumericTriplet[1]);
        if (valor === null) valor = parsePtBrNumber(tableNumericTriplet[2]);

        const rowPrefix = cleanText.slice(Math.max(0, tableNumericTriplet.index - 320), tableNumericTriplet.index);
        let candidate = rowPrefix
            .replace(/^.*?3\.2\s*Servi[cç]os\s*/iu, '')
            .replace(/^.*?N[º°o]\s*do\s*item\s*Grupo\s*Descri[cç][aã]o\s*Qtd\s*Val\.\s*unit\.\s*\(R\$\)\s*Val\.\s*total\s*\(R\$\)\s*/iu, '')
            .replace(/^.*?Val\.\s*total\s*\(R\$\)\s*/iu, '')
            .trim()
            .replace(/^\d+\s+/, '')
            .trim();

        if (candidate) {
            const groupThenDescription = candidate.match(/^(.{8,140}?\))\s+(.+)$/u);
            if (groupThenDescription) {
                if (!grupo) grupo = groupThenDescription[1].trim();
                descricao = groupThenDescription[2].trim();
            }

            const descStartRegex = /\b(instala[cç][aã]o|aquisi[cç][aã]o|contrata[cç][aã]o|fornecimento|manuten[cç][aã]o|loca[cç][aã]o|execu[cç][aã]o|presta[cç][aã]o|implanta[cç][aã]o)\b/i;
            const descStart = candidate.search(descStartRegex);

            if (!descricao && descStart > 0) {
                const grupoCandidate = candidate.slice(0, descStart).trim();
                const descricaoCandidate = candidate.slice(descStart).trim();
                if (!grupo && grupoCandidate.length >= 4) grupo = grupoCandidate;
                descricao = descricaoCandidate;
            } else if (!descricao) {
                descricao = candidate;
            }
        }
    }

    // 4. Categoria (Bens, Servicos, TIC)
    let categoria = 'Outros';
    const lowerText = normalizeText(cleanText);
    if (lowerText.includes('servico') || lowerText.includes('mao de obra')) {
        categoria = 'Serviços';
    } else if (lowerText.includes('tic') || lowerText.includes('tecnologia') || lowerText.includes('software') || lowerText.includes('hardware')) {
        categoria = 'TIC';
    } else if (lowerText.includes('bem') || lowerText.includes('material') || lowerText.includes('aquisicao')) {
        categoria = 'Bens';
    } else if (lowerText.includes('obra') || lowerText.includes('engenharia')) {
        categoria = 'Obras';
    }

    return {
        quantidade,
        valor,
        grupo,
        categoria,
        descricao,
        rawTextPreview: cleanText.substring(0, 500)
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
        const parser = new PDFParse({ data: buffer });
        let text = '';
        try {
            const pdfData = await parser.getText();
            text = pdfData.text;
        } finally {
            await parser.destroy();
        }

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
