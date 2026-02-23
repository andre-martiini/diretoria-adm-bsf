
import { Category, ContractItem } from './types';

export const CNPJ_IFES_BSF = '10838653000106';
// Mapeamento de Anos e seus respectivos Sequenciais no PNCP para o Campus BSF
export const PCA_YEARS_MAP: Record<string, string> = {
    '2026': '12',
    '2025': '12',
    '2024': '15',
    '2023': '14',
    '2022': '20'
};

export const DEFAULT_YEAR = '2026';

// Threshold for Dispensa (generic value for Goods/Services - Law 14.133, Art 75, II + updates)
// Using ~59k as a safe reference for 2024/2025.
export const DISPENSA_LICITACAO_LIMIT = 59000;

export const API_SERVER_URL = import.meta.env.VITE_API_URL || '';

// A URL base agora será construída dinamicamente no App.tsx

export const FALLBACK_DATA: ContractItem[] = [
    {
        id: '99999',
        titulo: '[MOCK] Aquisição de Equipamentos de Informática',
        categoria: Category.TIC,
        valor: 50000,
        inicio: '2026-03-01',
        fim: '2026-12-31',
        area: 'Coordenadoria de TI',
        ano: '2026',
        isManual: false,
        protocoloSIPAC: '23147.000123/2026-99',
        dadosSIPAC: {
            numeroProcesso: '23147.000123/2026-99',
            dataAutuacion: '01/01/2026',
            horarioAutuacion: '10:00',
            usuarioAutuacion: 'ADMIN',
            natureza: 'OSTENSIVO',
            status: 'ATIVO',
            dataCadastro: '01/01/2026',
            unidadeOrigem: 'CTI - COORDENADORIA DE TI',
            totalDocumentos: '5',
            observacao: '',
            assuntoCodigo: '123',
            assuntoDescricao: 'Aquisição de Bens',
            assuntoDetalhado: 'Computadores para laboratórios',
            interessados: [],
            documentos: [
                { ordem: '1', tipo: 'Ofício', data: '02/01/2026', unidadeOrigem: 'CTI', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' },
                { ordem: '2', tipo: 'Pesquisa de Preços', data: '15/01/2026', unidadeOrigem: 'CTI', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' },
                { ordem: '3', tipo: 'Mapa Comparativo', data: '20/01/2026', unidadeOrigem: 'CTI', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' }
            ],
            movimentacoes: [
                { data: '25/01/2026', horario: '14:00', unidadeOrigem: 'DLC', unidadeDestino: 'GABINETE', usuarioRemetente: 'X', usuarioRecebedor: 'Y', dataRecebimento: '25/01/2026', horarioRecebimento: '14:10' },
                { data: '20/01/2026', horario: '10:00', unidadeOrigem: 'CTI', unidadeDestino: 'DLC', usuarioRemetente: 'A', usuarioRecebedor: 'B', dataRecebimento: '20/01/2026', horarioRecebimento: '10:30' },
                { data: '01/01/2026', horario: '08:00', unidadeOrigem: 'CTI', unidadeDestino: 'CTI', usuarioRemetente: 'System', usuarioRecebedor: 'Admin', dataRecebimento: '01/01/2026', horarioRecebimento: '08:00' }
            ],
            incidentes: []
        }
    },
    {
        id: '88888',
        titulo: '[MOCK] Contratação de Serviço de Limpeza',
        categoria: Category.Servicos,
        valor: 120000,
        inicio: '2026-02-01',
        fim: '2026-12-31',
        area: 'Diretoria de Administração',
        ano: '2026',
        isManual: false,
        protocoloSIPAC: '23147.000456/2026-88',
        dadosSIPAC: {
            numeroProcesso: '23147.000456/2026-88',
            dataAutuacion: '05/01/2026',
            horarioAutuacion: '09:00',
            usuarioAutuacion: 'ADMIN',
            natureza: 'OSTENSIVO',
            status: 'ATIVO',
            dataCadastro: '05/01/2026',
            unidadeOrigem: 'DAP',
            totalDocumentos: '10',
            observacao: '',
            assuntoCodigo: '456',
            assuntoDescricao: 'Serviços Gerais',
            assuntoDetalhado: 'Limpeza e conservação',
            interessados: [],
            documentos: [
                { ordem: '1', tipo: 'Estudo Técnico', data: '05/01/2026', unidadeOrigem: 'DAP', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' },
                { ordem: '2', tipo: 'Minuta de Edital', data: '10/02/2026', unidadeOrigem: 'DAP', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' },
                { ordem: '3', tipo: 'Parecer Jurídico', data: '15/02/2026', unidadeOrigem: 'PROCURADORIA', natureza: 'OSTENSIVO', statusVisualizacao: 'ok' }
            ],
            movimentacoes: [
                { data: '15/02/2026', horario: '16:00', unidadeOrigem: 'PROCURADORIA', unidadeDestino: 'DAP', usuarioRemetente: 'Proc', usuarioRecebedor: 'Dap', dataRecebimento: '16/02/2026', horarioRecebimento: '08:00' },
                { data: '10/02/2026', horario: '14:00', unidadeOrigem: 'DAP', unidadeDestino: 'PROCURADORIA', usuarioRemetente: 'Dap', usuarioRecebedor: 'Proc', dataRecebimento: '10/02/2026', horarioRecebimento: '15:00' },
                { data: '05/01/2026', horario: '09:00', unidadeOrigem: 'DAP', unidadeDestino: 'DAP', usuarioRemetente: 'System', usuarioRecebedor: 'Admin', dataRecebimento: '05/01/2026', horarioRecebimento: '09:00' }
            ],
            incidentes: []
        }
    }
];
