import React, { useMemo, useState, useEffect } from 'react';
import {
    Activity,
    BarChart3,
    Layers,
    Clock,
    TrendingUp,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { ContractItem } from '../types';
import { formatCurrency } from '../utils/formatters';
import { groupItemsByDfd, DfdGroup } from '../utils/processLogic';
import { FileText, Link as LinkIcon, X } from 'lucide-react';
import { linkItemsToProcess } from '../services/acquisitionService';
import { API_SERVER_URL } from '../constants';

interface ProcessDashboardProps {
    data: ContractItem[];
}

const ProcessDashboard: React.FC<ProcessDashboardProps> = ({ data }) => {
    const [isMounted, setIsMounted] = useState(false);
    const [isChartsVisible, setIsChartsVisible] = useState(true);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [selectedDfd, setSelectedDfd] = useState<DfdGroup | null>(null);
    const [sipacProtocolInput, setSipacProtocolInput] = useState('');
    const [isLinking, setIsLinking] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const dfdGroups = useMemo(() => groupItemsByDfd(data), [data]);
    const pendingDfds = useMemo(() => dfdGroups.filter(g => g.status === 'Pendente'), [dfdGroups]);

    const handleLinkProcess = async (dfdNumber: string, protocol: string) => {
        if (!selectedDfd) return;
        setIsLinking(true);
        try {
            // 1. Fetch SIPAC Data
            const response = await fetch(`${API_SERVER_URL}/api/sipac/processo?protocolo=${protocol}`);
            if (!response.ok) throw new Error('Falha ao buscar dados no SIPAC');
            const sipacData = await response.json();

            if (sipacData.scraping_last_error) {
                alert(`Erro no SIPAC: ${sipacData.scraping_last_error}`);
                setIsLinking(false);
                return;
            }

            // 2. Link Items
            const itemIds = selectedDfd.items.map(i => i.id);
            const year = selectedDfd.items[0]?.ano;
            await linkItemsToProcess(protocol, itemIds, sipacData, year);

            alert('Processo vinculado e dados atualizados com sucesso!');
            setLinkModalOpen(false);
            setSipacProtocolInput('');
            // Note: The parent component or data fetcher needs to refresh to show changes.
            // Since data comes from props, we can't force refresh here easily unless we reload or have a callback.
            // For now, reload window is a crude but effective way given the architecture constraints,
            // or we rely on live sync if implemented.
            window.location.reload();

        } catch (err) {
            console.error(err);
            alert('Erro ao vincular processo. Verifique o número e tente novamente.');
        } finally {
            setIsLinking(false);
        }
    };

    // Filtra apenas itens que possuem um processo SIPAC (ou seja, estão em execução)
    const processItems = useMemo(() =>
        data.filter(item => item.protocoloSIPAC && item.protocoloSIPAC.length > 5),
        [data]
    );

    const stats = useMemo(() => {
        const totalValue = processItems.reduce((acc, item) => acc + item.valor, 0);
        // Consideramos em andamento o que não está contratado nem encerrado
        const inProgress = processItems.filter(item =>
            !['Contratado', 'Encerrado/Arquivado', 'Adjudicado/Homologado'].includes(item.computedStatus || '')
        ).length;

        // Processos Estagnados (Baseado no Health Score dinâmico)
        const stalled = processItems.filter(item => {
            const score = (item.dadosSIPAC as any)?.health_score || 100;
            return score < 70; // Score abaixo de 70 indica estagnação ou muitos dias parado
        }).length;

        return {
            totalCount: processItems.length,
            totalValue,
            inProgress,
            stalled
        };
    }, [processItems]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        processItems.forEach(item => {
            const status = item.computedStatus || 'Indefinido';
            counts[status] = (counts[status] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [processItems]);

    const movementData = useMemo(() => {
        return processItems
            .map(item => ({
                name: item.titulo.substring(0, 20) + '...',
                fullTitle: item.titulo,
                value: item.dadosSIPAC?.movimentacoes?.length || 0,
                incidentes: item.dadosSIPAC?.incidentes?.length || 0,
                health: (item.dadosSIPAC as any)?.health_score || 100
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [processItems]);

    const STATUS_COLORS: Record<string, string> = {
        'Planejamento da Contratação': '#3b82f6',
        'Composição de Preços': '#6366f1',
        'Análise de Legalidade': '#f59e0b',
        'Fase Externa': '#10b981',
        'Licitação Suspensa/Sob Análise': '#ef4444',
        'Adjudicado/Homologado': '#8b5cf6',
        'Contratado': '#047857',
        'Encerrado/Arquivado': '#64748b'
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Linha 1: KPIs Rápidos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-2 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <Activity size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Processos Ativos</p>
                    <h3 className="text-2xl font-black text-slate-900">{stats.totalCount}</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">{stats.inProgress} em trâmite atual</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-emerald-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor sob Gestão</p>
                    <h3 className="text-2xl font-black text-slate-900">{formatCurrency(stats.totalValue)}</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">Volume financeiro em processos</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-amber-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-amber-50 p-2 rounded-xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                            <Clock size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Engajamento (Saúde)</p>
                    <h3 className="text-2xl font-black text-slate-900">{stats.stalled} alertas</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">Processos com score de saúde crítico</p>
                </div>
            </div>

            {/* Seção de Controle de Gráficos */}
            <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-slate-100" />
                <button
                    onClick={() => setIsChartsVisible(!isChartsVisible)}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm hover:border-blue-500 hover:text-blue-600 transition-all group"
                >
                    <BarChart3 size={14} className="text-slate-400 group-hover:text-blue-500" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-blue-700">
                        {isChartsVisible ? "Ocultar Dashboards de Processos" : "Exibir Dashboards de Processos"}
                    </span>
                    {isChartsVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="h-px flex-1 bg-slate-100" />
            </div>

            {/* Linha 2: Gráficos */}
            {isChartsVisible && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0">
                        <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                            <BarChart3 size={16} className="text-blue-500" /> Volume por Fase do Processo
                        </h3>
                        <div className="w-full h-[400px] relative">
                            {isMounted && (
                                <ResponsiveContainer width="99%" height={380}>
                                    <PieChart>
                                        <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                                            {statusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#cbd5e1'} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value} processos`, name]}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px', fontWeight: 700, color: '#64748b', paddingTop: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none pb-6">
                                <span className="text-3xl font-black text-slate-800 leading-none">{stats.totalCount}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Total</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden min-w-0">
                        <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                            <Layers size={16} className="text-emerald-500" /> Nível de Complexidade (Trâmites)
                        </h3>
                        <div className="w-full h-[400px] relative">
                            {isMounted && (
                                <ResponsiveContainer width="99%" height={380}>
                                    <BarChart data={movementData} layout="vertical" margin={{ left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value: number, name: string, props: any) => [`${value} movimentações`, `Incidentes: ${props.payload.incidentes}`]} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                            <div className="absolute top-2 right-2 flex flex-col items-end pointer-events-none">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Processos Mais Movimentados</span>
                            </div>
                        </div>
                        <div className="mt-auto space-y-2">
                            {movementData.map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${item.health < 60 ? 'bg-red-500' : item.health < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                        <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]" title={item.fullTitle}>{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {item.incidentes > 0 && <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 rounded-full">{item.incidentes} !</span>}
                                        <span className="text-[10px] font-black text-slate-400">{item.value} trâm.</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Seção A: DFDs Pendentes de Autuação */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                        <FileText size={16} className="text-slate-400" /> DFDs Pendentes de Autuação
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded-full">{pendingDfds.length} Pendentes</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-white border-b border-slate-100">
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº DFD</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade Requisitante</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qtd. Itens</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Total</th>
                                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {pendingDfds.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-8 text-center text-xs text-slate-400 font-bold">Nenhum DFD pendente encontrado.</td></tr>
                            ) : (
                                pendingDfds.map((group) => (
                                    <tr key={group.numeroDfd} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 text-xs font-black text-slate-700">{group.numeroDfd}</td>
                                        <td className="px-6 py-3 text-xs font-medium text-slate-600 truncate max-w-[200px]" title={group.unidadeRequisitante}>{group.unidadeRequisitante}</td>
                                        <td className="px-6 py-3 text-xs font-bold text-slate-600 text-center">{group.itemCount}</td>
                                        <td className="px-6 py-3 text-xs font-bold text-slate-600 text-right">{formatCurrency(group.totalValue)}</td>
                                        <td className="px-6 py-3 text-center">
                                            <button
                                                onClick={() => { setSelectedDfd(group); setLinkModalOpen(true); }}
                                                className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg text-[10px] font-black hover:bg-blue-100 transition-all flex items-center gap-1 mx-auto"
                                            >
                                                <LinkIcon size={12} /> Vincular
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Vínculo */}
            {linkModalOpen && selectedDfd && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden font-sans">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-sm font-black text-slate-800">Vincular Processo SIPAC</h3>
                            <button onClick={() => setLinkModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={18} /></button>
                        </div>
                        <div className="p-6">
                            <p className="text-xs text-slate-500 mb-6">
                                Digite o número do processo para o DFD <strong>{selectedDfd.numeroDfd}</strong>.
                                Isso vinculará automaticamente os <strong className="text-slate-800">{selectedDfd.itemCount} itens</strong> deste grupo.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Número do Processo</label>
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Ex: 23068.000000/2024-00"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                        value={sipacProtocolInput}
                                        onChange={(e) => setSipacProtocolInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => { setLinkModalOpen(false); setSipacProtocolInput(''); }}
                                className="px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-100 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleLinkProcess(selectedDfd.numeroDfd, sipacProtocolInput)}
                                disabled={!sipacProtocolInput || isLinking}
                                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
                            >
                                {isLinking ? 'Vinculando...' : 'Confirmar Vínculo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcessDashboard;
