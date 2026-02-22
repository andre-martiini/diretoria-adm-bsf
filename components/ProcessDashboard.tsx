import React, { useMemo, useState, useEffect } from 'react';
import {
    Activity,
    BarChart3,
    Layers,
    Clock,
    TrendingUp,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    FileText,
    Link as LinkIcon,
    X,
    Search,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    PlusCircle,
    Eye
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
import { linkItemsToProcess } from '../services/acquisitionService';
import { API_SERVER_URL } from '../constants';
import ProcessAutoLinker from './ProcessAutoLinker';

interface ProcessDashboardProps {
    data: ContractItem[];
    showGraphs?: boolean;
    showDfdTable?: boolean;
    onUnlinkDfd?: (group: any) => void; // Mantendo compatibilidade de assinatura, mas não será usado da mesma forma
}

const ProcessDashboard: React.FC<ProcessDashboardProps> = ({ data, showGraphs = true, showDfdTable = true }) => {
    const [isMounted, setIsMounted] = useState(false);
    const [isChartsVisible, setIsChartsVisible] = useState(true);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [autoLinkerOpen, setAutoLinkerOpen] = useState(false);

    // State for Item Selection
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

    const [sipacProtocolInput, setSipacProtocolInput] = useState('');
    const [isLinking, setIsLinking] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [viewingItem, setViewingItem] = useState<ContractItem | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof ContractItem, direction: 'asc' | 'desc' }>({ key: 'valor', direction: 'desc' });
    const itemsPerPage = 10;

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Filter "Pending" Items (No Protocol linked)
    const pendingItems = useMemo(() => {
        return data.filter(item =>
            !item.protocoloSIPAC || item.protocoloSIPAC.length < 5
        );
    }, [data]);

    // Search & Sort Logic
    const filteredItems = useMemo(() => {
        let filtered = pendingItems.filter(item => {
            const lowSearch = searchTerm.toLowerCase();
            return (
                item.titulo.toLowerCase().includes(lowSearch) ||
                (item.codigoItem && item.codigoItem.includes(lowSearch)) ||
                (item.identificadorFuturaContratacao && item.identificadorFuturaContratacao.toLowerCase().includes(lowSearch)) ||
                (item.grupoContratacao && item.grupoContratacao.toLowerCase().includes(lowSearch)) ||
                (item.classificacaoSuperiorCodigo && item.classificacaoSuperiorCodigo.toLowerCase().includes(lowSearch)) ||
                (item.classificacaoSuperiorNome && item.classificacaoSuperiorNome.toLowerCase().includes(lowSearch))
            );
        });

        return filtered.sort((a, b) => {
            const { key, direction } = sortConfig;
            // Handle specialized sorts or default
            let valA = a[key];
            let valB = b[key];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB as string).toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [pendingItems, searchTerm, sortConfig]);

    const handleSort = (key: keyof ContractItem) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortIcon = (key: keyof ContractItem) => {
        if (sortConfig.key !== key) return <ArrowUpDown size={12} className="text-slate-300" />;
        return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-blue-500" /> : <ArrowDown size={12} className="text-blue-500" />;
    };

    // Pagination
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(start, start + itemsPerPage);
    }, [filteredItems, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

    // Selection Handlers
    const toggleSelection = (id: string) => {
        setSelectedItemIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const toggleSelectAllPage = () => {
        const pageIds = paginatedItems.map(i => String(i.id));
        const allSelected = pageIds.every(id => selectedItemIds.has(id));

        setSelectedItemIds(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                pageIds.forEach(id => newSet.delete(id));
            } else {
                pageIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

    const handleLinkProcess = async () => {
        if (selectedItemIds.size === 0 || !sipacProtocolInput) return;
        setIsLinking(true);
        try {
            const response = await fetch(`${API_SERVER_URL}/api/sipac/processo?protocolo=${sipacProtocolInput}`);
            if (!response.ok) throw new Error('Falha ao buscar dados no SIPAC');
            const sipacData = await response.json();

            if (sipacData.scraping_last_error) {
                alert(`Erro no SIPAC: ${sipacData.scraping_last_error}`);
                setIsLinking(false);
                return;
            }

            // Convert Set to Array
            const itemIds = Array.from(selectedItemIds);

            // Find year from first item (assuming same year context usually)
            const firstItem = data.find(i => String(i.id) === itemIds[0]);
            const year = firstItem?.ano;

            await linkItemsToProcess(sipacProtocolInput, itemIds, sipacData, year);

            alert('Processo criado e itens vinculados com sucesso!');
            setLinkModalOpen(false);
            setSipacProtocolInput('');
            setSelectedItemIds(new Set());
            window.location.reload();

        } catch (err) {
            console.error(err);
            alert('Erro ao vincular processo. Verifique o número e tente novamente.');
        } finally {
            setIsLinking(false);
        }
    };

    // --- KPI & Charts Logic (Existing) ---
    const processItems = useMemo(() =>
        data.filter(item => item.protocoloSIPAC && item.protocoloSIPAC.length > 5),
        [data]
    );

    const uniqueProcesses = useMemo(() => {
        const processMap = new Map<string, ContractItem[]>();
        processItems.forEach(item => {
            const protocol = item.protocoloSIPAC!;
            if (!processMap.has(protocol)) {
                processMap.set(protocol, []);
            }
            processMap.get(protocol)!.push(item);
        });
        return Array.from(processMap.entries()).map(([protocol, items]) => ({
            protocol,
            items,
            firstItem: items[0]
        }));
    }, [processItems]);

    const stats = useMemo(() => {
        const totalValue = processItems.reduce((acc, item) => acc + item.valor, 0);
        const inProgress = uniqueProcesses.filter(p =>
            !['Contratado', 'Encerrado/Arquivado', 'Adjudicado/Homologado'].includes(p.firstItem.computedStatus || '')
        ).length;

        const stalled = uniqueProcesses.filter(p => {
            const score = (p.firstItem.dadosSIPAC as any)?.health_score || 100;
            return score < 70;
        }).length;

        return {
            totalCount: uniqueProcesses.length,
            totalValue,
            inProgress,
            stalled
        };
    }, [processItems, uniqueProcesses]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        uniqueProcesses.forEach(p => {
            const status = p.firstItem.computedStatus || 'Indefinido';
            counts[status] = (counts[status] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [uniqueProcesses]);

    const movementData = useMemo(() => {
        return uniqueProcesses
            .map(p => ({
                name: p.protocol.substring(0, 20),
                fullTitle: p.firstItem.titulo,
                value: p.firstItem.dadosSIPAC?.movimentacoes?.length || 0,
                incidentes: p.firstItem.dadosSIPAC?.incidentes?.length || 0,
                health: (p.firstItem.dadosSIPAC as any)?.health_score || 100
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [uniqueProcesses]);

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
            {showGraphs && (
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
            )}

            {/* Seção de Controle de Gráficos */}
            {showGraphs && (
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
            )}

            {/* Linha 2: Gráficos */}
            {showGraphs && isChartsVisible && (
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

            {/* Seção A: Itens Disponíveis (Antigo "Grupos de Contratação") */}
            {showDfdTable && (
                <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden mt-6">
                    <div className="px-6 py-4 border-b border-blue-100 bg-blue-50/30 flex justify-between items-center">
                        <div>
                            <h3 className="text-sm font-black text-blue-900 uppercase tracking-wide flex items-center gap-2">
                                <FileText size={16} className="text-blue-400" /> Itens Disponíveis para Autuação
                            </h3>
                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1 italic">
                                Selecione os itens do PCA e crie um novo processo
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            {/* Search */}
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                                <input
                                    type="text"
                                    placeholder="Buscar por descrição, ID ou objeto..."
                                    className="w-full pl-9 pr-4 py-2 bg-white border border-blue-100 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                />
                            </div>

                            {/* Auto Link Button */}
                            <button
                                onClick={() => setAutoLinkerOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 transition-all shadow-sm"
                            >
                                <Activity size={14} />
                                Vínculo Inteligente
                            </button>

                            {/* Create Process Button */}
                            <button
                                onClick={() => setLinkModalOpen(true)}
                                disabled={selectedItemIds.size === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md ${selectedItemIds.size > 0
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                    }`}
                            >
                                <PlusCircle size={14} />
                                Criar Processo ({selectedItemIds.size})
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white border-b border-slate-100">
                                    <th className="px-4 py-3 w-10 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                            checked={paginatedItems.length > 0 && paginatedItems.every(i => selectedItemIds.has(String(i.id)))}
                                            onChange={toggleSelectAllPage}
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('numeroItem')}>
                                        <div className="flex items-center gap-2">ITEM PCA {getSortIcon('numeroItem')}</div>
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('titulo')}>
                                        <div className="flex items-center gap-2">Descrição {getSortIcon('titulo')}</div>
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Grupo / Classe
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('quantidade')}>
                                        <div className="flex items-center justify-center gap-2">Qtd. {getSortIcon('quantidade')}</div>
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('valorUnitario')}>
                                        <div className="flex items-center justify-end gap-2">V. Unitário {getSortIcon('valorUnitario')}</div>
                                    </th>
                                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => handleSort('valor')}>
                                        <div className="flex items-center justify-end gap-2">V. Total {getSortIcon('valor')}</div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {paginatedItems.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-8 text-center text-xs text-slate-400 font-bold">Nenhum item pendente encontrado.</td></tr>
                                ) : (
                                    paginatedItems.map((item) => {
                                        const isSelected = selectedItemIds.has(String(item.id));
                                        return (
                                            <tr key={item.id} className={`transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`} onClick={() => setViewingItem(item)}>
                                                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelection(String(item.id))}
                                                    />
                                                </td>
                                                <td className="px-4 py-4 text-center text-[11px] font-black text-blue-600 font-mono">
                                                    {item.numeroItem || '-'}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex flex-col max-w-[300px]">
                                                        <span className="text-[11px] font-bold text-slate-800 uppercase leading-tight" title={item.titulo}>{item.titulo}</span>
                                                        {item.ifc && (
                                                            <span className="text-[9px] text-blue-500 font-black mt-0.5">IFC: {item.ifc}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase leading-tight block max-w-[200px]">
                                                        {item.classificacaoSuperiorCodigo ? `${item.classificacaoSuperiorCodigo} - ${item.classificacaoSuperiorNome}` : '---'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center text-[11px] font-black text-slate-700">
                                                    {item.quantidade}
                                                </td>
                                                <td className="px-4 py-4 text-right text-[11px] font-black text-slate-700 tabular-nums">
                                                    {formatCurrency(item.valorUnitario || 0)}
                                                </td>
                                                <td className="px-4 py-4 text-right text-[11px] font-black text-blue-600 tabular-nums">
                                                    {formatCurrency(item.valor)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500">
                                Página {currentPage} de {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Anterior
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    Próxima
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Auto Linker Modal */}
            {autoLinkerOpen && (
                <ProcessAutoLinker
                    pcaItems={data}
                    onClose={() => setAutoLinkerOpen(false)}
                    onSuccess={() => window.location.reload()}
                />
            )}

            {/* Modal de Vínculo (Agora "Criar Processo") */}
            {linkModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden font-sans">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-sm font-black text-slate-800">Criar Processo Administrativo</h3>
                            <button onClick={() => setLinkModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={18} /></button>
                        </div>
                        <div className="p-6">
                            <p className="text-xs text-slate-500 mb-6">
                                Você selecionou <strong>{selectedItemIds.size} itens</strong>.
                                Informe o número do processo administrativo para vincular esses itens e iniciar o acompanhamento.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Número do Processo (SIPAC)</label>
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
                                onClick={handleLinkProcess}
                                disabled={!sipacProtocolInput || isLinking}
                                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
                            >
                                {isLinking ? 'Autuando...' : 'Confirmar e Autuar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Detalhes do Item PCA */}
            {viewingItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 sticky top-0 z-10">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Detalhes do Item do PCA</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    {viewingItem.identificadorFuturaContratacao || viewingItem.codigoItem}
                                </p>
                            </div>
                            <button onClick={() => setViewingItem(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">IFC</label>
                                    <p className="text-sm font-bold text-slate-700">{viewingItem.identificadorFuturaContratacao || '-'}</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Categoria</label>
                                    <p className="text-sm font-bold text-slate-700">{viewingItem.categoria}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Descrição</label>
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">{viewingItem.titulo || viewingItem.descricaoDetalhada}</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantidade</label>
                                    <p className="text-sm font-bold text-slate-700">{viewingItem.quantidade || '-'}</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Unit.</label>
                                    <p className="text-sm font-bold text-slate-700">{formatCurrency(viewingItem.valorUnitario || 0)}</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Total</label>
                                    <p className="text-sm font-bold text-blue-600">{formatCurrency(viewingItem.valor)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Previsão de Início</label>
                                    <p className="text-sm font-medium text-slate-600">
                                        {viewingItem.inicio ? new Date(viewingItem.inicio).toLocaleDateString('pt-BR') : '-'}
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Previsão de Término</label>
                                    <p className="text-sm font-medium text-slate-600">
                                        {viewingItem.fim ? new Date(viewingItem.fim).toLocaleDateString('pt-BR') : '-'}
                                    </p>
                                </div>
                            </div>

                            {viewingItem.unidadeRequisitante && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unidade Requisitante</label>
                                    <p className="text-sm font-medium text-slate-600">{viewingItem.unidadeRequisitante}</p>
                                </div>
                            )}

                            {viewingItem.grupoContratacao && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Grupo de Contratação</label>
                                    <p className="text-sm font-medium text-slate-600">{viewingItem.grupoContratacao}</p>
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setViewingItem(null)}
                                className="px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-700 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcessDashboard;
