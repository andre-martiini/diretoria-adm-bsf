export const extractFinancialValue = (text: string): number | null => {
    // Normalize text to single spaces
    const cleanText = text.replace(/\s+/g, ' ');

    // Pattern to match currency in Brazilian format: 1.234,56
    // It looks for numbers followed by optional dot groups, ending in comma and two digits.
    // We add a check to avoid picking up dates or other numbers.
    // Often currency is preceded by R$ or "Valor".

    // Regex: (R\$\s*)? matches optional R$
    // (\d{1,3}(\.\d{3})*,\d{2}) matches the number format
    const currencyRegex = /(?:R\$\s*|Valor\s*:?\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;

    let match;
    let maxValue = 0;

    while ((match = currencyRegex.exec(cleanText)) !== null) {
        // Group 1 is the number part
        const valStr = match[1].replace(/\./g, '').replace(',', '.');
        const val = parseFloat(valStr);

        // Simple heuristic: In these documents, the "Total" is usually the largest number found.
        // We filter out very small numbers that might be noise (dates, quantities) if they happen to match format,
        // though the format X,XX enforces decimal.
        if (!isNaN(val) && val > maxValue) {
            maxValue = val;
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
