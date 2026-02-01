
import axios from 'axios';
import { CNPJ_IFES_BSF, API_SERVER_URL } from '../constants';

export interface PNCPPurchase {
    numeroCompra: string;
    anoCompra: number;
    processo: string;
    modalidadeNome: string;
    situacaoNome: string;
    objeto: string;
    amparoLegalNome: string;
    modoDisputaNome: string;
    dataPublicacaoPncp: string;
    dataAberturaProposta: string;
    valorTotalEstimado: number;
    linkSistemaOrigem: string;
    orgaoEntidade: {
        cnpj: string;
        razaoSocial: string;
    };
}

export interface PNCPItem {
    numeroItem: number;
    descricao: string;
    quantidade: number;
    valorUnitarioEstimado: number;
    criterioJulgamentoNome: string;
}

/**
 * Normaliza um número de processo removendo caracteres não numéricos.
 * Ex: 23068.0001/2026 -> 2306800012026
 */
const normalizeProcessNumber = (processo: string): string => {
    return processo.replace(/\D/g, '');
};

/**
 * Busca uma compra no PNCP que corresponda ao número do processo interno.
 * Usa o backend como PROXY para evitar problemas de CORS e Headers.
 */
export const findPncpPurchaseByProcess = async (year: string, internalProcess: string): Promise<PNCPPurchase | null> => {
    try {
        const normalizedInternal = normalizeProcessNumber(internalProcess);
        if (!normalizedInternal) return null;

        // A chamada agora é feita para o nosso servidor local que fará o proxy
        const url = `${API_SERVER_URL}/api/pncp/consulta/compras?ano=${year}&pagina=1&tamanhoPagina=500`;

        console.log(`[PNCP Service - Proxy] Fetching purchases from: ${url}`);

        // Header User-Agent removido pois o browser o coloca automaticamente e o servidor backend colocará o dele.
        const response = await axios.get(url);

        const purchases: PNCPPurchase[] = response.data.data || [];

        // 2. Filtragem Local (O "Match")
        const match = purchases.find(p => {
            const normalizedPncp = normalizeProcessNumber(p.processo || '');
            return normalizedPncp === normalizedInternal;
        });

        return match || null;
    } catch (error) {
        console.error('Erro ao consultar PNCP via Proxy:', error);
        return null; // Falha silenciosa
    }
};

/**
 * Busca os itens de uma compra específica no PNCP.
 * Usa o backend como PROXY.
 */
export const fetchPncpPurchaseItems = async (year: number, purchaseNumber: string): Promise<PNCPItem[]> => {
    try {
        const url = `${API_SERVER_URL}/api/pncp/consulta/itens?ano=${year}&sequencial=${purchaseNumber}&pagina=1&tamanhoPagina=100`;

        console.log(`[PNCP Service - Proxy] Fetching items from: ${url}`);
        const response = await axios.get(url);

        return response.data.data || [];
    } catch (error) {
        console.error('Erro ao buscar itens no PNCP via Proxy:', error);
        return [];
    }
};
