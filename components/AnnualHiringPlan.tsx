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
  LayoutDashboard,
  Plus,
  X,
  Save,
  Trash2,
  AlertCircle,
  Link,
  Check,
  TrendingUp,
  History,
  PencilLine,
  ChevronDown,
  ChevronUp,
  FileText,
  Info,
  Users,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import {
  ContractItem,
  SummaryData,
  Category,
  SortConfig
} from '../types';
import {
  CNPJ_IFES_BSF,
  PCA_YEARS_MAP,
  DEFAULT_YEAR,
  FALLBACK_DATA,
  API_SERVER_URL
} from '../constants';
import {
  formatCurrency,
  formatDate
} from '../utils/formatters';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

import { fetchPcaData, hasPcaInMemoryCache, fetchLocalPcaSnapshot, updatePcaCache } from '../services/pcaService';

// Components
import ContractTable from './ContractTable';
import Toast, { ToastType } from './Toast';
import logoIfes from '../logo-ifes.png';
import ProcessDashboard from './ProcessDashboard';
import { getProcessStatus, getStatusColor } from '../utils/processLogic';

const AnnualHiringPlan: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_YEAR);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [processFilter, setProcessFilter] = useState<string>('Todos');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'valor', direction: 'desc' });
  const [pcaMeta, setPcaMeta] = useState<{ id: string, dataPublicacao: string } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingSIPAC, setIsFetchingSIPAC] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<ContractItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    documentos: false,
    movimentacoes: false,
    interessados: false,
    incidentes: false
  });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [dashboardView, setDashboardView] = useState<'planning' | 'status'>('planning');
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);


  // Novos campos para item manual
  const [newItem, setNewItem] = useState<Partial<ContractItem>>({
    titulo: '',
    categoria: Category.Bens,
    valor: 0,
    inicio: new Date().toISOString().split('T')[0],
    area: 'Diretoria de Adm. e Planejamento'
  });

  const fetchData = useCallback(async (year: string, forceSync: boolean = false) => {
    const hasCache = hasPcaInMemoryCache(year);

    if (forceSync) {
      setIsSyncing(true);
      setLoading(true);
    } else if (!hasCache) {
      // Tenta carregar o snapshot local IMEDIATAMENTE para não travar o usuário
      const localSnapshot = await fetchLocalPcaSnapshot(year);
      if (localSnapshot && localSnapshot.length > 0) {
        setData(localSnapshot);
        setLoading(false); // Já temos dados base, esconde o overlay
        console.log(`[AnnualHiringPlan] Carregamento progressivo ativado (${localSnapshot.length} itens).`);
      } else {
        setLoading(true); // Se não houver nem local, mostra o overlay
      }
    }

    try {
      setSyncProgress(0);
      // O fetchPcaData agora é super rápido pois prioriza o JSON local.
      const result = await fetchPcaData(year, forceSync, false, (p) => setSyncProgress(p));

      if (result.data.length === 0) {
        setData(FALLBACK_DATA);
        setUsingFallback(true);
      } else {
        setData(result.data);
        setUsingFallback(false);
      }
      setLastSync(result.lastSync);
      setPcaMeta(result.pcaMeta);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      setData(FALLBACK_DATA);
    } finally {
      setLoading(false);
      setIsSyncing(false);
      setSyncProgress(100);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedYear);
  }, [selectedYear, fetchData]);

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const sorted = [...data].sort((a, b) => b.valor - a.valor);

    return sorted.map(item => {
      const daysToStart = Math.ceil((new Date(item.inicio).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let risk: 'Baixo' | 'Médio' | 'Alto' = 'Baixo';

      if (daysToStart < 30) risk = 'Alto';
      else if (daysToStart < 60) risk = 'Médio';

      const computedStatus = getProcessStatus(item);

      return { ...item, riskStatus: risk, computedStatus };
    });
  }, [data]);

  const summary = useMemo<SummaryData>(() => {
    const materials = processedData.filter(i => i.categoria === Category.Bens);
    const services = processedData.filter(i => i.categoria === Category.Servicos);
    const tic = processedData.filter(i => i.categoria === Category.TIC);

    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthlyPlan = months.map((m, idx) => {
      const val = processedData
        .filter(i => new Date(i.inicio).getMonth() === idx)
        .reduce((acc, i) => acc + i.valor, 0);
      return { month: m, value: val };
    });

    return {
      totalValue: processedData.reduce((acc, i) => acc + i.valor, 0),
      totalItems: processedData.length,
      materials: { qtd: materials.length, val: materials.reduce((acc, i) => acc + i.valor, 0) },
      tic: { qtd: tic.length, val: tic.reduce((acc, i) => acc + i.valor, 0) },
      services: { qtd: services.length, val: services.reduce((acc, i) => acc + i.valor, 0) },
      obras: { qtd: 0, val: 0 },
      totalExecutado: processedData.filter(i => i.protocoloSIPAC).length, // Agora conta processos vinculados
      monthlyPlan
    };
  }, [processedData]);

  const handleSaveValues = async () => {
    if (!editingItem) return;
    setSaving(true);
    setToast(null);

    try {
      // Caso 1: Aglomeração de múltiplos itens
      if (editingItem.id === 'bulk-selection') {
        const batch = writeBatch(db);
        const selectedItems = data.filter(i => selectedIds.includes(String(i.id)));

        const sanitizedSIPAC = editingItem.dadosSIPAC ? {
          ...editingItem.dadosSIPAC,
          ultimaAtualizacao: new Date().toLocaleString()
        } : null;

        for (const item of selectedItems) {
          const docId = item.isManual ? String(item.id) : `${selectedYear}-${item.id}`;
          const docRef = doc(db, "pca_data", docId);
          batch.set(docRef, {
            protocoloSIPAC: editingItem.protocoloSIPAC,
            dadosSIPAC: sanitizedSIPAC,
            updatedAt: Timestamp.now(),
            ano: selectedYear,
            isManual: item.isManual || false,
            officialId: item.isManual ? null : String(item.id).trim()
          }, { merge: true });
        }

        await batch.commit();

        setData(prev => prev.map(item =>
          selectedIds.includes(String(item.id))
            ? { ...item, protocoloSIPAC: editingItem.protocoloSIPAC, dadosSIPAC: sanitizedSIPAC }
            : item
        ));

        setToast({ message: `${selectedIds.length} itens vinculados com sucesso!`, type: "success" });
        setSelectedIds([]);
      } else {
        // Caso 2: Individual
        const docId = editingItem.isManual ? String(editingItem.id) : `${selectedYear}-${editingItem.id}`;
        const docRef = doc(db, "pca_data", docId);

        const sanitizedSIPAC = editingItem.dadosSIPAC ? {
          ...editingItem.dadosSIPAC,
          status: String(editingItem.dadosSIPAC.status || 'N/A'),
          assuntoDetalhado: String(editingItem.dadosSIPAC.assuntoDetalhado || ''),
          unidadeAtual: String(editingItem.dadosSIPAC.unidadeAtual || ''),
          ultimaMovimentacao: String(editingItem.dadosSIPAC.ultimaMovimentacao || ''),
          ultimaAtualizacao: String(editingItem.dadosSIPAC.ultimaAtualizacao || '')
        } : null;

        const saveData = {
          officialId: editingItem.isManual ? null : String(editingItem.id).trim(),
          ano: selectedYear,
          isManual: editingItem.isManual || false,
          updatedAt: Timestamp.now(),
          protocoloSIPAC: String(editingItem.protocoloSIPAC || ''),
          dadosSIPAC: sanitizedSIPAC,
          ...(editingItem.isManual ? {
            titulo: editingItem.titulo,
            categoria: editingItem.categoria,
            valor: editingItem.valor,
            inicio: editingItem.inicio,
            area: editingItem.area
          } : {})
        };

        await setDoc(docRef, saveData, { merge: true });

        setData(prevData => prevData.map(item =>
          String(item.id) === String(editingItem.id) ? { ...item, ...editingItem, dadosSIPAC: sanitizedSIPAC } : item
        ));

        setToast({ message: "Processo vinculado com sucesso!", type: "success" });
      }

      setIsEditModalOpen(false);
      setSaving(false);
    } catch (err) {
      console.error("❌ Erro ao salvar:", err);
      // EXIBE ALERTA DE ERRO
      alert(`Erro ao salvar no banco de dados: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
    }
  };

  const handleBulkLink = () => {
    const selectedItems = data.filter(i => selectedIds.includes(String(i.id)));
    if (selectedItems.length === 0) return;

    const totalValue = selectedItems.reduce((acc, i) => acc + i.valor, 0);
    const dummyItem: ContractItem = {
      id: 'bulk-selection',
      titulo: `Aglomeração de ${selectedItems.length} itens selecionados`,
      valor: totalValue,
      categoria: selectedItems[0]?.categoria || Category.Bens,
      inicio: selectedItems[0]?.inicio || new Date().toISOString(),
      fim: '',
      area: 'Múltiplas Áreas',
      isManual: false,
      protocoloSIPAC: '',
      dadosSIPAC: null
    };

    setEditingItem(dummyItem);
    setIsEditModalOpen(true);
  };

  const handleUnlinkProcess = async (item: ContractItem) => {
    if (!window.confirm("Deseja realmente remover o vínculo com este processo SIPAC?")) return;

    setSaving(true);
    try {
      const docId = item.isManual ? String(item.id) : `${selectedYear}-${item.id}`;
      const docRef = doc(db, "pca_data", docId);

      const saveData = {
        protocoloSIPAC: '',
        dadosSIPAC: null,
        updatedAt: Timestamp.now()
      };

      await setDoc(docRef, saveData, { merge: true });

      // Otimista
      setData(prevData => prevData.map(i =>
        String(i.id) === String(item.id) ? { ...i, protocoloSIPAC: '', dadosSIPAC: null } : i
      ));

      if (viewingItem && String(viewingItem.id) === String(item.id)) {
        setViewingItem({ ...viewingItem, protocoloSIPAC: '', dadosSIPAC: null });
        setIsDetailsModalOpen(false); // Close details as there's no process now
      }

      setToast({ message: "Vínculo removido com sucesso!", type: "success" });
      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Erro ao desvincular:", err);
      setToast({ message: "Erro ao remover vínculo.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSIPACItem = async (item: ContractItem, isFromDetails: boolean = false) => {
    if (!item.protocoloSIPAC) return;

    setIsFetchingSIPAC(true);
    try {
      const response = await fetch(`${API_SERVER_URL}/api/sipac/processo?protocolo=${item.protocoloSIPAC}`);
      if (!response.ok) throw new Error('Falha ao buscar dados no SIPAC');

      const sipacData = await response.json();
      const updatedItem = {
        ...item,
        dadosSIPAC: {
          ...sipacData,
          ultimaAtualizacao: new Date().toLocaleString()
        }
      };

      if (isFromDetails) {
        setViewingItem(updatedItem);
        // Se visualizando nos detalhes, também salvamos automaticamente no banco para persistir o snapshot
        const docId = item.isManual ? String(item.id) : `${selectedYear}-${item.id}`;
        const docRef = doc(db, "pca_data", docId);

        await setDoc(docRef, {
          protocoloSIPAC: String(item.protocoloSIPAC),
          dadosSIPAC: updatedItem.dadosSIPAC,
          updatedAt: Timestamp.now()
        }, { merge: true });

        // Atualiza na lista local e cache
        setData(prev => prev.map(i => String(i.id) === String(item.id) ? updatedItem : i));
        updatePcaCache(selectedYear, String(item.id), { dadosSIPAC: updatedItem.dadosSIPAC });

        setToast({ message: "Dados do SIPAC atualizados com sucesso!", type: "success" });
      } else {
        setEditingItem(updatedItem);
      }
    } catch (err) {
      console.error("Erro ao buscar SIPAC:", err);
      alert("Não foi possível localizar o processo no SIPAC.");
    } finally {
      setIsFetchingSIPAC(false);
    }
  };

  const handleFetchSIPAC = () => {
    if (editingItem) handleUpdateSIPACItem(editingItem);
  };

  const formatProtocolo = (val: string) => {
    const v = val.replace(/\D/g, '').slice(0, 17);
    if (v.length > 15) return `${v.slice(0, 5)}.${v.slice(5, 11)}/${v.slice(11, 15)}-${v.slice(15)}`;
    if (v.length > 11) return `${v.slice(0, 5)}.${v.slice(5, 11)}/${v.slice(11)}`;
    if (v.length > 5) return `${v.slice(0, 5)}.${v.slice(5)}`;
    return v;
  };

  const handleAddManualItem = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, "pca_data"), {
        ...newItem,
        ano: Number(selectedYear),
        isManual: true,
        valorExecutado: 0,
        updatedAt: Timestamp.now()
      });
      await fetchData(selectedYear);
      setIsManualModalOpen(false);
      setNewItem({
        titulo: '',
        categoria: Category.Bens,
        valor: 0,
        inicio: new Date().toISOString().split('T')[0],
        area: 'Diretoria de Adm. e Planejamento'
      });
      setToast({ message: "Demanda manual registrada com sucesso!", type: "success" });
    } catch (err) {
      console.error("Erro ao adicionar:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este item manual?")) return;
    try {
      await deleteDoc(doc(db, "pca_data", id));
      await fetchData(selectedYear);
      setToast({ message: "Item excluído com sucesso!", type: "success" });
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  };

  const chartData = useMemo(() => [
    { name: 'Bens', value: summary.materials.val, fill: '#10b981' },
    { name: 'Serviços', value: summary.services.val, fill: '#f59e0b' },
    { name: 'TIC', value: summary.tic.val, fill: '#3b82f6' }
  ], [summary]);

  // --- LÓGICA DE AGREGAÇÃO (NÍVEL DE EXECUÇÃO E PLANEJAMENTO) ---
  const aggregatedData = useMemo(() => {
    // 1. Filtragem Inicial (Filtros de UI)
    let base = [...processedData];
    if (selectedCategory !== 'Todas') base = base.filter(i => i.categoria === selectedCategory);
    if (statusFilter !== 'Todos') base = base.filter(i => i.computedStatus === statusFilter);
    if (processFilter !== 'Todos') {
      if (processFilter === 'Com Processo') base = base.filter(i => i.protocoloSIPAC && i.protocoloSIPAC.length > 5);
      else if (processFilter === 'Sem Processo') base = base.filter(i => !i.protocoloSIPAC || i.protocoloSIPAC.length <= 5);
    }
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      base = base.filter(i => i.titulo.toLowerCase().includes(low) || i.area.toLowerCase().includes(low));
    }

    // 2. Agrupamento por Protocolo SIPAC (Prioridade 1 - Execução)
    const sipacGroups: Record<string, ContractItem[]> = {};
    const notInSipac: ContractItem[] = [];

    base.forEach(item => {
      if (item.protocoloSIPAC && item.protocoloSIPAC.length > 5) {
        if (!sipacGroups[item.protocoloSIPAC]) sipacGroups[item.protocoloSIPAC] = [];
        sipacGroups[item.protocoloSIPAC].push(item);
      } else {
        notInSipac.push(item);
      }
    });

    // 3. Agrupamento por IFC (Prioridade 2 - Planejamento)
    const ifcGroups: Record<string, ContractItem[]> = {};
    const individuals: ContractItem[] = [];

    notInSipac.forEach(item => {
      if (item.identificadorFuturaContratacao) {
        if (!ifcGroups[item.identificadorFuturaContratacao]) ifcGroups[item.identificadorFuturaContratacao] = [];
        ifcGroups[item.identificadorFuturaContratacao].push(item);
      } else {
        individuals.push(item);
      }
    });

    // 4. Construção das Linhas de Exibição (Display Rows)
    const resultRows: ContractItem[] = [];

    // Processar Grupos SIPAC
    Object.entries(sipacGroups).forEach(([proto, items]) => {
      if (items.length === 1) {
        resultRows.push(items[0]);
      } else {
        const first = items[0];
        resultRows.push({
          ...first,
          id: `group-sipac-${proto}`,
          titulo: first.titulo,
          valor: items.reduce((acc, i) => acc + i.valor, 0),
          isGroup: true,
          itemCount: items.length,
          childItems: items
        });
      }
    });

    // Processar Grupos IFC
    Object.entries(ifcGroups).forEach(([ifc, items]) => {
      if (items.length === 1) {
        resultRows.push(items[0]);
      } else {
        const first = items[0];
        resultRows.push({
          ...first,
          id: `group-ifc-${ifc}`,
          titulo: first.titulo,
          valor: items.reduce((acc, i) => acc + i.valor, 0),
          isGroup: true,
          itemCount: items.length,
          childItems: items
        });
      }
    });

    // Adicionar Indivíduos
    resultRows.push(...individuals);

    // 5. Ordenação Final
    return resultRows.sort((a, b) => {
      let aVal = a[sortConfig.key] || '';
      let bVal = b[sortConfig.key] || '';

      if (sortConfig.key === 'valor') {
        return sortConfig.direction === 'desc' ? Number(bVal) - Number(aVal) : Number(aVal) - Number(bVal);
      }

      if (String(aVal).toLowerCase() < String(bVal).toLowerCase()) return sortConfig.direction === 'asc' ? -1 : 1;
      if (String(aVal).toLowerCase() > String(bVal).toLowerCase()) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [processedData, searchTerm, selectedCategory, statusFilter, processFilter, sortConfig]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return aggregatedData.slice(start, start + itemsPerPage);
  }, [aggregatedData, currentPage]);

  const totalPages = Math.ceil(aggregatedData.length / itemsPerPage);

  const closeToast = () => setToast(null);

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
      {/* Overlay de carregamento PNCP */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/70 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col items-center gap-8 max-w-sm text-center relative overflow-hidden">
            {/* Progress Background Graphic */}
            <div className="absolute top-0 left-0 h-1 bg-ifes-green/10 w-full">
              <div
                className="h-full bg-ifes-green transition-all duration-500 ease-out"
                style={{ width: `${syncProgress}%` }}
              ></div>
            </div>

            <div className="relative">
              <svg className="w-24 h-24 -rotate-90">
                <circle
                  cx="48" cy="48" r="42"
                  stroke="currentColor" strokeWidth="6" fill="transparent"
                  className="text-slate-50"
                />
                <circle
                  cx="48" cy="48" r="42"
                  stroke="currentColor" strokeWidth="6" fill="transparent"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - syncProgress / 100)}
                  strokeLinecap="round"
                  className="text-ifes-green transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-slate-800 leading-none">{Math.round(syncProgress)}%</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col items-center">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {isSyncing ? 'Sincronizando' : 'Carregando'}
                </h3>
                <span className="text-[10px] font-black text-ifes-green uppercase tracking-[0.3em] mt-1">
                  {isSyncing ? 'Conexão PNCP Ativa' : 'Banco de Dados Cloud'}
                </span>
              </div>

              <p className="text-sm font-bold text-slate-500 leading-relaxed px-2">
                {syncProgress < 15 ? 'Inicializando componentes...' :
                  syncProgress < 70 ? (isSyncing ? `Baixando pacotes de dados (${Math.round(syncProgress)}%)...` : 'Conectando ao banco de dados...') :
                    syncProgress < 95 ? 'Processando e organizando itens...' : 'Finalizando...'}
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
              <RefreshCw size={14} className="text-ifes-green animate-spin" />
              <span className="text-[10px] font-black text-slate-400 uppercase">Processando em Tempo Real</span>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm font-sans">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <img src={logoIfes} alt="Logo IFES" className="h-12 sm:h-16 w-auto object-contain" />
              <div className="flex flex-col border-l border-slate-100 pl-3 sm:pl-4">
                <span className="text-sm sm:text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Gestão de Contratações</span>
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Campus BSF</span>
              </div>
            </div>

            <div className="border-l border-slate-100 pl-3 sm:pl-6 ml-0 sm:ml-6">
              <div className="flex flex-col">
                <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ano Ref.</span>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedYear}
                    onChange={(e) => {
                      setSelectedYear(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-ifes-green/5 text-ifes-green border border-ifes-green/20 rounded-md px-2 sm:px-3 py-1 text-[10px] sm:text-sm font-black outline-none focus:ring-2 focus:ring-ifes-green/40 transition-all cursor-pointer"
                  >
                    {Object.keys(PCA_YEARS_MAP).sort((a, b) => b.localeCompare(a)).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>

                  {pcaMeta && (
                    <div className="hidden lg:flex flex-col border-l border-slate-200 pl-3">
                      <span className="text-[10px] font-bold text-slate-500 uppercase leading-none">PCA ID: {pcaMeta.id}</span>
                      <span className="text-[9px] font-medium text-slate-400 mt-1">Ref.: {formatDate(pcaMeta.dataPublicacao)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {(loading || isSyncing) && <RefreshCw size={18} className="animate-spin text-ifes-green hidden sm:block" />}

            <div className="hidden lg:flex flex-col items-end mr-2">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Última Sincronização</span>
              <span className="text-[10px] font-bold text-slate-600">{lastSync || 'Carregando...'}</span>
            </div>

            <button
              onClick={() => fetchData(selectedYear, true)}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all font-bold text-xs sm:text-sm border border-blue-200 cursor-pointer disabled:opacity-50"
              title="Atualizar dados diretamente da PNCP"
            >
              <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Atualizar PNCP</span>
            </button>


            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-xs sm:text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
            >
              <LayoutDashboard size={18} />
              <span className="hidden md:inline">Menu Principal</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Carousel Dashboard */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative font-sans">

          {/* Header do Carousel */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
            <button
              onClick={() => setDashboardView(prev => prev === 'planning' ? 'status' : 'planning')}
              className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-ifes-green transition-colors"
            >
              <ChevronLeft size={24} />
            </button>

            <div className="text-center">
              <h2 className="text-xl font-black text-slate-800 tracking-tight">
                {dashboardView === 'planning' ? 'Plano de Contratação Anual' : 'Gestão de Processos (Status)'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {dashboardView === 'planning' ? 'Visão Geral do Planejamento e Alocação' : 'Monitoramento de Fluxos e Prazos'}
              </p>
            </div>

            <button
              onClick={() => setDashboardView(prev => prev === 'planning' ? 'status' : 'planning')}
              className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-ifes-green transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          <div className="p-6 bg-slate-50/30 min-h-[400px]">
            {dashboardView === 'planning' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">

                {/* Coluna 1: KPI Planejado Total */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center h-full relative overflow-hidden group hover:border-ifes-green/30 transition-all">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <DollarSign size={80} className="text-ifes-green" />
                    </div>

                    <div className="relative z-10">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Inv. Planejado Total</p>
                      <h3 className="text-3xl font-black text-slate-900 mb-6">{formatCurrency(summary.totalValue)}</h3>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Itens Vinculados</span>
                          <span>{((summary.totalExecutado / (summary.totalItems || 1)) * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-ifes-green transition-all duration-500"
                            style={{ width: `${(summary.totalExecutado / (summary.totalItems || 1)) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Gráfico de Pizza (Alocação) */}
                <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                  <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                    <Target size={16} className="text-ifes-green" />
                    Alocação de Recursos
                  </h3>
                  <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} cornerRadius={4} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Legend Overlay */}
                    <div className="absolute bottom-0 right-0 flex flex-col gap-2 bg-white/90 p-2 rounded-xl border border-slate-100 backdrop-blur-sm text-[10px]">
                      {chartData.map(item => (
                        <div key={item.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
                          <span className="font-bold text-slate-600">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Coluna 3: Cronograma Mensal (Substituindo Curva ABC) */}
                <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                  <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                    <RefreshCw size={16} className="text-blue-500" />
                    Cronograma Mensal
                  </h3>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.monthlyPlan}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                        />
                        <Tooltip
                          formatter={(v: number) => formatCurrency(v)}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar
                          dataKey="value"
                          fill="#2f9e41"
                          radius={[4, 4, 0, 0]}
                          barSize={16}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            ) : (
              <ProcessDashboard data={processedData} />
            )}
          </div>
        </div>

        {/* Zona 4: Tabela */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col font-sans">
          <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 bg-slate-50/30">
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Contratações Planejadas</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">Lista oficial do PCA {selectedYear}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-2 bg-ifes-green text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors shadow-sm"
              >
                <Plus size={16} />
                <span>Nova Demanda</span>
              </button>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input
                  type="text"
                  placeholder="Buscar descrição..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
              </div>

              <select
                value={processFilter}
                onChange={(e) => { setProcessFilter(e.target.value); setCurrentPage(1); }}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 outline-none"
              >
                <option value="Todos">Filtro: Todos</option>
                <option value="Com Processo">Processo Aberto</option>
                <option value="Sem Processo">Processo Não Aberto</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 outline-none max-w-[150px]"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Processo Não Aberto">Não Aberto</option>
                <option value="Planejamento da Contratação">Planejamento</option>
                <option value="Composição de Preços">Preços</option>
                <option value="Análise de Legalidade">Jurídico</option>
                <option value="Fase Externa">Fase Externa</option>
                <option value="Licitação Suspensa/Sob Análise">Suspenso</option>
                <option value="Adjudicado/Homologado">Adjudicado</option>
                <option value="Contratado">Contratado</option>
                <option value="Encerrado/Arquivado">Encerrado</option>
              </select>

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
          </div>

          <ContractTable
            data={pagedData}
            loading={loading}
            onSort={(key) => {
              const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
              setSortConfig({ key, direction });
            }}
            sortConfig={sortConfig}
            selectedIds={selectedIds}
            onToggleSelection={(id) => {
              // Encontrar o item ou grupo correspondente
              const item = aggregatedData.find(i => String(i.id) === id);
              if (!item) return;

              if (item.isGroup && item.childItems) {
                const childIds = item.childItems.map(c => String(c.id));
                const allSelected = childIds.every(cid => selectedIds.includes(cid));

                if (allSelected) {
                  setSelectedIds(prev => prev.filter(pid => !childIds.includes(pid)));
                } else {
                  setSelectedIds(prev => Array.from(new Set([...prev, ...childIds])));
                }
              } else {
                setSelectedIds(prev =>
                  prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
                );
              }
            }}
            onToggleAll={() => {
              const allIdsInPage = pagedData.flatMap(item =>
                item.isGroup && item.childItems ? item.childItems.map(c => String(c.id)) : [String(item.id)]
              );
              const allSelected = allIdsInPage.every(id => selectedIds.includes(id));

              if (allSelected) {
                setSelectedIds(prev => prev.filter(id => !allIdsInPage.includes(id)));
              } else {
                setSelectedIds(prev => Array.from(new Set([...prev, ...allIdsInPage])));
              }
            }}
            onEdit={(item) => {
              setEditingItem(item);
              setIsEditModalOpen(true);
            }}
            onViewDetails={(item) => {
              setViewingItem(item);
              setIsDetailsModalOpen(true);
            }}
          />

          {!loading && totalPages > 1 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 capitalize">Página {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href={`https://pncp.gov.br/app/pca/${CNPJ_IFES_BSF}/${selectedYear}/${PCA_YEARS_MAP[selectedYear]}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-ifes-green transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-ifes-green/10 p-3 rounded-xl text-ifes-green"><ExternalLink size={20} /></div>
              <div><span className="block font-bold text-slate-800 tracking-tight">PNCP Oficial {selectedYear}</span><span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Acesse o portal do governo</span></div>
            </div>
            <span className="text-ifes-green group-hover:translate-x-1 transition-transform">&rarr;</span>
          </a>
          <a href="https://saofrancisco.ifes.edu.br" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-emerald-400 transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-50 p-3 rounded-xl text-emerald-600"><Building2 size={20} /></div>
              <div><span className="block font-bold text-slate-800 tracking-tight">Site do Campus</span><span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Transparência Ifes BSF</span></div>
            </div>
            <span className="text-emerald-600 group-hover:translate-x-1 transition-transform">&rarr;</span>
          </a>
        </section>
      </main>

      {/* Modal de Edição de Valores */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden font-sans">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Vincular Processo</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Integração SIPAC • Monitoramento Real</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-red-500">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest">Itens Selecionados para Vínculo</p>

                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {(editingItem.isGroup || editingItem.id === 'bulk-selection') ? (
                    (editingItem.childItems || (editingItem.id === 'bulk-selection' ? data.filter(i => selectedIds.includes(String(i.id))) : [])).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start gap-4 pb-2 border-b border-slate-200/50 last:border-0">
                        <p className="text-xs font-bold text-slate-700 leading-tight flex-1">{item.titulo}</p>
                        <span className="text-[11px] font-black text-slate-500 font-mono whitespace-nowrap">{formatCurrency(item.valor)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold text-slate-700 flex-1">{editingItem.titulo}</p>
                      <span className="text-sm font-black text-slate-500 font-mono">{formatCurrency(editingItem.valor)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t-2 border-dashed border-slate-200 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total da Contratação</span>
                  <span className="text-xl font-black text-ifes-green tabular-nums">{formatCurrency(editingItem.valor)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Número do Protocolo SIPAC</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input
                      type="text"
                      placeholder="00000.000000/0000-00"
                      maxLength={20}
                      className="w-full pl-11 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all shadow-sm"
                      value={editingItem.protocoloSIPAC || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, protocoloSIPAC: formatProtocolo(e.target.value) })}
                    />
                  </div>
                  <button
                    onClick={handleFetchSIPAC}
                    disabled={isFetchingSIPAC || !editingItem.protocoloSIPAC}
                    className="px-6 bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isFetchingSIPAC ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Buscar
                  </button>
                  {editingItem.protocoloSIPAC && editingItem.dadosSIPAC && (
                    <button
                      onClick={() => handleUnlinkProcess(editingItem)}
                      className="px-4 bg-red-50 text-red-600 rounded-2xl font-black text-xs hover:bg-red-600 hover:text-white transition-all flex items-center gap-2 border border-red-100 shadow-sm"
                    >
                      <Trash2 size={16} />
                      Desvincular
                    </button>
                  )}
                </div>

                {editingItem.dadosSIPAC && (
                  <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">Dados Encontrados</span>
                      <span className="text-[8px] font-bold text-slate-400">Atualizado em: {editingItem.dadosSIPAC.ultimaAtualizacao}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase">Status Atual</span>
                        <span className="text-xs font-black text-slate-700">{editingItem.dadosSIPAC.status}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-slate-400 uppercase">Unidade Atual</span>
                        <span className="text-xs font-black text-slate-700">{editingItem.dadosSIPAC.unidadeAtual}</span>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-blue-50">
                        <span className="block text-[8px] font-black text-slate-400 uppercase">Assunto Detalhado</span>
                        <span className="text-xs font-bold text-slate-600 leading-tight">
                          {editingItem.dadosSIPAC.assuntoDetalhado || 'Não informado'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {editingItem.isManual && (
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={() => {
                      handleDeleteItem(String(editingItem.id));
                      setIsEditModalOpen(false);
                    }}
                    className="flex items-center gap-2 text-red-500 hover:text-red-600 text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    <Trash2 size={14} />
                    Excluir Registro Manual
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveValues}
                disabled={saving || (!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC)}
                className="flex-1 px-6 py-3 bg-ifes-green text-white rounded-2xl text-sm font-black hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                {!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC ? 'Busque antes de salvar' : 'Confirmar Vínculo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Item Manual */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Nova Demanda</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registrar contração fora do PCA Base</p>
              </div>
              <button onClick={() => setIsManualModalOpen(false)} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-red-500">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Descrição do Processo</label>
                <textarea
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-ifes-green/20 focus:border-ifes-green transition-all"
                  rows={2}
                  placeholder="Ex: Aquisição emergencial de filtros de água..."
                  value={newItem.titulo}
                  onChange={(e) => setNewItem({ ...newItem, titulo: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Categoria</label>
                  <select
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-ifes-green/20"
                    value={newItem.categoria}
                    onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value as Category })}
                  >
                    <option value={Category.Bens}>Bens</option>
                    <option value={Category.Servicos}>Serviços</option>
                    <option value={Category.TIC}>TIC</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Valor Previsto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                    <input
                      type="number"
                      className="w-full pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-ifes-green/20"
                      value={newItem.valor}
                      onChange={(e) => setNewItem({ ...newItem, valor: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Data Desejada</label>
                  <input
                    type="date"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-ifes-green/20"
                    value={newItem.inicio}
                    onChange={(e) => setNewItem({ ...newItem, inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Unidade Solicitante</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-ifes-green/20"
                    value={newItem.area}
                    onChange={(e) => setNewItem({ ...newItem, area: e.target.value })}
                  />
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3 items-start">
                <AlertCircle className="text-amber-600 shrink-0" size={18} />
                <p className="text-[10px] font-bold text-amber-800 leading-relaxed uppercase">
                  Atenção: Itens manuais não possuem sincronização automática com o PNCP e devem ser atualizados manualmente.
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl text-sm font-black hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddManualItem}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} />}
                Registrar Demanda
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Detalhes SIPAC - FULL PAGE EDITION */}
      {isDetailsModalOpen && viewingItem && viewingItem.dadosSIPAC && (
        <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col font-sans animate-in fade-in duration-300">
          {/* Header Superior Fixo */}
          <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-200">
                <Search size={24} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Processo {viewingItem.dadosSIPAC.numeroProcesso}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${getStatusColor(getProcessStatus(viewingItem))}`}>
                    {getProcessStatus(viewingItem)}
                  </span>
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sincronizado via SIPAC em {viewingItem.dadosSIPAC.ultimaAtualizacao}</span>
                  <div className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span className="text-[10px] font-bold text-blue-600 uppercase italic">{viewingItem.area}</span>
                  <div className="w-1 h-1 bg-slate-300 rounded-full" />
                  <button
                    onClick={() => handleUpdateSIPACItem(viewingItem, true)}
                    disabled={isFetchingSIPAC}
                    className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full text-[9px] font-black uppercase transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={isFetchingSIPAC ? 'animate-spin' : ''} />
                    {isFetchingSIPAC ? 'Atualizando...' : 'Atualizar Dados AGORA'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsDetailsModalOpen(false);
                  setEditingItem(viewingItem);
                  setIsEditModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
              >
                <PencilLine size={16} />
                Editar Vínculo
              </button>
              <button
                onClick={() => handleUnlinkProcess(viewingItem)}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-xs font-black text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm group"
              >
                <Link size={16} className="rotate-45" />
                Desvincular
              </button>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="p-2.5 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-slate-400 bg-white border border-slate-100"
              >
                <X size={24} />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-8 py-10">
            <div className="max-w-6xl mx-auto space-y-8 pb-20">

              {/* Grid 1: Informações Básicas e Resumo */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Card do PCA */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="text-blue-600" size={20} />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Contexto do Planejamento</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 leading-tight mb-4">
                      {viewingItem.titulo}
                    </h3>
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="block text-[8px] font-black text-slate-300 uppercase mb-1">Valor Estimado</span>
                        <span className="text-lg font-black text-slate-700 font-mono">{formatCurrency(viewingItem.valor)}</span>
                      </div>
                      <div className="w-px h-8 bg-slate-100" />
                      <div>
                        <span className="block text-[8px] font-black text-slate-300 uppercase mb-1">Categoria</span>
                        <span className="text-sm font-bold text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">{viewingItem.categoria}</span>
                      </div>
                      {viewingItem.identificadorFuturaContratacao && (
                        <>
                          <div className="w-px h-8 bg-slate-100" />
                          <div>
                            <span className="block text-[8px] font-black text-slate-300 uppercase mb-1">Cód. Futura Contratação (IFC)</span>
                            <span className="text-sm font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100 font-mono italic lowercase">
                              {viewingItem.identificadorFuturaContratacao}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-dashed border-slate-100">
                    <span className="block text-[10px] font-black text-slate-400 uppercase mb-3">Objeto do Processo (SIPAC)</span>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed italic border-l-4 border-blue-200 pl-4 bg-blue-50/20 py-2 rounded-r-xl">
                      "{viewingItem.dadosSIPAC.assuntoDetalhado || 'Sem descrição detalhada'}"
                    </p>
                  </div>
                </div>

                {/* Card de Status Rápido */}
                <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl shadow-slate-200 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <RefreshCw size={120} />
                  </div>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 block">Resumo Executivo</span>
                    <div className="space-y-6">
                      <div>
                        <span className="block text-[8px] font-black text-slate-500 uppercase mb-2">Unidade sob Custódia</span>
                        <p className="text-sm font-black text-blue-400">
                          {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                            ? viewingItem.dadosSIPAC.movimentacoes[0].unidadeDestino
                            : viewingItem.dadosSIPAC.unidadeOrigem}
                        </p>
                      </div>
                      <div>
                        <span className="block text-[8px] font-black text-slate-500 uppercase mb-2">Última Movimentação</span>
                        <p className="text-xs font-bold text-slate-300">
                          {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                            ? `${viewingItem.dadosSIPAC.movimentacoes[0].data} às ${viewingItem.dadosSIPAC.movimentacoes[0].horario}`
                            : 'Processo recém autuado'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 bg-white/5 p-4 rounded-2xl border border-white/10 mt-8">
                    <span className="text-[9px] font-black text-slate-400 uppercase mb-2 block">Natureza</span>
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-400">{viewingItem.dadosSIPAC.natureza || 'OSTENSIVO'}</span>
                  </div>
                </div>
              </div>

              {/* Seção 2: Identificação Completa do Processo (SIPAC) */}
              <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <Info className="text-blue-600" size={20} />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação Completa do Processo</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-12">
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Número do Processo</span>
                    <span className="text-sm font-black text-slate-700 font-mono tracking-tighter">{viewingItem.dadosSIPAC.numeroProcesso}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Data de Autuação</span>
                    <span className="text-sm font-bold text-slate-700">{viewingItem.dadosSIPAC.dataAutuacion} {viewingItem.dadosSIPAC.horarioAutuacion}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Usuário de Autuação</span>
                    <span className="text-xs font-bold text-slate-600 uppercase italic">{viewingItem.dadosSIPAC.usuarioAutuacion}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Data de Cadastro</span>
                    <span className="text-sm font-bold text-slate-700">{viewingItem.dadosSIPAC.dataCadastro}</span>
                  </div>

                  <div className="lg:col-span-2">
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Assunto do Processo</span>
                    <span className="text-xs font-bold text-slate-700 uppercase">
                      <span className="text-blue-600 font-black mr-2">{viewingItem.dadosSIPAC.assuntoCodigo}</span>
                      {viewingItem.dadosSIPAC.assuntoDescricao}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Status Atual</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${getStatusColor(getProcessStatus(viewingItem))}`}>
                      {getProcessStatus(viewingItem)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Natureza</span>
                    <span className="text-[10px] font-black text-slate-700 uppercase">{viewingItem.dadosSIPAC.natureza}</span>
                  </div>

                  <div className="lg:col-span-2">
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Unidade de Origem</span>
                    <span className="text-xs font-bold text-slate-600 uppercase">{viewingItem.dadosSIPAC.unidadeOrigem}</span>
                  </div>
                  <div className="lg:col-span-2">
                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-1">Assunto Detalhado</span>
                    <p className="text-xs font-medium text-slate-500 italic">"{viewingItem.dadosSIPAC.assuntoDetalhado}"</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">

                {/* 1. Interessados */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
                  <button
                    onClick={() => setExpandedSections(p => ({ ...p, interessados: !p.interessados }))}
                    className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
                        <Users size={20} />
                      </div>
                      <span className="font-black text-slate-800 uppercase text-xs tracking-widest">Interessados e Responsáveis</span>
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full">{(viewingItem.dadosSIPAC.interessados || []).length}</span>
                    </div>
                    {expandedSections.interessados ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
                  </button>
                  {expandedSections.interessados && (
                    <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(viewingItem.dadosSIPAC.interessados || []).map((interessado, i) => (
                          <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{interessado.tipo}</span>
                            <p className="text-sm font-bold text-slate-700">{interessado.nome}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Documentos do Processo */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
                  <button
                    onClick={() => setExpandedSections(p => ({ ...p, documentos: !p.documentos }))}
                    className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-xl text-blue-600">
                        <FileText size={20} />
                      </div>
                      <span className="font-black text-slate-800 uppercase text-xs tracking-widest">Documentos e Atas</span>
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">{(viewingItem.dadosSIPAC.documentos || []).length}</span>
                    </div>
                    {expandedSections.documentos ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
                  </button>
                  {expandedSections.documentos && (
                    <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="overflow-hidden border border-slate-100 rounded-2xl">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50/50">
                            <tr>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Ordem</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Tipo de Documento</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Data</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Origem</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Natureza</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(viewingItem.dadosSIPAC.documentos || []).map((doc, i) => (
                              <tr key={i} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-xs font-black text-slate-400">#{doc.ordem}</td>
                                <td className="px-6 py-4">
                                  <span className="text-xs font-bold text-slate-800">{doc.tipo}</span>
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-600 font-medium">{doc.data}</td>
                                <td className="px-6 py-4 text-xs text-slate-600 font-medium uppercase">{doc.unidadeOrigem}</td>
                                <td className="px-6 py-4 text-xs text-slate-500 font-bold uppercase">{doc.natureza || 'OSTENSIVO'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Movimentações */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
                  <button
                    onClick={() => setExpandedSections(p => ({ ...p, movimentacoes: !p.movimentacoes }))}
                    className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
                        <History size={20} />
                      </div>
                      <span className="font-black text-slate-800 uppercase text-xs tracking-widest">Histórico de Tramitação</span>
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full">{(viewingItem.dadosSIPAC.movimentacoes || []).length}</span>
                    </div>
                    {expandedSections.movimentacoes ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
                  </button>
                  {expandedSections.movimentacoes && (
                    <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="relative pl-8 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                        {[...(viewingItem.dadosSIPAC.movimentacoes || [])].reverse().map((mov, i) => (
                          <div key={i} className="relative">
                            <div className="absolute left-[-21px] top-1.5 w-2 h-2 rounded-full bg-white border-2 border-emerald-500 z-10" />
                            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                                <div className="flex items-center gap-4">
                                  <div className="shrink-0 flex flex-col items-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                    <span className="text-[10px] font-black text-slate-700 leading-none">{mov.data}</span>
                                    <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{mov.horario}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-slate-700 uppercase">{mov.unidadeOrigem}</span>
                                    <ChevronRight size={14} className="text-slate-300" />
                                    <span className="text-xs font-black text-blue-600 uppercase">{mov.unidadeDestino}</span>
                                  </div>
                                </div>
                                {mov.urgente && mov.urgente.toLowerCase().includes('sim') && (
                                  <span className="bg-red-50 text-red-600 text-[8px] font-black px-2 py-1 rounded-lg border border-red-100 animate-pulse">URGENTE</span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
                                <div className="space-y-1">
                                  <span className="text-[8px] font-black text-slate-300 uppercase block">Enviado por (Remetente)</span>
                                  <p className="text-[11px] font-bold text-slate-600 uppercase italic">
                                    {mov.usuarioRemetente || 'Não informado'}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] font-black text-slate-300 uppercase block">Recebimento</span>
                                  <p className="text-[11px] font-bold text-slate-800 uppercase italic">
                                    {mov.usuarioRecebedor ? mov.usuarioRecebedor : 'PENDENTE DE RECEBIMENTO'}
                                  </p>
                                  {mov.dataRecebimento && (
                                    <p className="text-[9px] font-medium text-slate-400">
                                      Confirmado em {mov.dataRecebimento} às {mov.horarioRecebimento}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Incidentes (Opcional) */}
                {viewingItem.dadosSIPAC.incidentes && viewingItem.dadosSIPAC.incidentes.length > 0 && (
                  <div className="bg-white rounded-3xl border border-red-200 shadow-sm overflow-hidden transition-all">
                    <button
                      onClick={() => setExpandedSections(p => ({ ...p, incidentes: !p.incidentes }))}
                      className="w-full px-8 py-5 flex items-center justify-between hover:bg-red-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-red-50 p-2 rounded-xl text-red-600">
                          <AlertTriangle size={20} />
                        </div>
                        <span className="font-black text-red-800 uppercase text-xs tracking-widest">Documentos Cancelados / Incidentes</span>
                        <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-0.5 rounded-full">{(viewingItem.dadosSIPAC.incidentes || []).length}</span>
                      </div>
                      {expandedSections.incidentes ? <ChevronUp size={20} className="text-red-300" /> : <ChevronDown size={20} className="text-red-300" />}
                    </button>
                    {expandedSections.incidentes && (
                      <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3">
                          {(viewingItem.dadosSIPAC.incidentes || []).map((inc, i) => (
                            <div key={i} className="bg-red-50/30 rounded-3xl border border-red-100 p-6 space-y-4">
                              <div className="flex justify-between items-center border-b border-red-100/50 pb-3">
                                <div>
                                  <span className="text-[8px] font-black text-red-400 uppercase block mb-1">Documento Cancelado</span>
                                  <span className="text-xs font-black text-red-800 uppercase">{inc.tipoDocumento} • {inc.numeroDocumento}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[8px] font-black text-red-400 uppercase block mb-1">Data do Cancelamento</span>
                                  <span className="text-xs font-bold text-red-600">{inc.dataCancelamento}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1">
                                  <span className="text-[8px] font-black text-slate-400 uppercase block">Solicitado por</span>
                                  <p className="text-xs font-bold text-slate-700 uppercase italic">{inc.usuarioSolicitacao}</p>
                                  <p className="text-[9px] font-medium text-slate-400 uppercase">Em {inc.dataSolicitacao}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[8px] font-black text-slate-400 uppercase block">Cancelado por</span>
                                  <p className="text-xs font-bold text-slate-700 uppercase italic">{inc.usuarioCancelamento}</p>
                                  <p className="text-[9px] font-medium text-slate-400 uppercase">Em {inc.dataCancelamento}</p>
                                </div>
                              </div>

                              <div className="bg-white/60 p-4 rounded-2xl border border-red-100/50">
                                <span className="text-[8px] font-black text-red-400 uppercase block mb-2">Justificativa do Cancelamento</span>
                                <p className="text-xs text-slate-600 leading-relaxed italic font-medium">"{inc.justificativa}"</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Rodapé Interno */}
              <div className="flex items-center justify-center pt-10 text-slate-400 gap-4">
                <Info size={16} />
                <p className="text-xs font-bold italic tracking-wide">
                  Os dados acima são extraídos dinamicamente do portal público do SIPAC/IFES.
                </p>
              </div>

            </div>
          </main>
        </div>
      )}

      {/* Barra de Ações em Massa */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-slate-900/90 backdrop-blur-md text-white px-8 py-4 rounded-[32px] shadow-2xl border border-white/10 flex items-center gap-8 min-w-[500px] justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-ifes-green rounded-2xl flex items-center justify-center text-white font-black shadow-lg">
                {selectedIds.length}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Itens Selecionados</p>
                <p className="text-sm font-bold text-white">Pronto para aglomerar em processo único</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedIds([])}
                className="px-4 py-2 text-xs font-black text-slate-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkLink}
                className="bg-ifes-green hover:bg-emerald-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black transition-all shadow-lg flex items-center gap-2 active:scale-95"
              >
                <Link size={16} />
                Vincular Processo Único
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnualHiringPlan;
