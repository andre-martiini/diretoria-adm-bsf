
export interface SIPACDocument {
  ordem: string;
  tipo: string;
  data: string;
  unidadeOrigem: string;
  natureza: string;
  statusVisualizacao: string;
  url?: string;
}

export type FinancialEventType = 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO' | 'ANULACAO';

export interface FinancialEvent {
  value: number;
  date: string;
  type: FinancialEventType;
  documentTitle: string;
}

export interface SIPACMovement {
  data: string;
  horario?: string;
  unidadeOrigem: string;
  unidadeDestino: string;
  usuario?: string;
  urgente?: string;
  usuarioRemetente?: string;
  usuarioRecebedor?: string;
  dataRecebimento?: string;
  horarioRecebimento?: string;
}

export interface SIPACIncident {
  tipo: string;
  data: string;
  usuario: string;
  descricao: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  dataCancelamento?: string;
  usuarioSolicitacao?: string;
  dataSolicitacao?: string;
  usuarioCancelamento?: string;
  justificativa?: string;
}

export enum Category {
  Bens = 'Bens',
  Servicos = 'Serviços',
  TIC = 'TIC',
  Obras = 'Obras'
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
  createdAt?: any;
}

export interface BudgetRecord {
  id: string;
  elementId: string;
  mes: number;
  empenhado: number;
  executadoRP: number;
  executado: number;
  ano: number;
  updatedAt?: any;
}

export interface ContractItem {
  id: string | number;
  titulo: string;
  subtitulo?: string;
  valor: number;
  valorExecutado?: number;
  categoria: Category;
  inicio: string;
  fim: string;
  area: string;
  vencimento?: string;
  status?: string;
  articulador?: string;
  isManual?: boolean;
  protocoloSIPAC?: string;
  dadosSIPAC: SIPACProcess | null;
  vinculo_processo_id?: string;
  status_item?: string;
  updatedAt?: any;
  ano?: string;
  isGroup?: boolean;
  childItems?: ContractItem[];
  identificadorFuturaContratacao?: string;
  computedStatus?: string;
  computedSituation?: string;
  valorEmpenhado?: number;
  dadosExecucao?: any;
  // PNCP Detail Fields
  numeroItem?: number;
  codigoItem?: string;
  unidadeMedida?: string;
  quantidade?: number;
  valorUnitario?: number;
  unidadeRequisitante?: string;
  grupoContratacao?: string;
  descricaoDetalhada?: string;
  numeroDfd?: string;
  ifc?: string;
  sequencialItemPca?: number;
  classificacaoSuperiorCodigo?: string;
  classificacaoSuperiorNome?: string;
  dataDesejada?: string;
  equipePlanejamento?: string[];
  equipeIdentificada?: boolean;
}

export interface PCAMetadata {
  id: string;
  dataPublicacao?: string;
  sequencialPca: string;
  dataInclusao: string;
  dataAtualizacao: string;
  valorTotalEstimado: number;
  situacao: string;
  poder: string;
  esfera: string;
  unidadeSubordinada?: string;
  uasg?: string;
  orgaoNome?: string;
}

export interface SummaryData {
  totalValue: number;
  totalItems: number;
  materials: { qtd: number; val: number };
  tic: { qtd: number; val: number };
  services: { qtd: number; val: number };
  obras: { qtd: number; val: number };
  totalExecutado: number;
  totalDelayed: number;
  monthlyPlan: { month: string; value: number }[];
}

export interface SortConfig {
  key: keyof ContractItem;
  direction: 'asc' | 'desc';
}

export interface AIStructuredAnalysis {
  parecer_risco: 'Alto' | 'Médio' | 'Baixo';
  proxima_etapa_sugerida: string;
  pendencias_detectadas: string[];
}

export interface DocumentRule {
  id: string;
  nome: string;
  obrigatoriedade: 'Obrigatório' | 'Obrigatório com exceções' | 'Sempre Obrigatório';
  hipotesesDispensa?: string;
  elementosObrigatorios: string[]; // Checklist items
  keywords: string[]; // Keywords to match against document type/title
}

export type ValidationStatus = 'Presente' | 'Pendente' | 'Dispensado' | 'Opcional';

export interface ChecklistItemResult {
  rule: DocumentRule;
  status: ValidationStatus;
  foundDocument?: SIPACDocument;
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
  unidadeAtual?: string;
  ultimaMovimentacao?: string;
  ultimaAtualizacao?: string;
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
  resumoIA?: string;
  resumoIA_Flash?: string;
  despachosCount?: number;
  fase_interna_status?: string;
  health_score?: number;
  dias_sem_movimentacao?: number;
  snapshot_hash?: string;
  last_ai_hash?: string;
  scraping_last_error?: string;
  analise_ia_estruturada?: AIStructuredAnalysis;
  equipePlanejamento?: string[];
  equipeIdentificada?: boolean;
  checklist?: ChecklistItemResult[];
  checklistAssociations?: Record<string, string>; // RuleID -> Document Order
  isARP?: boolean;
}

export interface ProcessoAquisicao {
  id: string;
  protocoloSIPAC: string;
  id_processo_unificado?: string;
  fase_interna_status: string;
  health_score: number;
  dias_sem_movimentacao: number;
  embedding_contextual?: number[];
  resumo_contextual?: string;
  dadosSIPAC: SIPACProcess;
  itens_vinculados: string[];
  ultima_sincronizacao: any;
  snapshot_hash?: string;
  last_ai_hash?: string;
  scraping_last_error?: string;
}

export interface UnidadeGestora {
  cnpj: string;
  uasg: string;
  nome: string;
}

export interface SystemConfig {
  unidadeGestora: UnidadeGestora;
  pcaYearsMap: Record<string, string>;
  defaultYear: string;
}
