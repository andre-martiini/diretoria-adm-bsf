
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
  abcClass?: 'A' | 'B' | 'C';
  riskStatus?: 'Baixo' | 'Médio' | 'Alto';
}

export interface SummaryData {
  totalValue: number;
  totalItems: number;
  materials: { qtd: number; val: number };
  tic: { qtd: number; val: number };
  services: { qtd: number; val: number };
  obras: { qtd: number; val: number };
  executedValue: number; // Para HUD
  monthlyPlan: { month: string; value: number }[]; // Para Histograma
}

export interface SortConfig {
  key: keyof ContractItem;
  direction: 'asc' | 'desc';
}
