
import { Category, ContractItem } from './types';

export const CNPJ_IFES_BSF = '10838653000106';
// Mapeamento de Anos e seus respectivos Sequenciais no PNCP para o Campus BSF
export const PCA_YEARS_MAP: Record<string, string> = {
    '2026': '12'
};

export const DEFAULT_YEAR = '2026';

export const LOCAL_API_SERVER = 'http://localhost:3002';
// A URL base agora será construída dinamicamente no App.tsx

export const FALLBACK_DATA: ContractItem[] = [];
