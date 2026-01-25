
export enum Category {
  Bens = 'Bens',
  Servicos = 'Serviços',
  TIC = 'TIC',
  Obras = 'Obras'
}

export interface ContractItem {
  id: string | number;
  titulo: string;
  categoria: Category;
  valor: number;
  inicio: string;
  fim: string;
  area: string;
  valorExecutado?: number;
  abcClass?: 'A' | 'B' | 'C';
  riskStatus?: 'Baixo' | 'Médio' | 'Alto';
  isManual?: boolean;
}

export interface SummaryData {
  totalValue: number;
  totalItems: number;
  materials: { qtd: number; val: number };
  tic: { qtd: number; val: number };
  services: { qtd: number; val: number };
  obras: { qtd: number; val: number };
  totalExecutado: number;
  monthlyPlan: { month: string; value: number }[];
}

export interface SortConfig {
  key: keyof ContractItem;
  direction: 'asc' | 'desc';
}
