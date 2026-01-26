
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    Building2,
    RefreshCw,
    Search,
    Package,
    DollarSign,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    Target,
    BarChart3,
    CalendarIcon,
    ArrowUpRight,
    ArrowRightLeft,
    Table as TableIcon,
    Wallet,
    Calendar,
    TrendingUp,
    LayoutDashboard
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchPcaData } from '../services/pcaService';
import { fetchBudgetTransparencyData } from '../services/budgetService';
import {
    ContractItem,
    SummaryData,
    Category,
    BudgetElement,
    BudgetRecord,
    BudgetType
} from '../types';
import {
    CNPJ_IFES_BSF,
    PCA_YEARS_MAP,
    DEFAULT_YEAR,
    FALLBACK_DATA,
} from '../constants';
import {
    formatCurrency,
    formatDate
} from '../utils/formatters';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

// Components
import ContractTable from './ContractTable';
import logoIfes from '../logo-ifes.png';

const PublicDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'pca' | 'budget'>('pca');
    const [viewMode, setViewMode] = useState<'charts' | 'table'>('charts');
    const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_YEAR);
    const [pcaLoading, setPcaLoading] = useState<boolean>(true);
    const [budgetLoading, setBudgetLoading] = useState<boolean>(true);

    // PCA Data
    const [pcaData, setPcaData] = useState<ContractItem[]>([]);
    const [pcaMeta, setPcaMeta] = useState<{ id: string, dataPublicacao: string } | null>(null);

    // Budget Data
    const [elements, setElements] = useState<BudgetElement[]>([]);
    const [records, setRecords] = useState<BudgetRecord[]>([]);

    const [searchTerm, setSearchTerm] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [syncProgress, setSyncProgress] = useState<number>(0);
    const [monthlyViewBudget, setMonthlyViewBudget] = useState<boolean>(false);
    const itemsPerPage = 10;

    const loadPcaData = useCallback(async (year: string) => {
        if (pcaData.length > 0 && pcaData[0].ano === year) return;

        setPcaLoading(true);
        setSyncProgress(0);
        try {
            // Fetch PCA (skipSync to avoid local proxy for public users)
            const pcaResult = await fetchPcaData(year, false, true, (p) => setSyncProgress(p));
            setPcaData(pcaResult.data);
            setPcaMeta(pcaResult.pcaMeta);
        } catch (err) {
            console.error("Erro ao carregar dados do PCA:", err);
        } finally {
            setPcaLoading(false);
            setSyncProgress(100);
        }
    }, []);

    const loadBudgetData = useCallback(async (year: string) => {
        setBudgetLoading(true);
        try {
            const budgetResult = await fetchBudgetTransparencyData(year);
            setElements(budgetResult.elements);
            setRecords(budgetResult.records);
        } catch (err) {
            console.error("Erro ao carregar dados do orçamento:", err);
        } finally {
            setBudgetLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'pca') {
            loadPcaData(selectedYear);
        } else {
            loadBudgetData(selectedYear);
        }
    }, [selectedYear, activeTab, loadPcaData, loadBudgetData]);

    // --- PCA Calculations ---
    const processedPcaData = useMemo(() => {
        const totalVal = pcaData.reduce((acc, i) => acc + i.valor, 0);
        const sorted = [...pcaData].sort((a, b) => b.valor - a.valor);
        let runningSum = 0;

        return sorted.map(item => {
            runningSum += item.valor;
            const ratio = runningSum / (totalVal || 1);
            let abc: 'A' | 'B' | 'C' = 'C';
            if (ratio <= 0.8) abc = 'A';
            else if (ratio <= 0.95) abc = 'B';
            return { ...item, abcClass: abc };
        });
    }, [pcaData]);

    const pcaSummary = useMemo<SummaryData>(() => {
        const materials = processedPcaData.filter(i => i.categoria === Category.Bens);
        const services = processedPcaData.filter(i => i.categoria === Category.Servicos);
        const tic = processedPcaData.filter(i => i.categoria === Category.TIC);
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return {
            totalValue: processedPcaData.reduce((acc, i) => acc + i.valor, 0),
            totalItems: processedPcaData.length,
            materials: { qtd: materials.length, val: materials.reduce((acc, i) => acc + i.valor, 0) },
            tic: { qtd: tic.length, val: tic.reduce((acc, i) => acc + i.valor, 0) },
            services: { qtd: services.length, val: services.reduce((acc, i) => acc + i.valor, 0) },
            obras: { qtd: 0, val: 0 },
            totalExecutado: processedPcaData.reduce((acc, i) => acc + (i.valorExecutado || 0), 0),
            monthlyPlan: months.map((m, idx) => ({
                month: m,
                value: processedPcaData.filter(i => new Date(i.inicio).getMonth() === idx).reduce((acc, i) => acc + i.valor, 0)
            }))
        };
    }, [processedPcaData]);

    const pcaChartData = useMemo(() => [
        { name: 'Bens', value: pcaSummary.materials.val, fill: '#10b981' },
        { name: 'Serviços', value: pcaSummary.services.val, fill: '#f59e0b' },
        { name: 'TIC', value: pcaSummary.tic.val, fill: '#3b82f6' }
    ], [pcaSummary]);

    // --- Budget Calculations ---
    const budgetTotals = useMemo(() => {
        const empenhado = records.reduce((acc, r) => acc + (r.empenhado || 0), 0);
        const executadoRP = records.reduce((acc, r) => acc + (r.executadoRP || 0), 0);
        const executado = records.reduce((acc, r) => acc + (r.executado || 0), 0);
        return { empenhado, executadoRP, executado, final: executadoRP + executado };
    }, [records]);

    const budgetChartData = useMemo(() => {
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return months.map((m, idx) => {
            const mNum = idx + 1;
            const mRecords = records.filter(r => r.mes === mNum);
            return {
                name: m,
                empenhado: mRecords.reduce((acc, r) => acc + (r.empenhado || 0), 0),
                executado: mRecords.reduce((acc, r) => acc + (r.executado || 0) + (r.executadoRP || 0), 0)
            };
        });
    }, [records]);

    // --- Filters ---
    const filteredPcaData = useMemo(() => {
        let result = [...processedPcaData];
        if (selectedCategory !== 'Todas') result = result.filter(item => item.categoria === selectedCategory);
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            result = result.filter(item => item.titulo.toLowerCase().includes(low) || item.area.toLowerCase().includes(low));
        }
        return result;
    }, [processedPcaData, searchTerm, selectedCategory]);

    const pagedPcaData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredPcaData.slice(start, start + itemsPerPage);
    }, [filteredPcaData, currentPage]);

    const totalPages = Math.ceil(filteredPcaData.length / itemsPerPage);

    return (
        <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative font-sans">
            {/* Loading Overlay */}
            {((activeTab === 'pca' && pcaLoading) || (activeTab === 'budget' && budgetLoading)) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="flex flex-col items-center gap-8 max-w-sm w-full px-8">
                        {/* Circular Progress */}
                        <div className="relative flex items-center justify-center">
                            <svg className="w-32 h-32 -rotate-90">
                                <circle
                                    cx="64" cy="64" r="58"
                                    stroke="currentColor" strokeWidth="6" fill="transparent"
                                    className="text-slate-100"
                                />
                                <circle
                                    cx="64" cy="64" r="58"
                                    stroke="currentColor" strokeWidth="6" fill="transparent"
                                    strokeDasharray={2 * Math.PI * 58}
                                    strokeDashoffset={2 * Math.PI * 58 * (1 - syncProgress / 100)}
                                    strokeLinecap="round"
                                    className="text-ifes-green transition-all duration-500 ease-out"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-2xl font-black text-slate-800 tracking-tighter">{Math.round(syncProgress)}%</span>
                                <span className="text-[10px] font-black text-slate-400 uppercase">Status</span>
                            </div>
                        </div>

                        {/* Text Status */}
                        <div className="flex flex-col items-center text-center gap-2">
                            <div className="flex items-center gap-2 text-ifes-green">
                                <RefreshCw size={14} className="animate-spin" />
                                <span className="text-xs font-black uppercase tracking-widest">Portal Transparência</span>
                            </div>
                            <p className="text-sm font-bold text-slate-600 leading-tight">
                                {activeTab === 'pca' ? (
                                    syncProgress < 15 ? 'Conectando ao banco de dados...' :
                                        syncProgress < 80 ? 'Sincronizando registros oficiais...' :
                                            syncProgress < 95 ? 'Montando visualizações...' : 'Pronto!'
                                ) : 'Carregando dados orçamentários...'}
                            </p>

                            {/* Linear Progress Background bar */}
                            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-4">
                                <div
                                    className="h-full bg-ifes-green transition-all duration-500 ease-out"
                                    style={{ width: `${syncProgress}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
                            <img src={logoIfes} alt="Logo IFES" className="h-12 sm:h-16 w-auto object-contain" />
                            <div className="flex flex-col border-l border-slate-100 pl-3 sm:pl-4">
                                <span className="text-sm sm:text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Portal de Transparência</span>
                                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Campus Barra de São Francisco</span>
                            </div>
                        </div>

                        <div className="border-l border-slate-100 pl-3 sm:pl-6 ml-0 sm:ml-6">
                            <div className="flex flex-col">
                                <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ano Ref.</span>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="bg-ifes-green/5 text-ifes-green border border-ifes-green/20 rounded-md px-3 py-1 text-sm font-black outline-none focus:ring-2 focus:ring-ifes-green/40 transition-all cursor-pointer"
                                >
                                    {Object.keys(PCA_YEARS_MAP).sort((a, b) => b.localeCompare(a)).map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="hidden md:flex flex-col items-end text-right">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Painel de Controle Social</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-bold text-ifes-green">Dados em Tempo Real</span>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="bg-slate-50 border-b border-slate-200">
                    <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
                        <div className="flex gap-8">
                            <button
                                onClick={() => setActiveTab('pca')}
                                className={`h-14 flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'pca' ? 'border-ifes-green text-ifes-green' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                <Package size={16} />
                                Planejamento (PCA)
                            </button>
                            <button
                                onClick={() => setActiveTab('budget')}
                                className={`h-14 flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'budget' ? 'border-ifes-green text-ifes-green' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                            >
                                <Wallet size={16} />
                                Execução Orçamentária
                            </button>
                        </div>

                        {/* View Toggle */}
                        <div className="flex bg-slate-200/50 p-1 rounded-xl">
                            <button
                                onClick={() => setViewMode('charts')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'charts' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <BarChart3 size={14} />
                                Gráficos
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <TableIcon size={14} />
                                Detalhamento
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                {activeTab === 'pca' ? (
                    <>
                        <section className="bg-white border-l-4 border-ifes-green p-6 rounded-2xl shadow-sm space-y-1">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Plano de Contratações Anual {selectedYear}</h1>
                            <p className="text-sm text-slate-500 font-medium italic">Base oficial do PNCP - Monitoramento de demandas institucionais.</p>
                        </section>

                        {viewMode === 'charts' ? (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* PCA KPIs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Planejado para {selectedYear}</p>
                                                <h3 className="text-3xl font-black text-slate-900">{formatCurrency(pcaSummary.totalValue)}</h3>
                                            </div>
                                            <div className="bg-ifes-green/10 p-2 rounded-lg text-ifes-green">
                                                <Target size={20} />
                                            </div>
                                        </div>
                                        <div className="mt-6">
                                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                                                <span>Progresso de Execução Física</span>
                                                <span>{((pcaSummary.totalExecutado / (pcaSummary.totalValue || 1)) * 100).toFixed(1)}%</span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-ifes-green w-0 transition-all duration-1000" style={{ width: `${(pcaSummary.totalExecutado / (pcaSummary.totalValue || 1)) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Itens em Processamento</p>
                                                <h3 className="text-3xl font-black text-slate-900">{pcaSummary.totalItems} Processos</h3>
                                            </div>
                                            <div className="bg-emerald-50 p-2 rounded-lg text-emerald-500">
                                                <Package size={20} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 mt-6">
                                            <div className="bg-emerald-50 p-2 rounded-lg text-center">
                                                <span className="block text-[8px] font-black text-emerald-700 uppercase leading-tight">Bens</span>
                                                <span className="text-xs font-black text-emerald-600">{pcaSummary.materials.qtd}</span>
                                            </div>
                                            <div className="bg-amber-50 p-2 rounded-lg text-center">
                                                <span className="block text-[8px] font-black text-amber-700 uppercase leading-tight">Serv.</span>
                                                <span className="text-xs font-black text-amber-600">{pcaSummary.services.qtd}</span>
                                            </div>
                                            <div className="bg-blue-50 p-2 rounded-lg text-center">
                                                <span className="block text-[8px] font-black text-blue-700 uppercase leading-tight">TIC</span>
                                                <span className="text-xs font-black text-blue-600">{pcaSummary.tic.qtd}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* PCA Charts */}
                                <div className="grid lg:grid-cols-2 gap-8">
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                        <h3 className="text-lg font-black text-slate-800 mb-6">Distribuição por Categoria</h3>
                                        <div className="h-72 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={pcaChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" stroke="none">
                                                        {pcaChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} cornerRadius={4} />)}
                                                    </Pie>
                                                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex gap-4 justify-center mt-4">
                                            {pcaChartData.map(c => (
                                                <div key={c.name} className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.fill }}></div>
                                                    <span className="text-[10px] font-black text-slate-400 uppercase">{c.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                        <h3 className="text-lg font-black text-slate-800 mb-6 font-sans">Cronograma de Contratações</h3>
                                        <div className="h-72 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={pcaSummary.monthlyPlan}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                                    <YAxis hide />
                                                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                                    <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} barSize={24} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* PCA Table */
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-300">
                                <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 bg-slate-50/30">
                                    <div className="relative w-full max-w-md">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Buscar item do planejamento..."
                                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none"
                                            value={searchTerm}
                                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                        />
                                    </div>
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 outline-none"
                                    >
                                        <option value="Todas">Todas Categorias</option>
                                        <option value={Category.Bens}>Bens</option>
                                        <option value={Category.Servicos}>Serviços</option>
                                        <option value={Category.TIC}>TIC</option>
                                    </select>
                                </div>

                                <ContractTable data={pagedPcaData} loading={pcaLoading} isPublic={true} onSort={() => { }} sortConfig={{ key: 'valor', direction: 'desc' }} />

                                {totalPages > 1 && (
                                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-400 capitalize">Página {currentPage} de {totalPages}</span>
                                        <div className="flex gap-2">
                                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronLeft size={16} /></button>
                                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronRight size={16} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    /* BUDGET TAB */
                    <>
                        <section className="bg-white border-l-4 border-blue-500 p-6 rounded-2xl shadow-sm space-y-1">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Execução Orçamentária {selectedYear}</h1>
                            <p className="text-sm text-slate-500 font-medium italic">Saldos, empenhos e cronograma financeiro institucional.</p>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-in fade-in duration-500">
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empenhado Acumulado</p>
                                <h3 className="text-2xl font-black text-slate-900">{formatCurrency(budgetTotals.empenhado)}</h3>
                                <div className="mt-2 flex items-center gap-1 text-blue-500">
                                    <ArrowUpRight size={14} />
                                    <span className="text-[10px] font-bold">Valores Registrados</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Restos a Pagar (RP)</p>
                                <h3 className="text-2xl font-black text-slate-900">{formatCurrency(budgetTotals.executadoRP)}</h3>
                                <div className="mt-2 flex items-center gap-1 text-amber-500">
                                    <Calendar size={14} />
                                    <span className="text-[10px] font-bold">Saldo de Exercícios Ant.</span>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Executado no Exercício</p>
                                <h3 className="text-2xl font-black text-slate-900">{formatCurrency(budgetTotals.executado)}</h3>
                                <div className="mt-2 flex items-center gap-1 text-emerald-500">
                                    <TrendingUp size={14} />
                                    <span className="text-[10px] font-bold">Pagamentos Efetuados</span>
                                </div>
                            </div>
                            <div className="bg-blue-600 p-6 rounded-2xl shadow-lg shadow-blue-200">
                                <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1">Liquidado Final</p>
                                <h3 className="text-2xl font-black text-white">{formatCurrency(budgetTotals.final)}</h3>
                                <div className="mt-2 flex items-center gap-1 text-white/80">
                                    <DollarSign size={14} />
                                    <span className="text-[10px] font-bold">Total Pago Geral</span>
                                </div>
                            </div>
                        </div>

                        {viewMode === 'charts' ? (
                            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in duration-500">
                                <h3 className="text-xl font-black text-slate-800 mb-8">Cronograma Financeiro Mensal</h3>
                                <div className="h-96 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={budgetChartData} barGap={8}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} tickFormatter={(v) => `R$${v / 1000}k`} />
                                            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                            <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                                            <Bar dataKey="empenhado" name="Empenhado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="executado" name="Liquidado/Pago" fill="#10b981" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ) : (
                            /* Budget Table */
                            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500 flex flex-col">
                                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Detalhamento por Elemento de Despesa</h3>

                                    <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                                        <button
                                            onClick={() => setMonthlyViewBudget(false)}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${!monthlyViewBudget ? 'bg-ifes-green shadow-sm text-white' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <TableIcon size={14} />
                                            Geral
                                        </button>
                                        <button
                                            onClick={() => setMonthlyViewBudget(true)}
                                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${monthlyViewBudget ? 'bg-ifes-green shadow-sm text-white' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <CalendarIcon size={14} />
                                            Mensal
                                        </button>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    {!monthlyViewBudget ? (
                                        <table className="w-full text-left min-w-[800px]">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Elemento</th>
                                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipo</th>
                                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Empenhado</th>
                                                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Liquidado</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {elements.map(el => {
                                                    const elRecords = records.filter(r => r.elementId === el.id);
                                                    const empVal = elRecords.reduce((acc, r) => acc + (r.empenhado || 0), 0);
                                                    const exeVal = elRecords.reduce((acc, r) => acc + (r.executado || 0) + (r.executadoRP || 0), 0);
                                                    return (
                                                        <tr key={el.id} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-8 py-5 text-sm font-bold text-slate-800">{el.nome}</td>
                                                            <td className="px-8 py-5">
                                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${el.tipo === BudgetType.Custeio ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                    {el.tipo}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-5 text-right text-sm font-bold text-slate-600">{formatCurrency(empVal)}</td>
                                                            <td className="px-8 py-5 text-right text-sm font-black text-emerald-600">{formatCurrency(exeVal)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <table className="w-full text-left border-collapse min-w-[1200px]">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase sticky left-0 bg-slate-50 z-10 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-100">Elemento</th>
                                                    {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map(m => (
                                                        <th key={m} className="px-2 py-4 text-[9px] font-black text-slate-400 uppercase text-center">{m}</th>
                                                    ))}
                                                    <th className="px-6 py-4 text-[10px] font-black text-slate-900 uppercase text-right border-l border-slate-200">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {elements.map(el => {
                                                    const elRecords = records.filter(r => r.elementId === el.id);
                                                    const total = elRecords.reduce((acc, r) => acc + (r.executado || 0) + (r.executadoRP || 0), 0);
                                                    return (
                                                        <tr key={el.id} className="hover:bg-slate-50/50 transition-colors group">
                                                            <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-50">
                                                                <span className="text-[11px] font-black text-slate-700 uppercase truncate block w-52">{el.nome}</span>
                                                                <span className={`text-[8px] font-black uppercase ${el.tipo === BudgetType.Custeio ? 'text-amber-500' : 'text-blue-500'}`}>{el.tipo}</span>
                                                            </td>
                                                            {Array.from({ length: 12 }).map((_, idx) => {
                                                                const mNum = idx + 1;
                                                                const rec = elRecords.find(r => r.mes === mNum);
                                                                const val = (rec?.executado || 0) + (rec?.executadoRP || 0);
                                                                return (
                                                                    <td key={idx} className="px-2 py-4 text-center">
                                                                        <span className={`text-[10px] font-bold ${val > 0 ? 'text-slate-900' : 'text-slate-200'}`}>
                                                                            {val > 0 ? (val / 1000).toFixed(1) + 'k' : '-'}
                                                                        </span>
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="px-6 py-4 text-right border-l border-slate-200 bg-slate-50/30">
                                                                <span className="text-xs font-black text-emerald-600">{formatCurrency(total)}</span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Footer Links */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-8 border-t border-slate-100">
                    <a href={`https://pncp.gov.br/app/pca/${CNPJ_IFES_BSF}/${selectedYear}/${PCA_YEARS_MAP[selectedYear]}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-3xl hover:border-ifes-green transition-all group shadow-sm hover:shadow-md">
                        <div className="flex items-center gap-4">
                            <div className="bg-ifes-green/10 p-3 rounded-2xl text-ifes-green transition-colors group-hover:bg-ifes-green group-hover:text-white">
                                <ExternalLink size={20} />
                            </div>
                            <div>
                                <span className="block font-black text-slate-800 tracking-tight">Portal PNCP Oficial</span>
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Base de Dados do Governo Federal</span>
                            </div>
                        </div>
                    </a>
                    <a href="https://saofrancisco.ifes.edu.br" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-6 bg-white border border-slate-200 rounded-3xl hover:border-emerald-400 transition-all group shadow-sm hover:shadow-md">
                        <div className="flex items-center gap-4">
                            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                                <Building2 size={20} />
                            </div>
                            <div>
                                <span className="block font-black text-slate-800 tracking-tight">Site Institucional</span>
                                <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Ifes Campus Barra de São Francisco</span>
                            </div>
                        </div>
                    </a>
                </section>
            </main>
        </div>
    );
};

export default PublicDashboard;
