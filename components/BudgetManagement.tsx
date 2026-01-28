import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Save,
    Trash2,
    X,
    Wallet,
    TrendingUp,
    PieChart as PieChartIcon,
    LayoutDashboard,
    Calendar,
    DollarSign,
    ArrowUpRight,
    ArrowDownRight,
    ArrowRightLeft,
    Search,
    ArrowUp,
    ArrowDown,
    RefreshCw,
    Edit2,
    Download,
    Table as TableIcon,
    Calendar as CalendarIcon
} from 'lucide-react';
import { db } from '../firebase';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    updateDoc,
    addDoc,
    deleteDoc,
    Timestamp,
    orderBy,
    onSnapshot,
    writeBatch
} from 'firebase/firestore';
import { BudgetElement, BudgetRecord, BudgetType } from '../types';
import { DEFAULT_YEAR, PCA_YEARS_MAP } from '../constants';
import { formatCurrency } from '../utils/formatters';
import logoIfes from '../logo-ifes.png';

const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const BudgetManagement: React.FC = () => {
    const navigate = useNavigate();
    const [elements, setElements] = useState<BudgetElement[]>([]);
    const [records, setRecords] = useState<BudgetRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_YEAR);
    const [isElementModalOpen, setIsElementModalOpen] = useState(false);
    const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'monthly'>('list');
    const [typeFilter, setTypeFilter] = useState<'Todos' | BudgetType>('Todos');

    // List Controls
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'nome',
        direction: 'asc'
    });
    const itemsPerPage = 12;

    // Monthly View Controls
    const [gridFilter, setGridFilter] = useState<'todos' | 'empenhado' | 'executadoRP' | 'executado'>('todos');

    // Form states
    const [newElementName, setNewElementName] = useState('');
    const [newElementType, setNewElementType] = useState<BudgetType>(BudgetType.Custeio);
    const [editingElement, setEditingElement] = useState<BudgetElement | null>(null);

    // Record editing state
    const [selectedRecordElement, setSelectedRecordElement] = useState<BudgetElement | null>(null);
    const [editMonth, setEditMonth] = useState<number>(1);
    const [monthlyRecords, setMonthlyRecords] = useState<Record<number, Partial<BudgetRecord>>>({});

    useEffect(() => {
        setLoading(true);
        const yearNum = Number(selectedYear);

        const qElements = query(collection(db, "budget_elements"), where("ano", "==", yearNum));
        const qRecords = query(collection(db, "budget_records"), where("ano", "==", yearNum));

        const unsubElements = onSnapshot(qElements, (snapshot) => {
            setElements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetElement)));
            setLoading(false);
        }, (err) => {
            console.error("Erro listener elementos:", err);
            setLoading(false);
        });

        const unsubRecords = onSnapshot(qRecords, (snapshot) => {
            setRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetRecord)));
        }, (err) => {
            console.error("Erro listener registros:", err);
        });

        return () => {
            unsubElements();
            unsubRecords();
        };
    }, [selectedYear]);

    const handleOpenEditElementModal = (el: BudgetElement) => {
        setEditingElement(el);
        setNewElementName(el.nome);
        setNewElementType(el.tipo);
        setIsElementModalOpen(true);
    };

    const handleSaveElement = async () => {
        if (!newElementName.trim()) return;
        setSaving(true);
        try {
            if (editingElement) {
                await updateDoc(doc(db, "budget_elements", editingElement.id), {
                    nome: newElementName,
                    tipo: newElementType,
                    updatedAt: Timestamp.now()
                });
            } else {
                await addDoc(collection(db, "budget_elements"), {
                    nome: newElementName,
                    tipo: newElementType,
                    ano: Number(selectedYear),
                    createdAt: Timestamp.now()
                });
            }
            setNewElementName('');
            setEditingElement(null);
            setIsElementModalOpen(false);
        } catch (err) {
            console.error("Erro ao salvar elemento:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleOpenRecordModal = (element: BudgetElement, month?: number) => {
        setSelectedRecordElement(element);
        setEditMonth(month || 1);
        const existing = records.filter(r => r.elementId === element.id);
        const recordsMap: Record<number, Partial<BudgetRecord>> = {};

        for (let m = 1; m <= 12; m++) {
            const record = existing.find(r => r.mes === m);
            if (record) {
                recordsMap[m] = { ...record };
            } else {
                recordsMap[m] = {
                    mes: m,
                    empenhado: 0,
                    executadoRP: 0,
                    executado: 0,
                    elementId: element.id,
                    ano: Number(selectedYear)
                };
            }
        }
        setMonthlyRecords(recordsMap);
        setIsRecordModalOpen(true);
    };

    const handleSaveRecords = async () => {
        if (!selectedRecordElement) return;
        setSaving(true);
        // Fechar modal imediatamente para sensação de velocidade (Optimistic UI)
        setIsRecordModalOpen(false);
        try {
            const batch = writeBatch(db);

            Object.entries(monthlyRecords).forEach(([mes, record]) => {
                const docId = `${selectedYear}-${selectedRecordElement.id}-${mes}`;
                const docRef = doc(db, "budget_records", docId);
                const recordData = { ...(record as any) };
                if ('id' in recordData) delete (recordData as any).id;

                batch.set(docRef, {
                    ...recordData,
                    elementId: selectedRecordElement.id,
                    ano: Number(selectedYear),
                    mes: Number(mes),
                    updatedAt: Timestamp.now()
                }, { merge: true });
            });

            await batch.commit();
            console.log("[Budget] Registros salvos em lote com sucesso.");
        } catch (err) {
            console.error("Erro ao salvar registros:", err);
            alert("Erro ao salvar dados. Por favor, tente novamente.");
            // Se falhar, talvez queira reabrir ou avisar
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteElement = async (id: string) => {
        if (!window.confirm("Isso excluirá o elemento e todos os seus registros mensais. Continuar?")) return;
        try {
            await deleteDoc(doc(db, "budget_elements", id));
            const q = query(collection(db, "budget_records"), where("elementId", "==", id));
            const snap = await getDocs(q);
            const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(deletePromises);
        } catch (err) {
            console.error("Erro ao excluir elemento:", err);
        }
    };

    const importStandardList = async () => {
        if (!window.confirm("Isso importará a lista padrão para o ano " + selectedYear + ". Continuar?")) return;
        setSaving(true);
        const list = [
            { nome: 'Serviços de coffee break', tipo: BudgetType.Custeio },
            { nome: 'Suprimento de fundos (serviços)', tipo: BudgetType.Custeio },
            { nome: 'Suprimento de fundos (materiais)', tipo: BudgetType.Custeio },
            { nome: 'Serviço de apoio administrativo', tipo: BudgetType.Custeio },
            { nome: 'Diárias nacionais e internacionais para servidores', tipo: BudgetType.Custeio },
            { nome: 'Diárias para colaboradores eventuais', tipo: BudgetType.Custeio },
            { nome: 'Ressarcimento de valores', tipo: BudgetType.Custeio },
            { nome: 'Serviços de manutenção corretiva na rede de energia elétrica', tipo: BudgetType.Custeio },
            { nome: 'Aquisição de materiais de tecnologia da informação', tipo: BudgetType.Custeio },
            { nome: 'Aquisição de insumos materiais para manutenção e conservação de bens móveis e imóveis', tipo: BudgetType.Custeio },
            { nome: 'Serviços de agenciamento de estágio', tipo: BudgetType.Custeio },
            { nome: 'Serviço de vigilância patrimonial armada', tipo: BudgetType.Custeio },
            { nome: 'Serviço de gestão de frota de veículos oficiais', tipo: BudgetType.Custeio },
            { nome: 'Taxa Corpo de Bombeiros Militar', tipo: BudgetType.Custeio },
            { nome: 'Taxa CRQ - 21 região', tipo: BudgetType.Custeio },
            { nome: 'Taxa CRA-ES', tipo: BudgetType.Custeio },
            { nome: 'Taxa - SEFAZ - licenciamento dos veículos oficiais', tipo: BudgetType.Custeio },
            { nome: 'Serviço de outsourcing de impressão', tipo: BudgetType.Custeio },
            { nome: 'Pagamento de juros e multas', tipo: BudgetType.Custeio },
            { nome: 'Serviços de publicidade legal', tipo: BudgetType.Custeio },
            { nome: 'Serviço de elaboração de projeto executivo para extensão da rede elétrica', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro - ITEC - Argentina, amparado pelo Edital Ifes Arinter nº 01/2026', tipo: BudgetType.Custeio },
            { nome: 'Serviço de atendimento a pessoas com necessidades específicas', tipo: BudgetType.Custeio },
            { nome: 'Assistência estudantil - Ifes', tipo: BudgetType.Custeio },
            { nome: 'Ajuda de custo pessoal civil', tipo: BudgetType.Custeio },
            { nome: 'Manutenção e conservação de máquinas e equipamentos de ar condicionado', tipo: BudgetType.Custeio },
            { nome: 'Serviço de abastecimento de água e esgoto - Cesan', tipo: BudgetType.Custeio },
            { nome: 'Serviço de fornecimento de energia elétrica - EDP', tipo: BudgetType.Custeio },
            { nome: 'Serviços de limpeza e conservação - Corese', tipo: BudgetType.Custeio },
            { nome: 'Ajuda de custo aluno inscrição curso - Mini-ONU', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro aos alunos - Jogos Jifes 2026', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro a aluno - participação D XII Sigi - simulação geopolítica do Ifes', tipo: BudgetType.Custeio },
            { nome: 'Serviços de elaboração de laudos técnicos', tipo: BudgetType.Custeio },
            { nome: 'Serviços de agenciamento de viagens - passagens aéreas', tipo: BudgetType.Custeio },
            { nome: 'Serviços de locação de mobiliários', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro - amparado pelo Edital DG nº 10/2026', tipo: BudgetType.Custeio },
            { nome: 'Auxílio apoio financeiro partic. de alunos Mini-ONU amparado pelo Edital DG nº 11/2026-DG', tipo: BudgetType.Custeio },
            { nome: 'Auxílio apoio financeiro aos servidores - amparado pelo Edital DG nº 12/2026', tipo: BudgetType.Custeio },
            { nome: 'Auxílio apoio financeiro ações de ensino - amparado pelo Edital DG nº 19/2026', tipo: BudgetType.Custeio },
            { nome: 'Serviços de paisagismo para a implantação e ornamentação de área verde', tipo: BudgetType.Custeio },
            { nome: 'Serviço de dedetização, desinsetização e desratização', tipo: BudgetType.Custeio },
            { nome: 'Participação no curso de gestão patrimonial - Nacional Treinamentos Ltda', tipo: BudgetType.Custeio },
            { nome: 'Serviços de almoxarifado virtual in company - sob demanda', tipo: BudgetType.Custeio },
            { nome: 'Serviços comuns de engenharia', tipo: BudgetType.Custeio },
            { nome: 'Serviços de confecção de materiais gráficos', tipo: BudgetType.Custeio },
            { nome: 'Serviços de transporte coletivos de passageiros', tipo: BudgetType.Custeio },
            { nome: 'Serviços de seguro de veículos', tipo: BudgetType.Custeio },
            { nome: 'Serviço de radiodifusão - materials de publicidade', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro a realização servidores - QVT, amparado pelo Edital DG nº 17/2026', tipo: BudgetType.Custeio },
            { nome: 'Serviço de emplacamento de veículo - Spin', tipo: BudgetType.Custeio },
            { nome: 'Auxílio financeiro para discente na participação D XII Sigi - simulação geopolítica do Ifes', tipo: BudgetType.Custeio },
            { nome: 'Aquisição de materiais elétricos/eletrônicos', tipo: BudgetType.Custeio },
            { nome: 'Serviços de limpeza de pastagem e abertura de poços', tipo: BudgetType.Custeio },
            { nome: 'Aquisição de containers para lixo', tipo: BudgetType.Custeio },
            { nome: 'Aquisição de materiais de áudio e vídeo', tipo: BudgetType.Custeio },
            // Investimento
            { nome: 'Aquisição de materiais elétricos/eletrônicos', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de equipamentos de laboratório', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de materiais de tecnologia da informação', tipo: BudgetType.Investimento },
            { nome: 'Construção do depósito provisório para guarda de materiais gerais do Ifes Campus BSF', tipo: BudgetType.Investimento },
            { nome: 'Aquisição equipamentos - TIC "computadores"', tipo: BudgetType.Investimento },
            { nome: 'Aquisição projetores', tipo: BudgetType.Investimento },
            { nome: 'Serviços de confecção de materiais gráficos', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de veículos automotivos', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de mobiliários', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de containers de lixo', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de aparelhos de ar condicionado', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de materiais para estruturação da unidade agrícola', tipo: BudgetType.Investimento },
            { nome: 'Aquisição de materiais de áudio e vídeo', tipo: BudgetType.Investimento },
        ];

        try {
            const batch = writeBatch(db);
            list.forEach(item => {
                const newDocRef = doc(collection(db, "budget_elements"));
                batch.set(newDocRef, {
                    ...item,
                    ano: Number(selectedYear),
                    createdAt: Timestamp.now()
                });
            });
            await batch.commit();
            alert("Lista importada com sucesso!");
        } catch (err) {
            console.error("Erro na importação:", err);
            alert("Erro ao importar lista.");
        } finally {
            setSaving(false);
        }
    };

    const totals = useMemo(() => {
        const empenhadoTotal = records.reduce((acc, r) => acc + (r.empenhado || 0), 0);
        const executadoRPTotal = records.reduce((acc, r) => acc + (r.executadoRP || 0), 0);
        const executadoTotal = records.reduce((acc, r) => acc + (r.executado || 0), 0);

        return {
            empenhado: empenhadoTotal,
            executadoRP: executadoRPTotal,
            executado: executadoTotal,
            finalTotal: executadoRPTotal + executadoTotal
        };
    }, [records]);

    const getElementTotals = useCallback((elementId: string) => {
        const elementRecords = records.filter(r => r.elementId === elementId);
        return {
            empenhado: elementRecords.reduce((acc, r) => acc + (r.empenhado || 0), 0),
            executadoRP: elementRecords.reduce((acc, r) => acc + (r.executadoRP || 0), 0),
            executado: elementRecords.reduce((acc, r) => acc + (r.executado || 0), 0),
        };
    }, [records]);

    const processedElements = useMemo(() => {
        // 1. Filter
        let result = elements.filter(el => {
            const matchesSearch = el.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                el.tipo.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = typeFilter === 'Todos' || el.tipo === typeFilter;
            return matchesSearch && matchesType;
        });

        // 2. Sort
        result.sort((a, b) => {
            let valA: any, valB: any;

            if (sortConfig.key === 'empenhado') {
                const totA = getElementTotals(a.id);
                const totB = getElementTotals(b.id);
                valA = totA.empenhado;
                valB = totB.empenhado;
            } else if (sortConfig.key === 'executado') {
                const totA = getElementTotals(a.id);
                const totB = getElementTotals(b.id);
                valA = totA.executado + totA.executadoRP;
                valB = totB.executado + totB.executadoRP;
            } else {
                valA = (a as any)[sortConfig.key];
                valB = (b as any)[sortConfig.key];
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [elements, searchTerm, sortConfig, getElementTotals, typeFilter]);

    const pagedElements = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return processedElements.slice(start, start + itemsPerPage);
    }, [processedElements, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(processedElements.length / itemsPerPage);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    return (
        <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative font-sans text-slate-800">
            {/* Loading Indicator */}
            {(loading || saving) && (
                <div className="fixed bottom-6 right-6 z-[100] bg-white px-4 py-2 rounded-full shadow-lg border border-ifes-green/20 flex items-center gap-2 animate-in slide-in-from-bottom duration-300">
                    <RefreshCw size={14} className="text-ifes-green animate-spin" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        {saving ? 'Gravando Alterações...' : 'Atualizando Orçamento...'}
                    </span>
                </div>
            )}

            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className={`${viewMode === 'monthly' || viewMode === 'list' ? 'max-w-[98%]' : 'max-w-7xl'} mx-auto px-4 h-24 flex items-center justify-between gap-4 transition-all duration-500`}>
                    <div className="flex items-center gap-3 shrink-0">
                        <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain" />
                        <div className="flex flex-col border-l border-slate-100 pl-3">
                            <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Gestão Orçamentária</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Admin Campus BSF</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ano Ref.</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="bg-ifes-green/5 text-ifes-green border border-ifes-green/20 rounded-md px-3 py-1 text-sm font-black outline-none focus:ring-2 focus:ring-ifes-green/40 transition-all cursor-pointer"
                            >
                                <option value="2026">2026</option>
                            </select>
                        </div>

                        <button
                            onClick={() => navigate('/dashboard')}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
                        >
                            <LayoutDashboard size={18} />
                            <span className="hidden md:inline">Menu Principal</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className={`${viewMode === 'monthly' || viewMode === 'list' ? 'max-w-full px-6' : 'max-w-7xl px-4'} mx-auto py-8 space-y-8 transition-all duration-500`}>
                {/* KPI Cards */}
                <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empenhado Total</p>
                        <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.empenhado)}</h3>
                        <div className="mt-2 flex items-center gap-1 text-blue-500">
                            <ArrowUpRight size={14} />
                            <span className="text-[10px] font-bold">Acumulado {selectedYear}</span>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Restos a Pagar (RP)</p>
                        <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.executadoRP)}</h3>
                        <div className="mt-2 flex items-center gap-1 text-amber-500">
                            <Calendar size={14} />
                            <span className="text-[10px] font-bold">Saldo Antigo</span>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Executado Ano</p>
                        <h3 className="text-2xl font-black text-slate-900">{formatCurrency(totals.executado)}</h3>
                        <div className="mt-2 flex items-center gap-1 text-emerald-500">
                            <TrendingUp size={14} />
                            <span className="text-[10px] font-bold">Liquidado Pago</span>
                        </div>
                    </div>

                    <div className="bg-ifes-green p-6 rounded-2xl shadow-lg shadow-ifes-green/20 text-white">
                        <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mb-1">Pagamento Total</p>
                        <h3 className="text-2xl font-black">{formatCurrency(totals.finalTotal)}</h3>
                        <div className="mt-2 flex items-center gap-1 text-white/80">
                            <DollarSign size={14} />
                            <span className="text-[10px] font-bold">Soma Final</span>
                        </div>
                    </div>
                </section>

                {/* Elements Section */}
                <section className="space-y-6">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                                <Wallet className="text-ifes-green" size={24} />
                                {viewMode === 'list' ? 'Elementos de Despesa' : 'Cronograma Mensal'}
                            </h2>
                            <div className="flex bg-slate-200/50 p-1 rounded-xl">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase ${viewMode === 'list' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <TableIcon size={14} />
                                    <span>Lista</span>
                                </button>
                                <button
                                    onClick={() => setViewMode('monthly')}
                                    className={`p-2 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase ${viewMode === 'monthly' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400 hover:text-slate-600'}`}
                                >
                                    <CalendarIcon size={14} />
                                    <span>Mensal</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 flex-1 max-w-none justify-end">
                            {/* Grid Filter (Monthly only) */}
                            {viewMode === 'monthly' && (
                                <div className="flex bg-slate-200/50 p-1 rounded-xl shrink-0">
                                    <button
                                        onClick={() => setGridFilter('todos')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${gridFilter === 'todos' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setGridFilter('empenhado')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${gridFilter === 'empenhado' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                    >
                                        Empenhado
                                    </button>
                                    <button
                                        onClick={() => setGridFilter('executadoRP')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${gridFilter === 'executadoRP' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                    >
                                        Exec. RP
                                    </button>
                                    <button
                                        onClick={() => setGridFilter('executado')}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${gridFilter === 'executado' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                    >
                                        Exec. Ano
                                    </button>
                                </div>
                            )}

                            {/* Type Filter */}
                            <div className="flex bg-slate-200/50 p-1 rounded-xl shrink-0">
                                <button
                                    onClick={() => setTypeFilter('Todos')}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === 'Todos' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                >
                                    Todos
                                </button>
                                <button
                                    onClick={() => setTypeFilter(BudgetType.Custeio)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === BudgetType.Custeio ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                >
                                    Custeio
                                </button>
                                <button
                                    onClick={() => setTypeFilter(BudgetType.Investimento)}
                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${typeFilter === BudgetType.Investimento ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400'}`}
                                >
                                    Investimento
                                </button>
                            </div>

                            {/* Filter Input */}
                            <div className="relative flex-1 max-w-sm">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-ifes-green transition-all"
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={importStandardList}
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-blue-50 transition-colors border border-slate-200"
                                >
                                    <Download size={16} />
                                    <span className="hidden lg:inline">Importar Padrão</span>
                                </button>
                                <button
                                    onClick={() => setIsElementModalOpen(true)}
                                    className="flex items-center gap-2 bg-ifes-green text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-emerald-600 transition-all shadow-lg"
                                >
                                    <Plus size={16} />
                                    <span>Novo Elemento</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                        {viewMode === 'list' ? (
                            <>
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/30">
                                            <th
                                                className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-ifes-green transition-colors"
                                                onClick={() => handleSort('nome')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Descrição
                                                    {sortConfig.key === 'nome' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </div>
                                            </th>
                                            <th
                                                className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-ifes-green transition-colors"
                                                onClick={() => handleSort('tipo')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Tipo
                                                    {sortConfig.key === 'tipo' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </div>
                                            </th>
                                            <th
                                                className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:text-ifes-green transition-colors"
                                                onClick={() => handleSort('empenhado')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Empenhado
                                                    {sortConfig.key === 'empenhado' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </div>
                                            </th>
                                            <th
                                                className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:text-ifes-green transition-colors"
                                                onClick={() => handleSort('executadoRP')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Executado RP
                                                    {sortConfig.key === 'executadoRP' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </div>
                                            </th>
                                            <th
                                                className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right cursor-pointer hover:text-ifes-green transition-colors"
                                                onClick={() => handleSort('executado')}
                                            >
                                                <div className="flex items-center justify-end gap-2">
                                                    Executado Ano
                                                    {sortConfig.key === 'executado' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </div>
                                            </th>
                                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 text-[10px] sm:text-xs">
                                        {pagedElements.map(el => {
                                            const elTotals = getElementTotals(el.id);
                                            return (
                                                <tr
                                                    key={el.id}
                                                    onClick={() => handleOpenRecordModal(el)}
                                                    className="hover:bg-ifes-green/5 transition-colors group cursor-pointer"
                                                >
                                                    <td className="px-8 py-5">
                                                        <span className="text-sm font-bold text-slate-700">{el.nome}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${el.tipo === BudgetType.Custeio ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                            {el.tipo}
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 text-right font-black text-sm text-slate-900 leading-tight">
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5 lg:hidden">Empenhado</span>
                                                        {formatCurrency(elTotals.empenhado)}
                                                    </td>
                                                    <td className="px-8 py-5 text-right font-black text-sm text-amber-600 leading-tight">
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5 lg:hidden">Exec. RP</span>
                                                        {formatCurrency(elTotals.executadoRP)}
                                                    </td>
                                                    <td className="px-8 py-5 text-right font-black text-sm text-emerald-600 leading-tight">
                                                        <span className="block text-[10px] text-slate-400 font-bold uppercase mb-0.5 lg:hidden">Exec. Ano</span>
                                                        {formatCurrency(elTotals.executado)}
                                                    </td>
                                                    <td className="px-8 py-5" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => handleOpenEditElementModal(el)}
                                                                className="p-2 text-slate-400 hover:text-ifes-green hover:bg-ifes-green/10 rounded-lg transition-all"
                                                                title="Editar Descrição/Tipo"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {processedElements.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-6 py-20 text-center text-slate-300 font-bold text-xs uppercase tracking-widest">
                                                    Nenhum elemento encontrado
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {totalPages > 1 && (
                                    <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                                        <span className="text-[10px] font-black text-slate-400 uppercase">
                                            Mostrando {pagedElements.length} de {processedElements.length} elementos
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(p => p - 1)}
                                                className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
                                            >
                                                <ChevronLeft size={16} />
                                            </button>
                                            <div className="flex items-center gap-1 px-2">
                                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                                    <button
                                                        key={page}
                                                        onClick={() => setCurrentPage(page)}
                                                        className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === page ? 'bg-ifes-green text-white' : 'hover:bg-slate-100 text-slate-400'}`}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                disabled={currentPage === totalPages}
                                                onClick={() => setCurrentPage(p => p + 1)}
                                                className="p-2 border border-slate-200 bg-white rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            /* Monthly Grid View */
                            <table className="w-full text-left border-collapse min-w-[1400px]">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50">
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase sticky left-0 bg-slate-50 z-10 w-72 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-100">Elemento de Despesa</th>
                                        {MONTHS.map(m => (
                                            <th key={m} className="px-2 py-5 text-[9px] font-black text-slate-400 uppercase text-center border-l border-slate-50">{m}</th>
                                        ))}
                                        <th className="px-6 py-5 text-[10px] font-black text-slate-900 uppercase text-right border-l border-slate-200 bg-slate-50 sticky right-0 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Totais Elemento</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {processedElements.map(el => {
                                        const elRecords = records.filter(r => r.elementId === el.id);
                                        const totalRealizadoAno = elRecords.reduce((acc, r) => acc + (r.executado || 0), 0);
                                        const totalRealizadoRP = elRecords.reduce((acc, r) => acc + (r.executadoRP || 0), 0);
                                        const totalEmpenhado = elRecords.reduce((acc, r) => acc + (r.empenhado || 0), 0);

                                        return (
                                            <tr key={el.id} className="hover:bg-ifes-green/[0.02] transition-colors group">
                                                <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-100">
                                                    <span className="text-[11px] font-black text-slate-700 uppercase leading-tight block w-60 mb-0.5">{el.nome}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${el.tipo === BudgetType.Custeio ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                                            {el.tipo}
                                                        </span>
                                                        <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter">Emp. Total: {formatCurrency(totalEmpenhado)}</span>
                                                    </div>
                                                </td>
                                                {MONTHS.map((_, idx) => {
                                                    const mNum = idx + 1;
                                                    const rec = elRecords.find(r => r.mes === mNum);

                                                    const vEmp = rec?.empenhado || 0;
                                                    const vRP = rec?.executadoRP || 0;
                                                    const vAno = rec?.executado || 0;

                                                    const showEmp = gridFilter === 'todos' || gridFilter === 'empenhado';
                                                    const showRP = gridFilter === 'todos' || gridFilter === 'executadoRP';
                                                    const showAno = gridFilter === 'todos' || gridFilter === 'executado';

                                                    const hasValues = (vEmp > 0 && showEmp) || (vRP > 0 && showRP) || (vAno > 0 && showAno);

                                                    return (
                                                        <td
                                                            key={idx}
                                                            onClick={() => handleOpenRecordModal(el, mNum)}
                                                            className="px-2 py-3 text-center cursor-pointer hover:bg-ifes-green/10 transition-colors border-l border-slate-50 group/cell"
                                                        >
                                                            {!hasValues ? (
                                                                <span className="text-[10px] text-slate-100 font-bold group-hover/cell:text-ifes-green/30">-</span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1.5 items-center justify-center min-h-[55px] py-1">
                                                                    {showEmp && vEmp > 0 && (
                                                                        <div className="flex flex-col items-center">
                                                                            <span className="text-[7px] font-bold text-blue-400 uppercase leading-none mb-0.5">Emp.</span>
                                                                            <span className="text-[10px] font-black text-blue-600 leading-none">
                                                                                {vEmp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    {showRP && vRP > 0 && (
                                                                        <div className="flex flex-col items-center">
                                                                            <span className="text-[7px] font-bold text-amber-500 uppercase leading-none mb-0.5">RP</span>
                                                                            <span className="text-[10px] font-black text-amber-700 leading-none">
                                                                                {vRP.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    {showAno && vAno > 0 && (
                                                                        <div className="flex flex-col items-center">
                                                                            <span className="text-[7px] font-bold text-emerald-500 uppercase leading-none mb-0.5">Ano</span>
                                                                            <span className="text-[10px] font-black text-emerald-600 leading-none">
                                                                                {vAno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-6 py-4 text-right border-l border-slate-200 bg-slate-50 sticky right-0 z-10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                                                    <div className="flex flex-col gap-2">
                                                        {(gridFilter === 'todos' || gridFilter === 'empenhado') && (
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-bold text-blue-400 uppercase leading-none">Total Emp.</span>
                                                                <span className="text-[10px] font-black text-blue-600 leading-tight">{formatCurrency(totalEmpenhado)}</span>
                                                            </div>
                                                        )}
                                                        {(gridFilter === 'todos' || gridFilter === 'executadoRP') && (
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-bold text-amber-600 uppercase leading-none">Total RP</span>
                                                                <span className="text-[10px] font-black text-amber-700 leading-tight">{formatCurrency(totalRealizadoRP)}</span>
                                                            </div>
                                                        )}
                                                        {(gridFilter === 'todos' || gridFilter === 'executado') && (
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-bold text-emerald-600 uppercase leading-none">Total Ano</span>
                                                                <span className="text-[10px] font-black text-emerald-600 leading-tight">{formatCurrency(totalRealizadoAno)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>
            </main>

            {/* Element Modal */}
            {isElementModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">{editingElement ? 'Editar Elemento' : 'Novo Elemento'}</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Classificação Orçamentária</p>
                            </div>
                            <button onClick={() => { setIsElementModalOpen(false); setEditingElement(null); setNewElementName(''); }} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-red-500">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Descrição</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-ifes-green/10 transition-all font-sans"
                                    value={newElementName}
                                    onChange={(e) => setNewElementName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Tipo</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setNewElementType(BudgetType.Custeio)}
                                        className={`py-3 rounded-xl text-sm font-black border transition-all ${newElementType === BudgetType.Custeio ? 'bg-ifes-green/10 border-ifes-green text-ifes-green' : 'bg-white border-slate-200 text-slate-400'}`}
                                    >
                                        Custeio
                                    </button>
                                    <button
                                        onClick={() => setNewElementType(BudgetType.Investimento)}
                                        className={`py-3 rounded-xl text-sm font-black border transition-all ${newElementType === BudgetType.Investimento ? 'bg-blue-50 border-blue-500 text-blue-500' : 'bg-white border-slate-200 text-slate-400'}`}
                                    >
                                        Investimento
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex flex-col gap-3">
                            <div className="flex gap-3">
                                <button onClick={() => { setIsElementModalOpen(false); setEditingElement(null); setNewElementName(''); }} className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-black">Cancelar</button>
                                <button
                                    onClick={handleSaveElement}
                                    disabled={saving || !newElementName.trim()}
                                    className="flex-1 px-6 py-3 bg-ifes-green text-white rounded-2xl text-sm font-black hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2"
                                >
                                    {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                                    {editingElement ? 'Atualizar' : 'Salvar'}
                                </button>
                            </div>

                            {editingElement && (
                                <button
                                    onClick={() => {
                                        handleDeleteElement(editingElement.id);
                                        setIsElementModalOpen(false);
                                        setEditingElement(null);
                                    }}
                                    className="w-full px-6 py-3 text-red-500 hover:bg-red-50 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all mt-2 border border-transparent hover:border-red-100 flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={14} />
                                    Excluir Elemento
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Record Modal (Single Month / Quick Entry) */}
            {isRecordModalOpen && selectedRecordElement && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">Inserir Valores</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    {selectedRecordElement.nome} ({selectedRecordElement.tipo})
                                </p>
                            </div>
                            <button onClick={() => setIsRecordModalOpen(false)} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-red-500">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Selecione o Mês</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {MONTHS.map((m, idx) => {
                                        const mNum = idx + 1;
                                        const isActive = editMonth === mNum;
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => setEditMonth(mNum)}
                                                className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${isActive ? 'bg-ifes-green border-ifes-green text-white shadow-md' : 'bg-white border-slate-100 text-slate-400 hover:border-ifes-green/30'}`}
                                            >
                                                {m.substring(0, 3)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Valor Empenhado</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-ifes-green transition-all"
                                            value={monthlyRecords[editMonth]?.empenhado || 0}
                                            onChange={(e) => setMonthlyRecords({
                                                ...monthlyRecords,
                                                [editMonth]: { ...monthlyRecords[editMonth], empenhado: Number(e.target.value) }
                                            })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 text-amber-500">Executado RP (Restos a Pagar)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-amber-400 transition-all"
                                            value={monthlyRecords[editMonth]?.executadoRP || 0}
                                            onChange={(e) => setMonthlyRecords({
                                                ...monthlyRecords,
                                                [editMonth]: { ...monthlyRecords[editMonth], executadoRP: Number(e.target.value) }
                                            })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1 text-emerald-600">Executado Ano ({selectedYear})</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                                        <input
                                            type="number"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-emerald-500 transition-all"
                                            value={monthlyRecords[editMonth]?.executado || 0}
                                            onChange={(e) => setMonthlyRecords({
                                                ...monthlyRecords,
                                                [editMonth]: { ...monthlyRecords[editMonth], executado: Number(e.target.value) }
                                            })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
                            <button onClick={() => setIsRecordModalOpen(false)} className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-black">Cancelar</button>
                            <button
                                onClick={handleSaveRecords}
                                disabled={saving}
                                className="flex-1 px-8 py-3 bg-ifes-green text-white rounded-2xl text-sm font-black hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                                Salvar Lançamento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetManagement;
