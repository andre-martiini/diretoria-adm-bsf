import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, ExternalLink, RefreshCw, Search, Scale, X } from 'lucide-react';
import logoIfes from '../logo-ifes.png';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';
import {
  fetchGovContractDetail,
  fetchGovContractsModalities,
  GovContractDetailResponse,
  GovContractsRecord,
  GovContractsResponse,
  GovModalityType,
  triggerGovContractsSync
} from '../services/govIntegrationService';
import { formatCurrency, formatDate } from '../utils/formatters';

interface GovContractsDashboardProps {
  embedded?: boolean;
}

const MODALITY_OPTIONS: { value: GovModalityType; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'pregao_eletronico', label: 'Pregao Eletronico' },
  { value: 'dispensa_licitacao', label: 'Dispensa' },
  { value: 'inexigibilidade_licitacao', label: 'Inexigibilidade' },
  { value: 'concorrencia', label: 'Concorrencia' }
];

const currentYear = String(new Date().getFullYear());

const GovContractsDashboard: React.FC<GovContractsDashboardProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedModality, setSelectedModality] = useState<GovModalityType>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<GovContractsResponse | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<GovContractsRecord | null>(null);
  const [detailPayload, setDetailPayload] = useState<GovContractDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const sysConfig = await fetchSystemConfig();
      setConfig(sysConfig);
      setSelectedYear(String(sysConfig?.defaultYear || currentYear));
    };
    init();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<string>(['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', currentYear]);
    Object.keys(config?.pcaYearsMap || {}).forEach((year) => years.add(String(year)));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [config]);

  const loadData = useCallback(async (forceSync: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchGovContractsModalities(
        selectedYear,
        selectedModality,
        forceSync
      );
      setPayload(result);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao carregar dados.');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedModality]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    setSelectedRecord(null);
    setDetailPayload(null);
    setDetailError(null);
    setDetailLoading(false);
  }, [selectedYear, selectedModality]);

  const filteredData = useMemo(() => {
    const source = payload?.data || [];
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return source;
    return source.filter((item) =>
      (item.identificacaoContratacao || '').toLowerCase().includes(normalized) ||
      (item.empresa || '').toLowerCase().includes(normalized) ||
      item.numeroProcesso.toLowerCase().includes(normalized) ||
      item.objeto.toLowerCase().includes(normalized)
    );
  }, [payload, searchTerm]);

  const totals = useMemo(() => {
    return {
      totalRegistros: filteredData.length,
      totalHomologado: filteredData.reduce((acc, item) => acc + Number(item.valorHomologado || 0), 0),
      semHomologacao: filteredData.filter((item) => !item.temValorHomologado).length
    };
  }, [filteredData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (selectedYear === currentYear) {
        await triggerGovContractsSync();
      }
      await loadData(true);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenDetail = async (record: GovContractsRecord) => {
    setSelectedRecord(record);
    setDetailPayload(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const detail = await fetchGovContractDetail(selectedYear, record);
      setDetailPayload(detail);
    } catch (err: any) {
      setDetailError(err?.response?.data?.error || err?.message || 'Falha ao carregar detalhes da contratacao.');
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

  return (
    <div className={embedded ? 'bg-transparent font-sans text-slate-800' : 'min-h-screen border-t-4 border-ifes-green bg-slate-50 font-sans text-slate-800'}>
      {!embedded && (
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain shrink-0" />
            <div className="flex flex-col border-l border-slate-100 pl-3 min-w-0">
              <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Painel Licitacoes</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">
                {config?.unidadeGestora.nome || 'Campus Barra de São Francisco'}
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Pregao, Dispensa, Inexigibilidade e Concorrencia</h1>
          <p className="text-sm text-slate-500 font-medium">
            Ano atual com sincronizacao automatica do backend e anos anteriores em snapshot fixo.
          </p>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            <span className={`px-2 py-1 rounded-md ${payload?.metadata?.fixedSnapshot ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {payload?.metadata?.fixedSnapshot ? 'Snapshot Historico Fixo' : 'Sync Ativa'}
            </span>
            <span className="text-slate-400">Ano {selectedYear}</span>
          </div>
          {payload?.metadata?.warning && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {payload.metadata.warning}
            </p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            <select
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value as GovModalityType)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none"
            >
              {MODALITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <div className="relative min-w-[260px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por contratacao, empresa, processo ou objeto..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-slate-700 outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wide bg-ifes-green text-white disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {selectedYear === currentYear ? 'Sincronizar Ano Atual' : 'Atualizar Snapshot do Ano'}
          </button>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Registros</p>
            <h3 className="text-3xl font-black text-slate-900">{totals.totalRegistros}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Homologado</p>
            <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.totalHomologado)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sem Homologacao</p>
            <h3 className="text-3xl font-black text-slate-900">{totals.semHomologacao}</h3>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-ifes-green">
              <Scale size={16} />
              <span className="text-xs font-black uppercase tracking-widest">Detalhamento das Modalidades</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Atualizado em {payload?.metadata?.extractedAt ? formatDate(payload.metadata.extractedAt) : '-'}
            </span>
          </div>
          <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 font-semibold">
            Clique em uma linha para abrir os detalhes completos da contratacao.
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Carregando dados...</div>
          ) : error ? (
            <div className="p-8 text-center text-sm font-bold text-red-500">{error}</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-sm font-bold text-slate-500">Nenhum registro encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1160px] text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Modalidade</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Contratacao</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Empresa</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Objeto</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider text-right">Valor Homologado</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Homologacao</th>
                    <th className="px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">Publicacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((item: GovContractsRecord, index: number) => (
                    <tr
                      key={`${item.numeroControlePNCP || item.numeroProcesso}-${index}`}
                      onClick={() => handleOpenDetail(item)}
                      className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wide">
                          <Building2 size={12} />
                          {item.modalidade}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm font-bold text-slate-700">{item.identificacaoContratacao || item.numeroProcesso}</div>
                        <div className="text-[11px] font-medium text-slate-400">{item.numeroProcesso}</div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600 max-w-[260px]">
                        <div className="line-clamp-2">{item.empresa || '-'}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 max-w-[520px]">
                        <div className="line-clamp-2">{item.objeto}</div>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-black text-slate-900">
                        {formatCurrency(Number(item.valorHomologado || 0))}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wide ${item.temValorHomologado ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {item.temValorHomologado ? 'Homologado' : 'Nao homologado'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-500">
                        {item.dataPublicacao ? formatDate(item.dataPublicacao) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedRecord && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <button
              aria-label="Fechar detalhes"
              onClick={handleCloseDetail}
              className="absolute inset-0 bg-slate-900/45 cursor-pointer"
            />
            <aside className="relative h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto">
              <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-black text-slate-400">Detalhes da Contratacao</p>
                  <h3 className="text-sm font-black text-slate-900 truncate">
                    {detailData?.identificacaoContratacao || selectedRecord.identificacaoContratacao || detailData?.numeroControlePNCP || selectedRecord.numeroControlePNCP || selectedRecord.numeroProcesso}
                  </h3>
                </div>
                <button
                  onClick={handleCloseDetail}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-5">
                {detailLoading ? (
                  <div className="text-sm font-bold text-slate-500">Carregando detalhes...</div>
                ) : detailError ? (
                  <div className="text-sm font-bold text-red-600">{detailError}</div>
                ) : detailData ? (
                  <>
                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Identificacao</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Contratacao:</span> {detailData.identificacaoContratacao || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Modalidade:</span> {detailData.modalidade || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Empresa:</span> {detailData.empresa || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Situacao:</span> {detailData.situacaoCompra || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Numero da compra:</span> {detailData.numeroCompra || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Processo:</span> {detailData.numeroProcesso || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Ano/Sequencial:</span> {detailData.anoCompra || '-'} / {detailData.sequencialCompra || '-'}</p>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Objeto</h4>
                      <p className="text-sm text-slate-700 leading-relaxed">{detailData.objeto || '-'}</p>
                      {detailData.informacaoComplementar && (
                        <p className="text-sm text-slate-600 leading-relaxed">{detailData.informacaoComplementar}</p>
                      )}
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Valores e Homologacao</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor estimado:</span> {formatCurrency(Number(detailData.valorEstimado || 0))}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Valor homologado:</span> {formatCurrency(Number(detailData.valorHomologado || 0))}</p>
                      <p className="text-sm">
                        <span className="font-bold text-slate-700">Status:</span>{' '}
                        <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wide ${detailData.temValorHomologado ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {detailData.temValorHomologado ? 'Homologado' : 'Nao homologado'}
                        </span>
                      </p>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Datas</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Publicacao:</span> {detailData.dataPublicacao ? formatDate(detailData.dataPublicacao) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Abertura:</span> {detailData.dataAberturaProposta ? formatDate(detailData.dataAberturaProposta) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Encerramento:</span> {detailData.dataEncerramentoProposta ? formatDate(detailData.dataEncerramentoProposta) : '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Atualizacao:</span> {detailData.dataAtualizacao ? formatDate(detailData.dataAtualizacao) : '-'}</p>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Orgao e Unidade</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Orgao:</span> {detailData.orgaoEntidade.razaoSocial || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">CNPJ:</span> {detailData.orgaoEntidade.cnpj || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Unidade:</span> {detailData.unidadeOrgao.nomeUnidade || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Municipio/UF:</span> {detailData.unidadeOrgao.municipio || '-'} - {detailData.unidadeOrgao.uf || '-'}</p>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Base Legal</h4>
                      <p className="text-sm"><span className="font-bold text-slate-700">Amparo legal:</span> {detailData.amparoLegal.nome || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Instrumento convocatorio:</span> {detailData.tipoInstrumentoConvocatorio.nome || '-'}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">SRP:</span> {detailData.srp === null ? '-' : (detailData.srp ? 'Sim' : 'Nao')}</p>
                      <p className="text-sm"><span className="font-bold text-slate-700">Orcamento sigiloso:</span> {detailData.orcamentoSigiloso.descricao || '-'}</p>
                    </section>

                    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Links</h4>
                      <div className="flex flex-col gap-2">
                        {detailData.links.pncp && (
                          <a
                            href={detailData.links.pncp}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-bold text-ifes-green hover:underline"
                          >
                            Abrir no PNCP <ExternalLink size={14} />
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
                        {!detailData.links.pncp && !detailData.links.processoEletronico && (
                          <p className="text-sm text-slate-500">Sem links disponiveis para esta contratacao.</p>
                        )}
                      </div>
                    </section>

                    {detailData.fontesOrcamentarias.length > 0 && (
                      <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Fontes Orcamentarias</h4>
                        <p className="text-sm text-slate-700">Quantidade de fontes registradas: {detailData.fontesOrcamentarias.length}</p>
                      </section>
                    )}

                    {detailPayload?.metadata?.remoteDetailError && (
                      <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Detalhe remoto PNCP indisponivel no momento: {detailPayload.metadata.remoteDetailError}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="text-sm font-bold text-slate-500">Selecione um item para ver os detalhes.</div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

export default GovContractsDashboard;
