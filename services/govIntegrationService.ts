import axios from 'axios';
import { API_SERVER_URL } from '../constants';
import { ModalidadeContratacaoGov } from '../types';

export type GovModalityType =
  | 'all'
  | 'pregao_eletronico'
  | 'dispensa_licitacao'
  | 'inexigibilidade_licitacao'
  | 'concorrencia';

export interface GovContractsRecord extends ModalidadeContratacaoGov {
  modalidadeCodigo: Exclude<GovModalityType, 'all'>;
  numeroControlePNCP?: string | null;
  anoCompra?: string | null;
  sequencialCompra?: string | null;
  valorEstimado?: number;
  temValorHomologado?: boolean;
  statusHomologacao?: 'HOMOLOGADO' | 'NAO_HOMOLOGADO';
  situacaoCompra?: string | null;
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
