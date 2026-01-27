
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
  ano?: string;
  // Integração SIPAC
  protocoloSIPAC?: string;
  dadosSIPAC?: SIPACProcess & {
    ultimaAtualizacao?: string;
  };
  computedStatus?: string;
  identificadorFuturaContratacao?: string;
  isGroup?: boolean;
  itemCount?: number;
  childItems?: ContractItem[];
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

export enum BudgetType {
  Custeio = 'Custeio',
  Investimento = 'Investimento'
}

export interface BudgetElement {
  id: string;
  nome: string;
  tipo: BudgetType;
  ano: number;
}

export interface BudgetRecord {
  id: string;
  elementId: string;
  mes: number;
  ano: number;
  empenhado: number;
  executadoRP: number;
  executado: number;
}

export interface SIPACDocument {
  ordem: string;
  tipo: string;
  data: string;
  unidadeOrigem: string;
  natureza: string;
  statusVisualizacao: string; // Link or text
  url?: string;
}

export interface SIPACMovement {
  data: string;
  horario: string;
  unidadeOrigem: string;
  unidadeDestino: string;
  usuarioRemetente: string;
  dataRecebimento: string;
  horarioRecebimento: string;
  usuarioRecebedor: string;
  urgente?: string;
}

export interface SIPACIncident {
  numeroDocumento: string;
  tipoDocumento: string;
  usuarioSolicitacao: string;
  dataSolicitacao: string;
  usuarioCancelamento: string;
  dataCancelamento: string;
  justificativa: string;
}

export interface SIPACProcess {
  // Cabeçalho e Identificação
  numeroProcesso: string;
  dataAutuacion: string;
  horarioAutuacion: string;
  usuarioAutuacion: string;
  natureza: string;
  status: string;
  dataCadastro: string;
  unidadeOrigem: string;
  totalDocumentos: string;
  observacao: string;

  // Classificação Temática
  assuntoCodigo: string;
  assuntoDescricao: string;
  assuntoDetalhado: string;

  // Interessados
  interessados: {
    tipo: string;
    nome: string;
  }[];

  // Listas
  documentos: SIPACDocument[];
  movimentacoes: SIPACMovement[];
  incidentes: SIPACIncident[];
}
