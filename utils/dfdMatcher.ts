import { ContractItem } from '../types';

export interface DFDData {
    quantidade: number | null;
    valor: number | null;
    grupo: string | null;
    categoria: string | null;
    descricao?: string | null;
    rawTextPreview?: string;
}

/**
 * Normalizes text for comparison (removes accents, lowercase).
 */
const normalize = (str: string) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

const tokenize = (str: string): string[] => {
    const stopWords = new Set([
        'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'sem',
        'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os', 'um', 'uma'
    ]);

    return normalize(str)
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 4 && !stopWords.has(t));
};

/**
 * Calculates a match score between DFD data and a PCA Item.
 */
const calculateMatchScore = (
    dfd: DFDData,
    item: ContractItem
): { score: number; reasons: string[]; semanticScore: number } => {
    let score = 0;
    let semanticScore = 0;
    const reasons: string[] = [];

    // 1. Value Match
    if (dfd.valor && item.valor) {
        const diff = Math.abs(dfd.valor - item.valor);
        const percentDiff = (diff / dfd.valor) * 100;

        if (percentDiff <= 1) {
            score += 40;
            reasons.push('Valor exato (<=1%)');
        } else if (percentDiff <= 5) {
            score += 20;
            reasons.push('Valor aproximado (<=5%)');
        } else if (percentDiff <= 10) {
            score += 5;
        }
    }

    // 2. Quantity Match
    if (dfd.quantidade !== null && item.quantidade) {
        if (Math.abs(dfd.quantidade - item.quantidade) < 0.001) {
            score += 30;
            reasons.push('Quantidade exata');
        }
    }

    // 3. Category Match
    if (dfd.categoria) {
        const dfdCat = normalize(dfd.categoria);
        const itemCat = normalize(item.categoria);

        if (dfdCat.includes(itemCat) || itemCat.includes(dfdCat)) {
            score += 10;
            reasons.push('Categoria compatível');
        }
    }

    // 4. Group/Classification Match
    if (dfd.grupo) {
        const dfdGroup = normalize(dfd.grupo);
        const itemGroup = normalize(item.grupoContratacao || '');
        const itemTitle = normalize(item.titulo || '');
        const itemClassificacao = normalize(item.classificacaoSuperiorNome || '');

        if (itemGroup && (itemGroup.includes(dfdGroup) || dfdGroup.includes(itemGroup))) {
            score += 20;
            semanticScore += 20;
            reasons.push('Grupo de contratação coincide');
        } else if (itemClassificacao && (itemClassificacao.includes(dfdGroup) || dfdGroup.includes(itemClassificacao))) {
            score += 20;
            semanticScore += 20;
            reasons.push('Classificação superior coincide');
        } else if (itemTitle.includes(dfdGroup)) {
            score += 15;
            semanticScore += 15;
            reasons.push('Descrição contém o grupo');
        }
    }

    // 5. Description Match
    if (dfd.descricao) {
        const dfdDesc = normalize(dfd.descricao);
        const itemDesc = normalize([
            item.titulo || '',
            item.descricaoDetalhada || '',
            item.classificacaoSuperiorNome || '',
            item.grupoContratacao || ''
        ].join(' '));

        if (itemDesc.includes(dfdDesc) || dfdDesc.includes(itemDesc)) {
            score += 35;
            semanticScore += 35;
            reasons.push('Descrição altamente compatível');
        } else {
            const dfdTokens = tokenize(dfdDesc);
            const itemTokens = new Set(tokenize(itemDesc));
            if (dfdTokens.length > 0) {
                const overlap = dfdTokens.filter(t => itemTokens.has(t)).length;
                const ratio = overlap / dfdTokens.length;

                if (ratio >= 0.6) {
                    score += 25;
                    semanticScore += 25;
                    reasons.push('Descrição compatível por termos-chave');
                } else if (ratio >= 0.4) {
                    score += 15;
                    semanticScore += 15;
                    reasons.push('Descrição parcialmente compatível');
                }
            }
        }
    }

    return { score, reasons, semanticScore };
};

/**
 * Filters PCA items to find matches for the extracted DFD data.
 */
export const findMatchingPCAItems = (dfdData: DFDData, pcaItems: ContractItem[]): ContractItem[] => {
    if (!dfdData) return [];

    const hasSemanticReference = Boolean(
        (dfdData.grupo && tokenize(dfdData.grupo).length > 0) ||
        (dfdData.descricao && tokenize(dfdData.descricao).length >= 3)
    );

    const threshold = hasSemanticReference ? 50 : 40;
    const minSemanticScore = hasSemanticReference ? 15 : 0;
    const hasDFDValue = typeof dfdData.valor === 'number' && Number.isFinite(dfdData.valor);

    const scoredItems = pcaItems.map(item => {
        const { score, reasons, semanticScore } = calculateMatchScore(dfdData, item);
        return { item, score, reasons, semanticScore };
    });

    return scoredItems
        .filter(match => {
            if (hasDFDValue) {
                const valueDiff = Math.abs((match.item.valor || 0) - (dfdData.valor || 0));
                // Strict value gating: only equal totals (cent-level tolerance).
                if (valueDiff > 0.01) return false;
            }
            return match.score >= threshold && match.semanticScore >= minSemanticScore;
        })
        .sort((a, b) => b.score - a.score)
        .map(match => match.item);
};
