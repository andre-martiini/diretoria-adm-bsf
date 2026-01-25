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
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  Timestamp
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
} from '../constants';
import {
  formatCurrency,
  formatDate
} from '../utils/formatters';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// Components
import ContractTable from './ContractTable';
import logoIfes from '../logo-ifes.png';

const AnnualHiringPlan: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_YEAR);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedRisk, setSelectedRisk] = useState<string>('Todos');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'valor', direction: 'desc' });
  const [activeInsight, setActiveInsight] = useState<'abc' | 'monthly'>('abc');
  const [pcaMeta, setPcaMeta] = useState<{ id: string, dataPublicacao: string } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/transparencia-pca`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Novos campos para item manual
  const [newItem, setNewItem] = useState<Partial<ContractItem>>({
    titulo: '',
    categoria: Category.Bens,
    valor: 0,
    inicio: new Date().toISOString().split('T')[0],
    area: 'Diretoria de Adm. e Planejamento'
  });

  const fetchData = useCallback(async (year: string) => {
    setLoading(true);
    try {
      // 1. Buscar dados oficiais (JSON)
      const api_url = `/data/pca_${year}.json`;
      const response = await fetch(api_url);
      let officialItems = [];

      if (response.ok) {
        const jsonData = await response.json();
        officialItems = jsonData.data || jsonData;
      }

      // 2. Buscar suplementos do Firestore (Empenho/Execução/Manuais)
      const q = query(collection(db, "pca_data"), where("ano", "==", year));
      const querySnapshot = await getDocs(q);
      const firestoreData: Record<string, any> = {};
      const manualItems: ContractItem[] = [];

      querySnapshot.forEach((doc) => {
        const d = doc.data();
        if (d.isManual) {
          manualItems.push({
            id: doc.id,
            titulo: d.titulo,
            categoria: d.categoria,
            valor: d.valor,
            valorExecutado: d.valorExecutado || 0,
            inicio: d.inicio,
            fim: d.fim || '',
            area: d.area,
            isManual: true
          });
        } else {
          firestoreData[d.officialId] = d;
        }
      });

      // 3. Mapear e Mesclar
      const mappedOfficial = (Array.isArray(officialItems) ? officialItems : []).map((item: any, index: number) => {
        const officialId = String(item.id || index);
        const pncpCategory = item.categoriaItemPcaNome || '';
        let categoria = Category.Bens;

        if (pncpCategory.includes('Serviço') || pncpCategory.includes('Obra')) {
          categoria = Category.Servicos;
        } else if (pncpCategory.includes('TIC')) {
          categoria = Category.TIC;
        }

        const valor = item.valorTotal || (item.valorUnitario || 0) * (item.quantidade || 0);
        const extra = firestoreData[officialId] || {};

        return {
          id: officialId,
          titulo: item.descricao || item.grupoContratacaoNome || "Item sem descrição",
          categoria: categoria,
          valor: valor,
          valorExecutado: extra.valorExecutado || 0,
          inicio: item.dataDesejada || new Date().toISOString().split('T')[0],
          fim: item.dataFim || '',
          area: item.nomeUnidade || "Diretoria de Adm. e Planejamento",
          isManual: false
        };
      });

      setData([...mappedOfficial, ...manualItems]);
      setUsingFallback(!response.ok && mappedOfficial.length === 0);

      if (officialItems.length > 0) {
        const firstItem = officialItems[0];
        setPcaMeta({
          id: `${firstItem.cnpj || CNPJ_IFES_BSF}-0-${String(firstItem.sequencialPca || '12').padStart(6, '0')}/${firstItem.anoPca || year}`,
          dataPublicacao: firstItem.dataPublicacaoPncp || firstItem.dataInclusao
        });
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      setData(FALLBACK_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedYear);
  }, [selectedYear, fetchData]);

  const processedData = useMemo(() => {
    const totalVal = data.reduce((acc, i) => acc + i.valor, 0);
    const sorted = [...data].sort((a, b) => b.valor - a.valor);
    let runningSum = 0;

    return sorted.map(item => {
      runningSum += item.valor;
      const ratio = runningSum / (totalVal || 1);
      let abc: 'A' | 'B' | 'C' = 'C';
      if (ratio <= 0.8) abc = 'A';
      else if (ratio <= 0.95) abc = 'B';

      const daysToStart = Math.ceil((new Date(item.inicio).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let risk: 'Baixo' | 'Médio' | 'Alto' = 'Baixo';
      if (daysToStart < 30) risk = 'Alto';
      else if (daysToStart < 60) risk = 'Médio';

      return { ...item, abcClass: abc, riskStatus: risk };
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
      totalExecutado: processedData.reduce((acc, i) => acc + (i.valorExecutado || 0), 0),
      monthlyPlan
    };
  }, [processedData]);

  const handleSaveValues = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const docId = editingItem.isManual ? String(editingItem.id) : `${selectedYear}-${editingItem.id}`;
      const docRef = doc(db, "pca_data", docId);

      await setDoc(docRef, {
        officialId: editingItem.isManual ? null : String(editingItem.id),
        ano: selectedYear,
        valorExecutado: editingItem.valorExecutado || 0,
        isManual: editingItem.isManual || false,
        updatedAt: Timestamp.now(),
        // Se for manual, salva os dados básicos também
        ...(editingItem.isManual ? {
          titulo: editingItem.titulo,
          categoria: editingItem.categoria,
          valor: editingItem.valor,
          inicio: editingItem.inicio,
          area: editingItem.area
        } : {})
      }, { merge: true });

      await fetchData(selectedYear);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar dados no Firestore.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddManualItem = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, "pca_data"), {
        ...newItem,
        ano: selectedYear,
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
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  };

  const chartData = useMemo(() => [
    { name: 'Bens', value: summary.materials.val, fill: '#10b981' },
    { name: 'Serviços', value: summary.services.val, fill: '#f59e0b' },
    { name: 'TIC', value: summary.tic.val, fill: '#3b82f6' }
  ], [summary]);

  const abcChartData = useMemo(() => {
    const sorted = [...processedData].sort((a, b) => b.valor - a.valor);
    let cumulativeValue = 0;
    const totalValue = summary.totalValue || 1;

    return sorted.map((item, index) => {
      cumulativeValue += item.valor;
      return {
        index,
        label: `Item ${index + 1}`,
        valor: item.valor,
        acumulado: (cumulativeValue / totalValue) * 100,
        classe: item.abcClass,
        fill: item.abcClass === 'A' ? '#0f172a' :
          item.abcClass === 'B' ? '#2f9e41' :
            '#e2e8f0'
      };
    });
  }, [processedData, summary.totalValue]);

  const filteredData = useMemo(() => {
    let result = [...processedData];

    if (selectedCategory !== 'Todas') {
      result = result.filter(item => item.categoria === selectedCategory);
    }
    if (selectedRisk !== 'Todos') {
      result = result.filter(item => item.riskStatus === selectedRisk);
    }
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.titulo.toLowerCase().includes(low) ||
        item.area.toLowerCase().includes(low)
      );
    }

    const sorted = result.sort((a, b) => {
      const aVal = a[sortConfig.key] || '';
      const bVal = b[sortConfig.key] || '';
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [processedData, searchTerm, selectedCategory, selectedRisk, sortConfig]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative">
      {/* Overlay de carregamento PNCP */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-3xl shadow-2xl border border-slate-100 flex flex-col items-center gap-6 max-w-sm text-center">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-emerald-50 border-t-emerald-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw size={24} className="text-emerald-500 animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Consultando Base PNCP</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed px-4">
                Sincronizando dados oficiais da plataforma do governo federal...
              </p>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-emerald-500 w-2/3 animate-[loading_1.5s_ease-in-out_infinite]"></div>
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
                <span className="text-sm sm:text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Gestão de PCA</span>
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
            {loading && <RefreshCw size={18} className="animate-spin text-ifes-green hidden sm:block" />}

            <button
              onClick={handleCopyLink}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all font-bold text-xs sm:text-sm border cursor-pointer ${copied
                ? 'bg-emerald-500 text-white border-emerald-500'
                : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
            >
              {copied ? <Check size={18} /> : <Link size={18} />}
              <span className="hidden md:inline">{copied ? 'Link Copiado!' : 'Link Público'}</span>
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

        {/* Zona 1: KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inv. Planejado Total</p>
                <h3 className="text-3xl font-black text-slate-900">{formatCurrency(summary.totalValue)}</h3>
              </div>
              <div className="bg-ifes-green/10 p-2 rounded-lg text-ifes-green">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="mt-6">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase mb-1">
                <span>Execução Financeira (Geral)</span>
                <span>{((summary.totalExecutado / (summary.totalValue || 1)) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-ifes-green transition-all duration-500"
                  style={{ width: `${(summary.totalExecutado / (summary.totalValue || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total Pago (Acumulado)</p>
                <h3 className="text-3xl font-black text-slate-900">{formatCurrency(summary.totalExecutado)}</h3>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg text-emerald-500">
                <Package size={20} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-6">
              <div className="bg-emerald-50 p-2 rounded-lg text-center border border-emerald-100">
                <span className="block text-[8px] font-black text-emerald-700 uppercase leading-tight">Bens</span>
                <span className="text-xs font-black text-emerald-600">{summary.materials.qtd}</span>
              </div>
              <div className="bg-amber-50 p-2 rounded-lg text-center border border-amber-100">
                <span className="block text-[8px] font-black text-amber-700 uppercase leading-tight">Serv.</span>
                <span className="text-xs font-black text-amber-600">{summary.services.qtd}</span>
              </div>
              <div className="bg-blue-50 p-2 rounded-lg text-center border border-blue-100">
                <span className="block text-[8px] font-black text-blue-700 uppercase leading-tight">TIC</span>
                <span className="text-xs font-black text-blue-600">{summary.tic.qtd}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Zona 2 e 3: Gráficos */}
        <div className="grid lg:grid-cols-2 gap-8 font-sans">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-2">Mapa de Alocação de Recursos</h3>
            <p className="text-xs text-slate-400 font-medium mb-6">Proporção visual por categoria de gasto</p>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
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
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6">
              {chartData.map(item => (
                <div key={item.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }}></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{item.name}</span>
                    <span className="text-xs font-bold text-slate-800">{(item.value / summary.totalValue * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {activeInsight === 'abc' ? 'Curva ABC (Pareto)' : 'Cronograma Mensal'}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {activeInsight === 'abc' ? 'Distribuição acumulada do investimento' : 'Previsão de empenho por mês'}
                </p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveInsight('abc')}
                  className={`p-2 rounded-lg transition-all ${activeInsight === 'abc' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Curva ABC"
                >
                  <Target size={18} />
                </button>
                <button
                  onClick={() => setActiveInsight('monthly')}
                  className={`p-2 rounded-lg transition-all ${activeInsight === 'monthly' ? 'bg-white shadow-sm text-ifes-green' : 'text-slate-400 hover:text-slate-600'}`}
                  title="Cronograma Mensal"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {activeInsight === 'abc' ? (
                  <BarChart data={abcChartData} barCategoryGap={0}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis hide dataKey="index" />
                    <YAxis
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(1)}%`, 'Acumulado']}
                      labelStyle={{ display: 'none' }}
                    />
                    <Bar dataKey="acumulado">
                      {abcChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart data={summary.monthlyPlan}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(v: number) => formatCurrency(v)}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar
                      dataKey="value"
                      fill="#2f9e41"
                      radius={[6, 6, 0, 0]}
                      barSize={24}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            {activeInsight === 'abc' && (
              <div className="mt-4 flex gap-4 justify-center">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-slate-800"></div> Classe A (80%)
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-ifes-green"></div> Classe B (15%)
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-slate-300"></div> Classe C (5%)
                </div>
              </div>
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
                value={selectedRisk}
                onChange={(e) => { setSelectedRisk(e.target.value); setCurrentPage(1); }}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-600 outline-none"
              >
                <option value="Todos">Risco: Todos</option>
                <option value="Alto">Alto Risco</option>
                <option value="Médio">Médio</option>
                <option value="Baixo">Baixo</option>
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
            onEdit={(item) => {
              setEditingItem(item);
              setIsEditModalOpen(true);
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
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Atualizar Status</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestão de Empenho e Execução</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-red-500">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Item Selecionado</p>
                <p className="text-sm font-bold text-slate-700 line-clamp-2">{editingItem.titulo}</p>
                <div className="mt-4 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Valor Planejado</span>
                  <span className="text-lg font-black text-ifes-green">{formatCurrency(editingItem.valor)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Valor Total Pago (Acumulado)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    className="w-full pl-9 pr-4 py-4 bg-white border border-slate-200 rounded-2xl text-lg font-black text-emerald-600 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm"
                    value={editingItem.valorExecutado}
                    onChange={(e) => setEditingItem({ ...editingItem, valorExecutado: Number(e.target.value) })}
                  />
                </div>
                <p className="text-[10px] font-bold text-slate-400 italic px-1 leading-relaxed">
                  * Insira o valor total que já foi efetivamente pago para este processo até o momento.
                </p>
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
                disabled={saving}
                className="flex-1 px-6 py-3 bg-ifes-green text-white rounded-2xl text-sm font-black hover:bg-emerald-600 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Alterações
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
    </div>
  );
};

export default AnnualHiringPlan;
