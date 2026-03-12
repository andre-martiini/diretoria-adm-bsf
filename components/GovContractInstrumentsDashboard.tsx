import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ExternalLink, FileText, Search, X } from 'lucide-react';
import logoIfes from '../logo-ifes.png';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';
import {
  fetchGovContractInstrumentDetail,
  fetchGovContractInstruments,
  fetchGovContractInstrumentsVigentes,
  GovContractInstrumentDetailResponse,
  GovContractInstrumentRecord,
  GovContractInstrumentResponse
} from '../services/govIntegrationService';
import { formatCurrency, formatDate } from '../utils/formatters';

interface GovContractInstrumentsDashboardProps {
  embedded?: boolean;
}

type InstrumentFilterType = 'all' | 'CONTRATO' | 'EMPENHO';
type StatusFilterType = 'all' | 'VIGENTE' | 'ENCERRADO' | 'A_INICIAR' | 'SEM_VIGENCIA';
type TabType = 'vigentes' | 'historico';
type VigentViewMode = 'cards' | 'table';

const TYPE_OPTIONS: { value: InstrumentFilterType; label: string }[] = [
  { value: 'all', label: 'Todos os instrumentos' },
  { value: 'EMPENHO', label: 'Notas de Empenho' },
  { value: 'CONTRATO', label: 'Contratos' }
];

const STATUS_OPTIONS: { value: StatusFilterType; label: string }[] = [
  { value: 'all', label: 'Todas as situacoes' },
  { value: 'VIGENTE', label: 'Vigentes' },
  { value: 'ENCERRADO', label: 'Encerrados' },
  { value: 'A_INICIAR', label: 'A iniciar' },
  { value: 'SEM_VIGENCIA', label: 'Sem vigencia' }
];

const STATUS_STYLES: Record<string, string> = {
  VIGENTE: 'bg-emerald-100 text-emerald-700',
  ENCERRADO: 'bg-slate-200 text-slate-700',
  A_INICIAR: 'bg-amber-100 text-amber-700',
  SEM_VIGENCIA: 'bg-sky-100 text-sky-700'
};

const currentYear = String(new Date().getFullYear());

const normalizeSearchValue = (value: string | null | undefined): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const parseDateValue = (value: string | null | undefined, endOfDay: boolean = false): Date | null => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}-03:00`);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDaysUntilEnd = (value: string | null | undefined): number | null => {
  const endDate = parseDateValue(value, true);
  if (!endDate) return null;

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const getRemainingLabel = (daysRemaining: number | null): string => {
  if (daysRemaining === null) return 'Sem termino informado';
  if (daysRemaining < 0) return 'Prazo encerrado';
  if (daysRemaining === 0) return 'Encerra hoje';
  if (daysRemaining === 1) return 'Encerra em 1 dia';
  return `Encerra em ${daysRemaining} dias`;
};

const getRemainingStyle = (daysRemaining: number | null): string => {
  if (daysRemaining === null) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (daysRemaining <= 30) return 'bg-red-50 text-red-700 border-red-200';
  if (daysRemaining <= 90) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const getExecutionLinkBadgeClass = (statusCode?: 'PROCESSO_VINCULADO' | 'PROCESSO_DISPONIVEL' | 'NAO_VINCULADO') => {
  if (statusCode === 'PROCESSO_VINCULADO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (statusCode === 'PROCESSO_DISPONIVEL') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
};

const GovContractInstrumentsDashboard: React.FC<GovContractInstrumentsDashboardProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('vigentes');
  const [vigentViewMode, setVigentViewMode] = useState<VigentViewMode>('cards');
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedType, setSelectedType] = useState<InstrumentFilterType>('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilterType>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalPayload, setHistoricalPayload] = useState<GovContractInstrumentResponse | null>(null);
  const [activePayload, setActivePayload] = useState<GovContractInstrumentResponse | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<GovContractInstrumentRecord | null>(null);
  const [detailPayload, setDetailPayload] = useState<GovContractInstrumentDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const sysConfig = await fetchSystemConfig();
      setConfig(sysConfig);
      setSelectedYear(currentYear);
    };
    init();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>(['2022', '2023', '2024', '2025', currentYear]);
    Object.keys(config?.pcaYearsMap || {}).forEach((year) => years.add(String(year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [config]);

  const loadHistoricalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGovContractInstruments(selectedYear, false);
      setHistoricalPayload(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao carregar dados.');
      setHistoricalPayload(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    loadHistoricalData();
  }, [loadHistoricalData]);

  const loadActiveData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGovContractInstrumentsVigentes(false);
      setActivePayload(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao carregar dados.');
      setActivePayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveData();
  }, [loadActiveData]);

  useEffect(() => {
    setSelectedRecord(null);
    setDetailPayload(null);
    setDetailError(null);
    setDetailLoading(false);
  }, [activeTab, selectedYear, selectedType, selectedStatus]);

  const filteredData = useMemo(() => {
    const source = activeTab === 'vigentes' ? (activePayload?.data || []) : (historicalPayload?.data || []);
    const normalized = normalizeSearchValue(searchTerm);

    return source.filter((item) => {
      if (selectedType !== 'all' && item.tipoInstrumentoCodigo !== selectedType) return false;
      if (activeTab === 'historico' && selectedStatus !== 'all' && item.statusVigenciaCodigo !== selectedStatus) return false;
      if (!normalized) return true;

      return (
        normalizeSearchValue(item.numeroInstrumento).includes(normalized) ||
        normalizeSearchValue(item.identificacaoContratacao).includes(normalized) ||
        normalizeSearchValue(item.empresa).includes(normalized) ||
        normalizeSearchValue(item.numeroProcesso).includes(normalized) ||
        normalizeSearchValue(item.objeto).includes(normalized)
      );
    });
  }, [activePayload, activeTab, historicalPayload, searchTerm, selectedStatus, selectedType]);

  const totals = useMemo(() => ({
    totalRegistros: filteredData.length,
    totalVigentes: filteredData.filter((item) => item.vigente).length,
    totalEmpenhos: filteredData.filter((item) => item.tipoInstrumentoCodigo === 'EMPENHO').length,
    totalValorGlobal: filteredData.reduce((acc, item) => acc + Number(item.valorGlobal || 0), 0)
  }), [filteredData]);

  const activeInstrumentCards = useMemo(() => {
    const source = activePayload?.data || [];
    return source
      .filter((item) => item.vigente)
      .map((item) => ({
        ...item,
        daysRemaining: getDaysUntilEnd(item.dataVigenciaFim)
      }))
      .sort((a, b) => {
        if (a.daysRemaining === null && b.daysRemaining === null) return 0;
        if (a.daysRemaining === null) return 1;
        if (b.daysRemaining === null) return -1;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, 8);
  }, [activePayload]);

  const handleOpenDetail = async (record: GovContractInstrumentRecord) => {
    setSelectedRecord(record);
    setDetailPayload(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const detail = await fetchGovContractInstrumentDetail(record.snapshotYear || selectedYear, record);
      setDetailPayload(detail);
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.message || 'Falha ao carregar detalhes do instrumento.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedRecord(null);
    setDetailPayload(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  const detailData = detailPayload?.data || null;
  const currentPayload = activeTab === 'vigentes' ? activePayload : historicalPayload;

  return (
    <div className={embedded ? 'bg-transparent font-sans text-slate-800' : 'min-h-screen border-t-4 border-ifes-green bg-slate-50 font-sans text-slate-800'}>
      {!embedded && (
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain shrink-0" />
            <div className="flex flex-col border-l border-slate-100 pl-3 min-w-0">
              <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Contratos e Empenhos</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">
                {config?.unidadeGestora.nome || 'Campus Barra de Sao Francisco'}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>
        </div>
      </header>
      )}

      <main className={embedded ? 'space-y-6' : 'max-w-7xl mx-auto px-4 py-8 space-y-6'}>
        <section className="bg-white border-l-4 border-ifes-green p-6 rounded-2xl shadow-sm space-y-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Contratos Administrativos e Notas de Empenho</h1>
          <p className="text-sm text-slate-500 font-medium">
            Notas de empenho sao tratadas como instrumentos contratuais do campus para fins de acompanhamento.
          </p>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <span className={`px-2 py-1 rounded-md ${currentPayload?.metadata?.fixedSnapshot ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {currentPayload?.metadata?.fixedSnapshot ? 'Snapshot Historico Fixo' : 'Sync Ativa'}
            </span>
            <span className="text-slate-400">
              {activeTab === 'vigentes'
                ? `Anos ${currentPayload?.metadata?.sourceYears?.join(', ') || 'disponiveis'}`
                : `Ano ${selectedYear}`}
            </span>
          </div>
          {currentPayload?.metadata?.warning && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {currentPayload.metadata.warning}
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab('vigentes')}
              className={`px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wide transition-colors cursor-pointer ${
                activeTab === 'vigentes'
                  ? 'bg-ifes-green text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Vigentes
            </button>
            <button
              onClick={() => setActiveTab('historico')}
              className={`px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wide transition-colors cursor-pointer ${
                activeTab === 'historico'
                  ? 'bg-ifes-green text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Historico por Ano
            </button>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="flex flex-col sm:flex-row gap-3">
            {activeTab === 'historico' && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            )}

            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as InstrumentFilterType)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            {activeTab === 'historico' && (
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as StatusFilterType)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            <div className="relative min-w-[280px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por instrumento, contratacao, empresa, processo ou objeto..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none"
              />
            </div>

            {activeTab === 'vigentes' && (
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  onClick={() => setVigentViewMode('cards')}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wide cursor-pointer transition-colors ${
                    vigentViewMode === 'cards'
                      ? 'bg-ifes-green text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Cards
                </button>
                <button
                  onClick={() => setVigentViewMode('table')}
                  className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wide cursor-pointer transition-colors ${
                    vigentViewMode === 'table'
                      ? 'bg-ifes-green text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Tabela
                </button>
              </div>
            )}
          </div>

        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Instrumentos</p>
            <h3 className="text-3xl font-black text-slate-900">{totals.totalRegistros}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vigentes</p>
            <h3 className="text-3xl font-black text-slate-900">{totals.totalVigentes}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notas de Empenho</p>
            <h3 className="text-3xl font-black text-slate-900">{totals.totalEmpenhos}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Global</p>
            <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.totalValorGlobal)}</h3>
          </div>
        </section>

        {activeTab === 'vigentes' && vigentViewMode === 'cards' && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-ifes-green">
              <AlertTriangle size={16} />
              <span className="text-xs font-black uppercase tracking-widest">Painel de Vigencias</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              {activeInstrumentCards.length} instrumento(s) vigente(s) destacado(s)
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Carregando painel...</div>
          ) : activeInstrumentCards.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Nenhum instrumento vigente identificado nos snapshots disponiveis.</div>
          ) : (
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {activeInstrumentCards.map((item) => (
                <button
                  key={`vigente-${item.numeroControlePNCP || item.numeroInstrumento || item.numeroProcesso}`}
                  onClick={() => handleOpenDetail(item)}
                  className="text-left rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-ifes-green/30 shadow-sm hover:shadow-md transition-all p-4 space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.tipoInstrumento}</p>
                      <h3 className="text-sm font-black text-slate-900 truncate">{item.numeroInstrumento || '-'}</h3>
                      <p className="text-[11px] font-semibold text-slate-500 truncate">{item.identificacaoContratacao || item.numeroProcesso}</p>
                      {item.snapshotYear && (
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-300 mt-1">Ano base {item.snapshotYear}</p>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${getRemainingStyle(item.daysRemaining)}`}>
                      {getRemainingLabel(item.daysRemaining)}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-700 line-clamp-2">{item.empresa || 'Empresa nao identificada'}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-3 mt-1">{item.objeto}</p>
                    <div className="mt-2">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${getExecutionLinkBadgeClass(item.executionLinkStatusCode)}`}>
                        {item.executionLinkStatusLabel || 'Nao vinculado'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor Global</p>
                      <p className="text-sm font-black text-slate-800">{formatCurrency(item.valorGlobal || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Inicio da Vigencia</p>
                      <p className="text-sm font-black text-slate-800">{item.dataVigenciaInicio ? formatDate(item.dataVigenciaInicio) : 'Sem inicio'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Fim da Vigencia</p>
                      <p className="text-sm font-black text-slate-800">{item.dataVigenciaFim ? formatDate(item.dataVigenciaFim) : 'Sem termino'}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          </section>
        )}

        {(activeTab === 'historico' || vigentViewMode === 'table') && (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-ifes-green">
              <FileText size={16} />
              <span className="text-xs font-black uppercase tracking-widest">
                {activeTab === 'vigentes' ? 'Instrumentos Vigentes' : 'Instrumentos por Ano'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Atualizado em {currentPayload?.metadata?.extractedAt ? formatDate(currentPayload.metadata.extractedAt) : '-'}
            </span>
          </div>
          <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 font-semibold">
            {activeTab === 'vigentes'
              ? vigentViewMode === 'cards'
                ? 'Painel consolidado com todos os instrumentos vigentes, independentemente do ano de origem.'
                : 'Tabela consolidada com todos os instrumentos vigentes, independentemente do ano de origem.'
              : 'Clique em uma linha para abrir os detalhes completos do instrumento.'}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Carregando dados...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm font-bold text-red-600">{error}</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Nenhum registro encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1360px] text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Situacao</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Instrumento</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Empresa</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Vinculo Execucao</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Objeto</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Valor Global</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Vigencia</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item) => (
                    <tr
                      key={`${item.numeroControlePNCP || item.numeroInstrumento || item.numeroProcesso}`}
                      onClick={() => handleOpenDetail(item)}
                      className="border-t border-slate-100 hover:bg-ifes-green/5 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${STATUS_STYLES[item.statusVigenciaCodigo] || 'bg-slate-100 text-slate-700'}`}>
                          {item.statusVigencia}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-700">{item.tipoInstrumento}</td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-slate-700">{item.numeroInstrumento || '-'}</div>
                        <div className="text-[11px] font-medium text-slate-400">{item.identificacaoContratacao || item.numeroProcesso}</div>
                        {item.snapshotYear && (
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-300">Ano base {item.snapshotYear}</div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600 max-w-[260px]">
                        <div className="line-clamp-2">{item.empresa || '-'}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide border ${getExecutionLinkBadgeClass(item.executionLinkStatusCode)}`}>
                          {item.executionLinkStatusLabel || 'Nao vinculado'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 max-w-[520px]">
                        <div className="line-clamp-2">{item.objeto}</div>
                      </td>
                      <td className="px-5 py-4 text-sm font-black text-slate-700 text-right">{formatCurrency(item.valorGlobal || 0)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                        <div>{item.dataVigenciaInicio ? formatDate(item.dataVigenciaInicio) : '-'}</div>
                        <div className="text-[11px] text-slate-400">{item.dataVigenciaFim ? formatDate(item.dataVigenciaFim) : 'Sem termino'}</div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{item.dataAssinatura ? formatDate(item.dataAssinatura) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}
      </main>

      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-black text-slate-400">Detalhes do Instrumento</p>
                <h3 className="text-sm font-black text-slate-900 truncate">
                  {detailData?.numeroInstrumento || selectedRecord.numeroInstrumento || selectedRecord.numeroProcesso}
                </h3>
              </div>
              <button
                onClick={handleCloseDetail}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-4">
              {detailLoading ? (
                <div className="py-8 text-center text-sm font-bold text-slate-500">Carregando detalhes...</div>
              ) : detailError ? (
                <div className="py-8 text-center text-sm font-bold text-red-600">{detailError}</div>
              ) : detailData ? (
                <>
                  <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Identificacao</h4>
                    <p className="text-sm"><span className="font-bold text-slate-700">Tipo:</span> {detailData.tipoInstrumento || '-'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Situacao:</span> {detailData.statusVigencia || '-'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Numero do instrumento:</span> {detailData.numeroInstrumento || '-'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Contratacao originaria:</span> {detailData.identificacaoContratacao || '-'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Vinculo Execucao:</span> {detailData.executionLinkStatusLabel || 'Nao vinculado'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Processo:</span> {detailData.numeroProcesso || '-'}</p>
                    <p className="text-sm"><span className="font-bold text-slate-700">Controle PNCP:</span> {detailData.numeroControlePNCP || '-'}</p>
                  </section>

                  <section className="grid md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Fornecedor</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Empresa:</span> {detailData.empresa || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Documento:</span> {detailData.niFornecedor || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Tipo de pessoa:</span> {detailData.tipoPessoa || '-'}</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Valores</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor Inicial:</span> {formatCurrency(detailData.valorInicial || 0)}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor Global:</span> {formatCurrency(detailData.valorGlobal || 0)}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor Parcela:</span> {formatCurrency(detailData.valorParcela || 0)}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor Acumulado:</span> {formatCurrency(detailData.valorAcumulado || 0)}</p>
                    </div>
                  </section>

                  <section className="grid md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Vigencia e Datas</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Assinatura:</span> {detailData.dataAssinatura ? formatDate(detailData.dataAssinatura) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Inicio da vigencia:</span> {detailData.dataVigenciaInicio ? formatDate(detailData.dataVigenciaInicio) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Fim da vigencia:</span> {detailData.dataVigenciaFim ? formatDate(detailData.dataVigenciaFim) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Publicacao:</span> {detailData.dataPublicacao ? formatDate(detailData.dataPublicacao) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Atualizacao:</span> {detailData.dataAtualizacao ? formatDate(detailData.dataAtualizacao) : '-'}</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Administrativo</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Categoria:</span> {detailData.categoriaProcesso || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Parcelas:</span> {detailData.numeroParcelas ?? '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Retificacoes:</span> {detailData.numeroRetificacao ?? '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Receita:</span> {detailData.receita === null ? '-' : detailData.receita ? 'Sim' : 'Nao'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Ano/Sequencial:</span> {detailData.anoContrato || '-'} / {detailData.sequencialContrato || '-'}</p>
                    </div>
                  </section>

                  <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Objeto</h4>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detailData.objeto || '-'}</p>
                    {detailData.informacaoComplementar && (
                      <p className="text-sm text-slate-500 whitespace-pre-wrap leading-relaxed">{detailData.informacaoComplementar}</p>
                    )}
                  </section>

                  <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Links</h4>
                    <div className="flex flex-wrap gap-4">
                      {detailData.links.pncpInstrumento && (
                        <a
                          href={detailData.links.pncpInstrumento}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-bold text-ifes-green hover:underline"
                        >
                          Abrir instrumento no PNCP <ExternalLink size={14} />
                        </a>
                      )}
                      {detailData.links.pncpContratacao && (
                        <a
                          href={detailData.links.pncpContratacao}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-bold text-ifes-green hover:underline"
                        >
                          Abrir contratacao no PNCP <ExternalLink size={14} />
                        </a>
                      )}
                      {detailData.links.processoEletronico && (
                        <a
                          href={detailData.links.processoEletronico}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-bold text-ifes-green hover:underline"
                        >
                          Processo Eletronico SIPAC <ExternalLink size={14} />
                        </a>
                      )}
                      {!detailData.links.pncpInstrumento && !detailData.links.pncpContratacao && !detailData.links.processoEletronico && (
                        <p className="text-sm text-slate-500">Sem links disponiveis para este instrumento.</p>
                      )}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GovContractInstrumentsDashboard;
