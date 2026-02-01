import { FinancialEventType } from '../../types';

export const classifyDocument = (title: string, type: string): FinancialEventType | null => {
    const fullText = (title + ' ' + (type || '')).toUpperCase();

    if (fullText.includes('NOTA DE EMPENHO') ||
        fullText.includes('DESPACHO') ||
        fullText.includes('SOLICITAÇÃO DE EMPENHO')) return 'EMPENHO';

    // Liquidation: Services rendered or Goods received
    if (fullText.includes('TERMO DE RECEBIMENTO') ||
        fullText.includes('ATESTADO DE EXECUÇÃO') ||
        fullText.includes('NOTA FISCAL') ||
        fullText.includes('LIQUIDAÇÃO')) {
        return 'LIQUIDACAO';
    }

    if (fullText.includes('ORDEM BANCÁRIA') ||
        fullText.includes('COMPROVANTE DE PAGAMENTO') ||
        fullText.includes('ORDEM DE PAGAMENTO')) {
        return 'PAGAMENTO';
    }

    if (fullText.includes('ANULAÇÃO DE EMPENHO') || fullText.includes('ANULAÇÃO')) return 'ANULACAO';

    return null;
};
