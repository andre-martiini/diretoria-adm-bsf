import { ContractItem, Category } from '../types';
import { LEGAL_LIMITS } from '../constants/legalLimits';

export interface FractionationResult {
    used: number;
    available: number;
    exceeded: boolean;
    limit: number;
}

export const FractionationControlService = {
    /**
     * Calcula os limites de fracionamento de despesa (Art. 75, I e II) e Suprimento de Fundos.
     *
     * @param data Histórico de compras/itens do ano vigente.
     * @param pdmOrCategory Código PDM/CATSER ou categoria da nova compra.
     * @param isObras Boolean indicando se a nova compra é de Obras/Serviços de Engenharia.
     * @param newPurchaseValue Valor da nova compra.
     * @param modalidade Modalidade pretendida (ex: 'Dispensa de Licitação', 'Suprimento de Fundos').
     */
    calculateFractionation(
        data: ContractItem[],
        pdmOrCategory: string,
        isObras: boolean,
        newPurchaseValue: number,
        modalidade?: string
    ): FractionationResult {
        // Se a modalidade não for as restritas, não consome limite (ex: Pregão)
        const isRestrictedModality = modalidade === 'Dispensa de Licitação' || modalidade === 'Suprimento de Fundos';

        const limit = isObras ? LEGAL_LIMITS.DISPENSA_OBRAS_ENG_BAIXO_VALOR : LEGAL_LIMITS.DISPENSA_COMPRAS_SERVICOS_BAIXO_VALOR;

        if (!isRestrictedModality) {
            return { used: 0, available: limit, exceeded: false, limit };
        }

        const normalizedInputCategory = (pdmOrCategory || '').trim().toLowerCase();

        // Filtra os itens do histórico e soma os valores consumidos
        const used = data.reduce((sum, item) => {
            const itemModalidade = item.modalidade || item.area || item.dadosExecucao?.modalidadeNome || '';
            const isItemRestricted = itemModalidade.includes('Dispensa de Licitação') ||
                                     itemModalidade.includes('Dispensa de Licitacao') ||
                                     itemModalidade.includes('Suprimento de Fundos');

            if (!isItemRestricted) return sum;

            // Verifica compatibilidade de Ramo de Atividade (PDM/CATSER)
            // Caso não tenha pdm, compara por categoria ou titulo como fallback simplificado
            const itemPdm = (item.codigoPdm || item.codigoItem || item.categoria || '').trim().toLowerCase();
            const itemMatchesBranch = itemPdm === normalizedInputCategory ||
                                      (item.categoria && item.categoria.toLowerCase() === normalizedInputCategory);

            if (itemMatchesBranch) {
                // Prioriza valor executado/homologado, depois estimado
                const consumedValue = Number(item.valorEmpenhado) || Number(item.valorExecutado) || Number(item.dadosExecucao?.valorTotalHomologado) || Number(item.valor) || 0;
                return sum + consumedValue;
            }

            return sum;
        }, 0);

        return {
            used,
            available: limit - used,
            exceeded: (used + newPurchaseValue) > limit,
            limit
        };
    }
};
