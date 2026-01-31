import { FinancialEventType } from '../../types';

export const classifyDocument = (title: string, type: string): FinancialEventType | null => {
    const fullText = (title + ' ' + (type || '')).toUpperCase();

    if (fullText.includes('NOTA DE EMPENHO')) return 'EMPENHO';

    // Liquidation: Services rendered or Goods received
    if (fullText.includes('TERMO DE RECEBIMENTO') ||
        fullText.includes('ATESTADO DE EXECUÇÃO') ||
        fullText.includes('NOTA FISCAL')) {
        return 'LIQUIDACAO';
    }

    if (fullText.includes('ORDEM BANCÁRIA') ||
        fullText.includes('COMPROVANTE DE PAGAMENTO')) {
        return 'PAGAMENTO';
    }

    if (fullText.includes('ANULAÇÃO DE EMPENHO')) return 'ANULACAO';

    return null;
};
