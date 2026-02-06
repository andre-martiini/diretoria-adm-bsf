
import axios from 'axios';
import { API_SERVER_URL } from '../constants';

export interface ProcurementHistory {
    processo: string;
    valorTotalEstimado: number;
    valorTotalHomologado: number;
    modalidadeNome: string;
    situacaoCompraNomePncp: string;
    dataPublicacaoPncp: string;
    itens: {
        numero_item: number;
        descricao: string;
        valor_unitario: number;
        quantidade: number;
        numero_dfd_encontrado: string | null;
    }[];
}

/**
 * Normaliza o número do processo para comparação (remove pontuação)
 */
const normalizeProcess = (proc: string): string => {
    return proc ? proc.replace(/\D/g, '') : '';
};

/**
 * Busca dados financeiros do processo diretamente nos arquivos de integração via servidor proxy
 */
export const getFinancialStatusByProcess = async (processNumber: string): Promise<ProcurementHistory | null> => {
    try {
        const normalizedInput = normalizeProcess(processNumber);
        if (!normalizedInput) return null;

        // Buscamos via API que lê os arquivos locais ou PNCP
        const response = await axios.get(`${API_SERVER_URL}/api/integration/procurement-data`);
        const data = response.data;

        const pncpList = data.pncp || [];
        const legacyList = data.legacy || [];
        const all = [...pncpList, ...legacyList];

        const match = all.find(p => normalizeProcess(p.processo) === normalizedInput);

        if (match) {
            return {
                processo: match.processo,
                valorTotalEstimado: match.valorTotalEstimado || 0,
                valorTotalHomologado: match.valorTotalHomologado || 0,
                modalidadeNome: match.modalidadeNome || 'Desconhecida',
                situacaoCompraNomePncp: match.situacaoCompraNomePncp || 'N/A',
                dataPublicacaoPncp: match.dataPublicacaoPncp || '',
                itens: match.itens || []
            };
        }

        return null;
    } catch (error) {
        console.error('Erro ao buscar status financeiro:', error);
        return null;
    }
};
