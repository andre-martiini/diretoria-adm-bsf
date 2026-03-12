import axios from 'axios';
import { API_SERVER_URL } from '../constants';
import { ExecutionLinkStatusCode, GovProcessRegistryEntry, ModalidadeContratacaoGov } from '../types';

export type GovModalityType =
  | 'all'
  | 'pregao_eletronico'
  | 'dispensa_licitacao'
  | 'inexigibilidade_licitacao'
  | 'concorrencia';

export interface GovContractsRecord extends ModalidadeContratacaoGov {
  modalidadeCodigo: Exclude<GovModalityType, 'all'>;
  numeroCompra?: string | null;
  identificacaoContratacao?: string | null;
  empresa?: string | null;
  numeroControlePNCP?: string | null;
  anoCompra?: string | null;
  sequencialCompra?: string | null;
  valorEstimado?: number;
  temValorHomologado?: boolean;
  statusHomologacao?: 'HOMOLOGADO' | 'NAO_HOMOLOGADO';
  situacaoCompra?: string | null;
  executionLinkStatusCode?: ExecutionLinkStatusCode;
  executionLinkStatusLabel?: string | null;
  executionLinkedProtocol?: string | null;
}

export interface GovContractsResponse {
  metadata: {
    generatedAt: string;
    year: string;
    currentYear: string;
    fixedSnapshot: boolean;
    source: string | null;
    extractedAt: string | null;
    totalRawPurchases: number;
    totalModalityRecords: number;
    totalHomologado: number;
    semHomologacao: number;
    modalityType: GovModalityType;
    warning?: string;
  };
  data: GovContractsRecord[];
}

export interface GovContractsSummaryResponse {
  metadata: {
    generatedAt: string;
    year: string;
    fixedSnapshot: boolean;
    extractedAt: string | null;
    warning?: string;
  };
  summary: {
    modalidadeCodigo: Exclude<GovModalityType, 'all'>;
    modalidade: string;
    total: number;
    totalHomologado: number;
  }[];
}

export interface GovContractDetail {
  modalidadeCodigo: Exclude<GovModalityType, 'all'> | null;
  modalidade: string | null;
  numeroCompra: string | null;
  identificacaoContratacao: string | null;
  empresa: string | null;
  numeroProcesso: string;
  numeroControlePNCP: string | null;
  anoCompra: string | null;
  sequencialCompra: string | null;
  situacaoCompra: string | null;
  objeto: string;
  informacaoComplementar: string | null;
  valorEstimado: number;
  valorHomologado: number;
  temValorHomologado: boolean;
  statusHomologacao: 'HOMOLOGADO' | 'NAO_HOMOLOGADO';
  dataPublicacao: string | null;
  dataInclusao: string | null;
  dataAtualizacao: string | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  amparoLegal: {
    codigo: string | null;
    nome: string | null;
    descricao: string | null;
  };
  tipoInstrumentoConvocatorio: {
    codigo: string | null;
    nome: string | null;
  };
  orgaoEntidade: {
    cnpj: string | null;
    razaoSocial: string | null;
    poderId: string | null;
    esferaId: string | null;
    codigoOrgao: string | null;
  };
  unidadeOrgao: {
    codigoUnidade: string | null;
    nomeUnidade: string | null;
    municipio: string | null;
    uf: string | null;
    codigoIbge: string | null;
  };
  srp: boolean | null;
  orcamentoSigiloso: {
    codigo: number | null;
    descricao: string | null;
  };
  executionLinkStatusCode?: ExecutionLinkStatusCode;
  executionLinkStatusLabel?: string | null;
  executionLinkedProtocol?: string | null;
  links: {
    sistemaOrigem: string | null;
    processoEletronico: string | null;
    pncp: string | null;
  };
  fontesOrcamentarias: any[];
}

export interface GovContractDetailResponse {
  metadata: {
    generatedAt: string;
    year: string;
    fixedSnapshot: boolean;
    extractedAt: string | null;
    source: string | null;
    remoteDetailUsed: boolean;
    remoteDetailError?: string;
  };
  data: GovContractDetail;
}

export interface GovContractInstrumentRecord {
  snapshotYear: string | null;
  tipoInstrumentoCodigo: 'CONTRATO' | 'EMPENHO';
  tipoInstrumento: string;
  statusVigenciaCodigo: 'VIGENTE' | 'ENCERRADO' | 'A_INICIAR' | 'SEM_VIGENCIA';
  statusVigencia: string;
  vigente: boolean;
  numeroControlePNCP: string | null;
  numeroControlePncpCompra: string | null;
  numeroInstrumento: string | null;
  numeroProcesso: string;
  empresa: string | null;
  niFornecedor: string | null;
  objeto: string;
  valorGlobal: number;
  valorInicial: number;
  dataAssinatura: string | null;
  dataVigenciaInicio: string | null;
  dataVigenciaFim: string | null;
  anoContrato: string | null;
  sequencialContrato: string | null;
  identificacaoContratacao: string | null;
  executionLinkStatusCode?: ExecutionLinkStatusCode;
  executionLinkStatusLabel?: string | null;
  executionLinkedProtocol?: string | null;
  links: {
    pncpInstrumento: string | null;
    pncpContratacao: string | null;
    processoEletronico: string | null;
  };
}

export interface GovContractInstrumentResponse {
  metadata: {
    generatedAt: string;
    year?: string;
    currentYear: string;
    fixedSnapshot?: boolean;
    source: string | null;
    extractedAt: string | null;
    totalRawContracts: number;
    totalRecords: number;
    totalVigentes?: number;
    totalEmpenhos: number;
    totalContratos: number;
    totalValorGlobal: number;
    sourceYears?: string[];
    warning?: string;
  };
  data: GovContractInstrumentRecord[];
}

export interface GovContractInstrumentDetail {
  snapshotYear: string | null;
  tipoInstrumentoCodigo: 'CONTRATO' | 'EMPENHO';
  tipoInstrumento: string;
  statusVigenciaCodigo: 'VIGENTE' | 'ENCERRADO' | 'A_INICIAR' | 'SEM_VIGENCIA';
  statusVigencia: string;
  vigente: boolean;
  numeroControlePNCP: string | null;
  numeroControlePncpCompra: string | null;
  numeroInstrumento: string | null;
  numeroProcesso: string;
  empresa: string | null;
  niFornecedor: string | null;
  tipoPessoa: string | null;
  objeto: string;
  informacaoComplementar: string | null;
  valorInicial: number;
  valorGlobal: number;
  valorParcela: number;
  valorAcumulado: number;
  dataPublicacao: string | null;
  dataAtualizacao: string | null;
  dataAssinatura: string | null;
  dataVigenciaInicio: string | null;
  dataVigenciaFim: string | null;
  anoContrato: string | null;
  sequencialContrato: string | null;
  numeroParcelas: number | null;
  numeroRetificacao: number | null;
  receita: boolean | null;
  categoriaProcesso: string | null;
  identificacaoContratacao: string | null;
  executionLinkStatusCode?: ExecutionLinkStatusCode;
  executionLinkStatusLabel?: string | null;
  executionLinkedProtocol?: string | null;
  orgaoEntidade: {
    cnpj: string | null;
    razaoSocial: string | null;
    poderId: string | null;
    esferaId: string | null;
  };
  unidadeOrgao: {
    codigoUnidade: string | null;
    nomeUnidade: string | null;
    municipio: string | null;
    uf: string | null;
    codigoIbge: string | null;
  };
  links: {
    pncpInstrumento: string | null;
    pncpContratacao: string | null;
    processoEletronico: string | null;
  };
}

export interface GovContractInstrumentDetailResponse {
  metadata: {
    generatedAt: string;
    year: string;
    fixedSnapshot: boolean;
    extractedAt: string | null;
    source: string | null;
  };
  data: GovContractInstrumentDetail;
}

export interface GovProcessRegistryResponse {
  metadata: {
    generatedAt: string;
    totalRecords: number;
    totalLinkedToExecution: number;
    totalWithProcurement: number;
    totalWithInstrument: number;
  };
  data: GovProcessRegistryEntry[];
}

export const fetchGovContractsModalities = async (
  year: string,
  type: GovModalityType = 'all',
  syncCurrentYear: boolean = false
): Promise<GovContractsResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contracts/modalities`, {
    params: {
      year,
      type,
      sync: syncCurrentYear ? '1' : '0'
    }
  });
  return response.data;
};

export const fetchGovContractsSummary = async (year: string): Promise<GovContractsSummaryResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contracts/summary`, {
    params: { year }
  });
  return response.data;
};

export const fetchGovContractDetail = async (
  year: string,
  record: GovContractsRecord
): Promise<GovContractDetailResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contracts/detail`, {
    params: {
      year,
      numeroControlePNCP: record.numeroControlePNCP || undefined,
      sequencialCompra: record.sequencialCompra || undefined,
      numeroProcesso: record.numeroProcesso || undefined
    }
  });
  return response.data;
};

export const triggerGovContractsSync = async () => {
  const response = await axios.post(`${API_SERVER_URL}/api/procurement/sync`);
  return response.data;
};

export const fetchGovContractInstruments = async (
  year: string,
  syncCurrentYear: boolean = false
): Promise<GovContractInstrumentResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contract-instruments`, {
    params: {
      year,
      sync: syncCurrentYear ? '1' : '0'
    }
  });
  return response.data;
};

export const fetchGovContractInstrumentsVigentes = async (
  syncCurrentYear: boolean = false
): Promise<GovContractInstrumentResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contract-instruments/vigentes`, {
    params: {
      sync: syncCurrentYear ? '1' : '0'
    }
  });
  return response.data;
};

export const fetchGovContractInstrumentDetail = async (
  year: string,
  record: GovContractInstrumentRecord
): Promise<GovContractInstrumentDetailResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-contract-instruments/detail`, {
    params: {
      year,
      numeroControlePNCP: record.numeroControlePNCP || undefined,
      numeroInstrumento: record.numeroInstrumento || undefined,
      numeroProcesso: record.numeroProcesso || undefined
    }
  });
  return response.data;
};

export const fetchGovProcessRegistry = async (): Promise<GovProcessRegistryResponse> => {
  const response = await axios.get(`${API_SERVER_URL}/api/gov-process-registry`);
  return response.data;
};
