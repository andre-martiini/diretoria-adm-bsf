export const extractFinancialValue = (text: string): number | null => {
    // Normalize text: single spaces, remove noise
    const cleanText = text.replace(/\s+/g, ' ');

    // Patterns for financial value in Brazilian format (1.234,56)
    // We look for values specifically associated with "Empenho", "Total", "Contratação"
    const currencyRegex = /(?:VALOR|R\$|TOTAL|EMPENHADO|EMPENHAR|IMPORTÂNCIA)\s*:?\s*R?\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi;

    let match;
    let maxValue = 0;

    // Some documents (Notes of Empenho) have a very specific "VALOR TOTAL: R$ X.XXX,XX" structure
    const totalMatch = cleanText.match(/VALOR TOTAL\s*:?\s*R?\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (totalMatch) {
        const valStr = totalMatch[1].replace(/\./g, '').replace(',', '.');
        return parseFloat(valStr);
    }

    while ((match = currencyRegex.exec(cleanText)) !== null) {
        const valStr = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(valStr);

        // Heuristics:
        // 1. Usually the highest value is the total empenho
        // 2. We skip very low values (prob noise/dates/quantities)
        if (!isNaN(val) && val > maxValue) {
            maxValue = val;
        }
    }

    // Secondary fallback: pure currency pattern if keywords didn't work
    if (maxValue === 0) {
        const pureCurrencyRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})/g;
        while ((match = pureCurrencyRegex.exec(cleanText)) !== null) {
            const valStr = match[0].replace(/\./g, '').replace(',', '.');
            const val = parseFloat(valStr);
            if (!isNaN(val) && val > maxValue) maxValue = val;
        }
    }

    return maxValue > 0 ? maxValue : null;
};

export const extractDate = (text: string): string | null => {
    // Look for standard date format DD/MM/YYYY
    const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/;
    const match = text.match(dateRegex);

    if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);

        // Basic validation
        if (month > 0 && month <= 12 && day > 0 && day <= 31 && year > 2000 && year < 2100) {
            return `${match[3]}-${match[2]}-${match[1]}`;
        }
    }
    return null;
};
