
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
    itens?: PNCPItem[]; // Opcional: incluído nos dados sincronizados
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

/**
 * Busca dados de contratações de um ano específico dos arquivos sincronizados.
 * Muito mais rápido que fazer chamadas à API.
 */
export const getProcurementDataByYear = async (year: string) => {
    try {
        const url = `${API_SERVER_URL}/api/procurement/year/${year}`;
        console.log(`[PNCP Service - Local] Fetching cached procurement data for ${year}`);

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error(`Erro ao buscar dados sincronizados de ${year}:`, error);
        return null;
    }
};

/**
 * Busca todos os dados de contratações (2022-2026) dos arquivos sincronizados.
 */
export const getAllProcurementData = async () => {
    try {
        const url = `${API_SERVER_URL}/api/procurement/all`;
        console.log(`[PNCP Service - Local] Fetching all cached procurement data`);

        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Erro ao buscar todos os dados sincronizados:', error);
        return null;
    }
};

/**
 * Busca uma compra pelo número do processo usando os dados sincronizados localmente.
 * MUITO mais rápido que a busca via API.
 */
export const findPncpPurchaseByProcessCached = async (internalProcess: string): Promise<PNCPPurchase | null> => {
    try {
        const normalizedInternal = normalizeProcessNumber(internalProcess);
        if (!normalizedInternal) return null;

        console.log(`[PNCP Service - Cached] Searching for process: ${internalProcess}`);

        // Busca em todos os dados sincronizados
        const allData = await getAllProcurementData();
        if (!allData || !allData.data) {
            console.warn('[PNCP Service - Cached] No cached data available, falling back to API');
            // Fallback para a busca via API se não houver dados em cache
            const currentYear = new Date().getFullYear().toString();
            return findPncpPurchaseByProcess(currentYear, internalProcess);
        }

        // Procura pelo processo normalizado
        const match = allData.data.find((p: any) => {
            const normalizedPncp = normalizeProcessNumber(p.processo || '');
            return normalizedPncp === normalizedInternal;
        });

        return match || null;
    } catch (error) {
        console.error('Erro ao buscar processo nos dados sincronizados:', error);
        return null;
    }
};

/**
 * Verifica o status da sincronização de dados.
 */
export const getProcurementSyncStatus = async () => {
    try {
        const url = `${API_SERVER_URL}/api/procurement/status`;
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        console.error('Erro ao verificar status de sincronização:', error);
        return null;
    }
};

/**
 * Força uma sincronização manual dos dados de contratações.
 */
export const triggerProcurementSync = async () => {
    try {
        const url = `${API_SERVER_URL}/api/procurement/sync`;
        const response = await axios.post(url);
        return response.data;
    } catch (error) {
        console.error('Erro ao forçar sincronização:', error);
        return null;
    }
};

