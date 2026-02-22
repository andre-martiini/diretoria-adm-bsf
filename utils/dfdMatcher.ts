import { ContractItem, Category } from '../types';

export interface DFDData {
    quantidade: number | null;
    valor: number | null;
    grupo: string | null;
    categoria: string | null;
    rawTextPreview?: string;
}

/**
 * Normalizes text for comparison (removes accents, lowercase).
 */
const normalize = (str: string) => {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

/**
 * Calculates a match score between DFD data and a PCA Item.
 * Returns a score between 0 and 100.
 */
const calculateMatchScore = (dfd: DFDData, item: ContractItem): { score: number, reasons: string[] } => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Value Match (Most critical)
    if (dfd.valor && item.valor) {
        const diff = Math.abs(dfd.valor - item.valor);
        const percentDiff = (diff / dfd.valor) * 100;

        if (percentDiff <= 1) { // 1% tolerance
            score += 40;
            reasons.push('Valor exato (<=1%)');
        } else if (percentDiff <= 5) { // 5% tolerance
            score += 20;
            reasons.push('Valor aproximado (<=5%)');
        } else if (percentDiff <= 10) {
            score += 5; // Weak match
        } else {
            // Penalty for large value mismatch if everything else matches?
            // No, just don't add points.
        }
    }

    // 2. Quantity Match
    if (dfd.quantidade !== null && item.quantidade) {
        if (dfd.quantidade === item.quantidade) {
            score += 30;
            reasons.push('Quantidade exata');
        } else {
             // Maybe DFD is for a partial amount?
             // For now, strict match or nothing.
        }
    }

    // 3. Category Match
    if (dfd.categoria) {
        // Map DFD category string to Enum or similar string
        const dfdCat = normalize(dfd.categoria);
        const itemCat = normalize(item.categoria);

        // Simple mapping based on known DFD output
        // DFD: 'Serviços', 'Bens', 'TIC', 'Obras'
        // Item: Category Enum (Bens, Serviços, TIC, Obras)

        if (dfdCat.includes(itemCat) || itemCat.includes(dfdCat)) {
            score += 10;
            reasons.push('Categoria compatível');
        }
    }

    // 4. Group/Description Match
    if (dfd.grupo) {
        const dfdGroup = normalize(dfd.grupo);
        const itemGroup = normalize(item.grupoContratacao || '');
        const itemTitle = normalize(item.titulo || '');

        if (itemGroup && (itemGroup.includes(dfdGroup) || dfdGroup.includes(itemGroup))) {
            score += 20;
            reasons.push('Grupo de contratação coincide');
        } else if (itemTitle.includes(dfdGroup)) {
             score += 15;
             reasons.push('Descrição contém o grupo');
        }
    }

    return { score, reasons };
};

/**
 * Filters PCA items to find matches for the extracted DFD data.
 */
export const findMatchingPCAItems = (dfdData: DFDData, pcaItems: ContractItem[]): ContractItem[] => {
    if (!dfdData) return [];

    const scoredItems = pcaItems.map(item => {
        const { score, reasons } = calculateMatchScore(dfdData, item);
        return { item, score, reasons };
    });

    // Filter by threshold
    // If we have value match (40) and quantity (30), that's 70.
    // If we have value (40) and category (10), that's 50.
    // If we have group (20) and category (10), that's 30 (too low).
    // Let's set threshold to 40. This basically requires at least a Value match OR (Quantity + Category).

    const threshold = 40;

    // Sort by score descending
    return scoredItems
        .filter(match => match.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .map(match => match.item);
};
