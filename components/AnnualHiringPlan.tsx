import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
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
  AlertTriangle,
  Eye,
  Download,
  Sparkles,
  List,
  Send,
  Bot,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  BarChart3,
  Tag,
  User,
  Clock,
  MapPin,
  Calendar
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
  Timestamp,
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import {
  ContractItem,
  SummaryData,
  Category,
  SortConfig,
  SIPACProcess,
  PCAMetadata
} from '../types';
import {
  FALLBACK_DATA,
  API_SERVER_URL,
  DEFAULT_YEAR,
  PCA_YEARS_MAP,
  CNPJ_IFES_BSF
} from '../constants';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';
import {
  formatCurrency,
  formatDate
} from '../utils/formatters';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  ComposedChart, Line
} from 'recharts';

import { fetchPcaData, hasPcaInMemoryCache, fetchLocalPcaSnapshot, updatePcaCache } from '../services/pcaService';

// Components
import ContractTable from './ContractTable';
import Toast, { ToastType } from './Toast';
import logoIfes from '../logo-ifes.png';
import { getProcessStatus, getStatusColor } from '../utils/processLogic';
import ProcessDashboard from './ProcessDashboard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { calculateHealthScore, deriveInternalPhase, linkItemsToProcess } from '../services/acquisitionService';

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';
import { findPncpPurchaseByProcess, fetchPncpPurchaseItems, PNCPPurchase, PNCPItem } from '../services/pncpService';

// Configuração do Worker do PDF.js via CDN para evitar problemas de bundler
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const AnnualHiringPlan: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [selectedYear, setSelectedYear] = useState<string>(DEFAULT_YEAR);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(10);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'valor', direction: 'desc' });
  const [pcaMeta, setPcaMeta] = useState<PCAMetadata | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContractItem | null>(null);

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const initConfig = async () => {
      const sysConfig = await fetchSystemConfig();
      setConfig(sysConfig);
      setSelectedYear(sysConfig.defaultYear);
      setLoadingConfig(false);
    };
    initConfig();
  }, []);

  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetchingSIPAC, setIsFetchingSIPAC] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [viewingDocMetadata, setViewingDocMetadata] = useState<{ ordem: string, tipo: string, url: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [isDespachosModalOpen, setIsDespachosModalOpen] = useState<boolean>(false);
  const [isFlashModalOpen, setIsFlashModalOpen] = useState<boolean>(false);
  const [despachosContent, setDespachosContent] = useState<{ tipo: string, data: string, texto: string, ordem: string }[]>([]);
  const [isLoadingDespachos, setIsLoadingDespachos] = useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [dashboardView, setDashboardView] = useState<'planning' | 'status'>('planning');
  const [viewingItem, setViewingItem] = useState<ContractItem | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    documentos: false,
    movimentacoes: false,
    interessados: false,
    incidentes: false,
    resumoIA: true
  });
  const [activeTab, setActiveTab] = useState<'planning' | 'documents' | 'history' | 'indicators' | 'pncp'>('planning');
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [isDocLoading, setIsDocLoading] = useState(false);
  const [isChartsVisible, setIsChartsVisible] = useState<boolean>(true);

  // PNCP States
  const [pncpMatch, setPncpMatch] = useState<PNCPPurchase | null>(null);
  const [pncpItems, setPncpItems] = useState<PNCPItem[]>([]);
  const [isLoadingPncp, setIsLoadingPncp] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (dashboardView === 'planning') {
      setChartsReady(false);
      const timer = setTimeout(() => {
        setChartsReady(true);
      }, 600);
      return () => clearTimeout(timer);
    } else {
      setChartsReady(false);
    }
  }, [dashboardView]);

  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [isItemsListModalOpen, setIsItemsListModalOpen] = useState(false);
  const [isPcaModalOpen, setIsPcaModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);

  const processedAISummaryRefs = useRef<Set<string>>(new Set());

  // Data Lake States
  const [lakeDocuments, setLakeDocuments] = useState<any[]>([]);
  const [isLakeModalOpen, setIsLakeModalOpen] = useState(false);
  const [selectedLakeDoc, setSelectedLakeDoc] = useState<any>(null);
  const [lakeDocUrl, setLakeDocUrl] = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [loadingLake, setLoadingLake] = useState(false);

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
      const localSnapshot = await fetchLocalPcaSnapshot(year);
      if (localSnapshot && localSnapshot.length > 0) {
        setData(localSnapshot);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    try {
      setSyncProgress(0);
      const result = await fetchPcaData(year, forceSync, false, (p) => setSyncProgress(p));

      if (result.data.length === 0) {
        setData(FALLBACK_DATA);
        setUsingFallback(true);
      } else {
        setData(result.data);
        setUsingFallback(false);
      }
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

  // Placeholder for missing function
  const generateAISummary = async (item: ContractItem) => {
    if (!item.dadosSIPAC) return;
    setIsGeneratingSummary(true);
    try {
      // Mock or basic implementation
      console.log("Generating summary for", item.id);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleOpenLakeDoc = (doc: any) => {
    setSelectedLakeDoc(doc);
    setLakeDocUrl(doc.downloadUrl || doc.url);
    setViewingDocMetadata({
      ordem: doc.sipacMetadata?.ordem || '0',
      tipo: doc.sipacMetadata?.tipo || 'Documento',
      url: doc.downloadUrl || doc.url
    });
    // For Lake docs, we might use the preview modal too if it's integrated, 
    // but the code currently sets isLakeModalOpen. 
    // Assuming the user wants consistency in the preview modal.
    setIsLakeModalOpen(true);
  };

  // Prevenir scroll do body quando modal está aberto
  useEffect(() => {
    if (isDetailsModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isDetailsModalOpen]);

  // Trigger para resumo IA em segundo plano quando visualiza o processo
  useEffect(() => {
    if (isDetailsModalOpen && viewingItem?.dadosSIPAC) {
      generateAISummary(viewingItem);
    }
  }, [isDetailsModalOpen, viewingItem]);

  // Trigger para busca no PNCP quando visualiza o processo
  useEffect(() => {
    if (isDetailsModalOpen && viewingItem?.protocoloSIPAC) {
      const fetchDataPncp = async () => {
        setIsLoadingPncp(true);
        // Não limpamos o match imediatamente para evitar flicker se for o mesmo, 
        // mas aqui estamos abrindo um novo modal ou mudando de item, então faz sentido resetar.
        setPncpMatch(null);
        setPncpItems([]);

        try {
          const match = await findPncpPurchaseByProcess(selectedYear, viewingItem.protocoloSIPAC!);
          if (match) {
            setPncpMatch(match);
            const items = await fetchPncpPurchaseItems(match.anoCompra, match.numeroCompra);
            setPncpItems(items);
          }
        } catch (err) {
          console.error("Erro ao buscar dados PNCP:", err);
        } finally {
          setIsLoadingPncp(false);
        }
      };
      fetchDataPncp();
    } else {
      setPncpMatch(null);
      setPncpItems([]);
    }
  }, [isDetailsModalOpen, viewingItem, selectedYear]);

  // Clean up selected document when modal closes
  useEffect(() => {
    if (!isDetailsModalOpen) {
      setSelectedDoc(null);
    }
  }, [isDetailsModalOpen]);

  const handleViewSIPACDoc = (doc: any) => {
    // Usamos o proxy para evitar problemas de X-Frame-Options e autenticação do SIPAC
    setIsPreviewLoading(true);
    const proxyUrl = `${API_SERVER_URL}/api/proxy/pdf?url=${encodeURIComponent(doc.url)}`;
    setViewingDocMetadata({
      ordem: doc.ordem,
      tipo: doc.tipo,
      url: doc.url
    });
    setPreviewUrl(proxyUrl);
  };

  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    let sorted = [...data];

    return sorted.map(item => {
      const daysToStart = Math.ceil((new Date(item.inicio).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      let risk: 'Baixo' | 'Médio' | 'Alto' = 'Baixo';

      if (daysToStart < 30) risk = 'Alto';
      else if (daysToStart < 60) risk = 'Médio';

      const computedStatus = getProcessStatus(item);

      let computedSituation = 'Previsto';
      if (item.protocoloSIPAC) {
        computedSituation = 'Em Execução';
      } else if (new Date() > new Date(item.inicio)) {
        computedSituation = 'Atrasado';
      } else {
        computedSituation = 'Previsto';
      }

      return { ...item, riskStatus: risk, computedStatus, computedSituation };
    });
  }, [data]);

  const summary = useMemo<SummaryData>(() => {
    const materials = processedData.filter(i => i.categoria === Category.Bens);
    const services = processedData.filter(i => i.categoria === Category.Servicos);
    const tic = processedData.filter(i => i.categoria === Category.TIC);

    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthlyPlan = months.map((m, idx) => {
      const filtered = processedData.filter(i => {
        let dateToUse = new Date(i.inicio);
        if (i.dadosSIPAC?.dataAutuacion) {
          const [day, month, year] = i.dadosSIPAC.dataAutuacion.split('/');
          dateToUse = new Date(Number(year), Number(month) - 1, Number(day));
        }
        return dateToUse.getMonth() === idx;
      });
      const val = filtered.reduce((acc, i) => acc + i.valor, 0);
      const count = filtered.length;
      return { month: m, value: val, count };
    });

    return {
      totalValue: processedData.reduce((acc, i) => acc + i.valor, 0),
      totalItems: processedData.length,
      materials: { qtd: materials.length, val: materials.reduce((acc, i) => acc + i.valor, 0) },
      tic: { qtd: tic.length, val: tic.reduce((acc, i) => acc + i.valor, 0) },
      services: { qtd: services.length, val: services.reduce((acc, i) => acc + i.valor, 0) },
      obras: { qtd: 0, val: 0 },
      totalExecutado: processedData.filter(i => i.protocoloSIPAC).length,
      totalDelayed: processedData.filter(i => !i.protocoloSIPAC && new Date(i.inicio) < new Date()).length,
      monthlyPlan
    };
  }, [processedData]);

  const handleSaveValues = async () => {
    if (!editingItem) return;
    setSaving(true);
    setToast(null);

    try {
      if (editingItem.id === 'bulk-selection') {
        const itemIds = selectedIds.map(id => String(id));
        if (editingItem.dadosSIPAC && editingItem.protocoloSIPAC) {
          await linkItemsToProcess(editingItem.protocoloSIPAC, itemIds, editingItem.dadosSIPAC);
        }
        setData(prev => prev.map(item =>
          selectedIds.includes(String(item.id))
            ? {
              ...item,
              protocoloSIPAC: editingItem.protocoloSIPAC,
              dadosSIPAC: editingItem.dadosSIPAC ? {
                ...editingItem.dadosSIPAC,
                fase_interna_status: deriveInternalPhase(editingItem.dadosSIPAC.unidadeAtual || ''),
                health_score: calculateHealthScore(editingItem.dadosSIPAC.movimentacoes?.[0]?.data || editingItem.dadosSIPAC.dataAutuacion).score
              } : null
            }
            : item
        ));
        setToast({ message: `Agrupamento realizado com sucesso.`, type: "success" });
        setSelectedIds([]);
      } else {
        if (editingItem.dadosSIPAC && editingItem.protocoloSIPAC) {
          await linkItemsToProcess(editingItem.protocoloSIPAC, [String(editingItem.id)], editingItem.dadosSIPAC);
        } else {
          const docId = editingItem.isManual ? String(editingItem.id) : `${selectedYear}-${editingItem.id}`;
          const safeDocId = docId.replace(/\//g, '-');
          const docRef = doc(db, "pca_data", safeDocId);
          await setDoc(docRef, { ...editingItem, updatedAt: Timestamp.now() }, { merge: true });
        }

        const internalPhase = editingItem.dadosSIPAC ? deriveInternalPhase(editingItem.dadosSIPAC.unidadeAtual || '') : undefined;
        const health = editingItem.dadosSIPAC ? calculateHealthScore(editingItem.dadosSIPAC.movimentacoes?.[0]?.data || editingItem.dadosSIPAC.dataAutuacion).score : undefined;

        setData(prevData => prevData.map(item =>
          String(item.id) === String(editingItem.id) ? {
            ...item,
            ...editingItem,
            dadosSIPAC: editingItem.dadosSIPAC ? {
              ...editingItem.dadosSIPAC,
              fase_interna_status: internalPhase,
              health_score: health
            } : null
          } : item
        ));
        setToast({ message: "Item atualizado.", type: "success" });
      }
      setIsEditModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkLink = () => {
    const selectedItems = data.filter(i => selectedIds.includes(String(i.id)));
    if (selectedItems.length === 0) return;
    const totalValue = selectedItems.reduce((acc, i) => acc + i.valor, 0);
    const dummyItem: ContractItem = {
      id: 'bulk-selection',
      titulo: `Aglomeração de ${selectedItems.length} itens`,
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
    if (!window.confirm("Remover vínculo?")) return;
    setSaving(true);
    try {
      const docId = item.isManual ? String(item.id) : `${selectedYear}-${item.id}`;
      const safeDocId = docId.replace(/\//g, '-');
      const docRef = doc(db, "pca_data", safeDocId);
      await setDoc(docRef, { protocoloSIPAC: '', dadosSIPAC: null, updatedAt: Timestamp.now() }, { merge: true });

      setData(prevData => prevData.map(i =>
        String(i.id) === String(item.id) ? { ...i, protocoloSIPAC: '', dadosSIPAC: null } : i
      ));

      if (viewingItem && String(viewingItem.id) === String(item.id)) {
        setViewingItem({ ...viewingItem, protocoloSIPAC: '', dadosSIPAC: null });
        setIsDetailsModalOpen(false);
      }
      setToast({ message: "Vínculo removido.", type: "success" });
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
        dadosSIPAC: { ...sipacData, ultimaAtualizacao: new Date().toLocaleString() }
      };

      if (sipacData.scraping_last_error) {
        setToast({ message: `Erro no SIPAC: ${sipacData.scraping_last_error}`, type: "error" });
        if (isFromDetails) setViewingItem(updatedItem);
        else setEditingItem(updatedItem);
        return;
      }

      if (isFromDetails) {
        setViewingItem(updatedItem);
        const targetIds = item.isGroup && item.childItems ? item.childItems.map(c => String(c.id)) : [String(item.id)];
        await linkItemsToProcess(item.protocoloSIPAC, targetIds, updatedItem.dadosSIPAC!);

        const metrics = calculateHealthScore(updatedItem.dadosSIPAC!.movimentacoes?.[0]?.data || updatedItem.dadosSIPAC!.dataAutuacion);
        const enhancedSipacData = {
          ...updatedItem.dadosSIPAC!,
          fase_interna_status: deriveInternalPhase(updatedItem.dadosSIPAC!.unidadeAtual || ''),
          health_score: metrics.score,
          dias_sem_movimentacao: metrics.daysIdle
        };

        setData(prev => prev.map(i => String(i.id) === String(item.id) ? { ...updatedItem, dadosSIPAC: enhancedSipacData } : i));
        targetIds.forEach(id => updatePcaCache(selectedYear, id, { dadosSIPAC: updatedItem.dadosSIPAC }));
        setToast({ message: "Dados atualizados!", type: "success" });
      } else {
        setEditingItem(updatedItem);
      }
    } catch (err) {
      console.error("Erro SIPAC:", err);
      alert("Erro ao buscar protocolo.");
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
      setNewItem({ titulo: '', categoria: Category.Bens, valor: 0, inicio: new Date().toISOString().split('T')[0], area: 'Diretoria de Adm. e Planejamento' });
      setToast({ message: "Demanda registrada!", type: "success" });
    } catch (err) {
      console.error("Erro ao adicionar:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm("Excluir item manual?")) return;
    try {
      await deleteDoc(doc(db, "pca_data", id));
      await fetchData(selectedYear);
      setToast({ message: "Item excluído.", type: "success" });
    } catch (err) {
      console.error("Erro ao deletar:", err);
    }
  };

  const chartData = useMemo(() => [
    { name: 'Bens', value: summary.materials.val, fill: '#10b981' },
    { name: 'Serviços', value: summary.services.val, fill: '#f59e0b' },
    { name: 'TIC', value: summary.tic.val, fill: '#3b82f6' }
  ], [summary]);

  const activeData = useMemo(() => {
    let base = [...processedData];
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      base = base.filter(i => i.titulo.toLowerCase().includes(low) || i.area.toLowerCase().includes(low));
    }
    if (selectedCategory !== 'Todas') base = base.filter(i => i.categoria === selectedCategory);
    if (statusFilter !== 'Todos') base = base.filter(i => i.computedStatus === statusFilter);

    const sortFn = (a: ContractItem, b: ContractItem) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      if (typeof valA === 'string' && typeof valB === 'string') return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      if (typeof valA === 'number' && typeof valB === 'number') return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      return 0;
    };

    if (dashboardView === 'planning') return base.sort(sortFn);
    else {
      const processItems = base.filter(i => i.protocoloSIPAC && i.protocoloSIPAC.length > 5);
      const groups: Record<string, ContractItem[]> = {};
      processItems.forEach(item => {
        const proto = item.protocoloSIPAC as string;
        if (!groups[proto]) groups[proto] = [];
        groups[proto].push(item);
      });
      const result = Object.values(groups).map(items => {
        const first = items[0];
        const totalValue = items.reduce((acc, i) => acc + i.valor, 0);
        return {
          ...first,
          id: `process-group-${first.protocoloSIPAC}`,
          titulo: first.titulo,
          valor: totalValue,
          isGroup: true,
          itemCount: items.length,
          childItems: items
        } as ContractItem;
      });
      return result.sort(sortFn);
    }
  }, [processedData, dashboardView, searchTerm, selectedCategory, statusFilter, sortConfig]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeData.slice(start, start + itemsPerPage);
  }, [activeData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(activeData.length / itemsPerPage);
  const closeToast = () => setToast(null);

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative font-sans">
      {toast && <Toast message={toast.message} type={toast.type} onClose={closeToast} />}
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/70 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col items-center gap-8 max-w-sm text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 bg-ifes-green/10 w-full"><div className="h-full bg-ifes-green transition-all duration-500 ease-out" style={{ width: `${syncProgress}%` }}></div></div>
            <div className="relative"><RefreshCw className="w-16 h-16 animate-spin text-ifes-green" /><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-black text-slate-800 leading-none">{Math.round(syncProgress)}%</span></div></div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Carregando</h3>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="w-full px-6 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <img src={logoIfes} alt="Logo IFES" className="h-10 sm:h-14 w-auto object-contain" />
              <div className="flex flex-col border-l border-slate-100 pl-3 sm:pl-4">
                <span className="text-sm sm:text-base font-black text-ifes-green uppercase leading-none tracking-tight">Gestão de Contratações</span>
                <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Campus BSF</span>
              </div>
            </div>
            <div className="border-l border-slate-100 pl-3 ml-3 md:pl-6 md:ml-6">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setDashboardView('planning')} className={`px-2 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-black transition-all ${dashboardView === 'planning' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-400 hover:text-slate-600'}`}>PCA</button>
                <button onClick={() => setDashboardView('status')} className={`px-2 md:px-4 py-2 rounded-lg text-[10px] md:text-xs font-black transition-all ${dashboardView === 'status' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-400 hover:text-slate-600'}`}>Processos</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <select value={selectedYear} onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }} className="bg-ifes-green/5 text-ifes-green border border-ifes-green/20 rounded-md px-2 py-1 text-xs font-black outline-none focus:ring-2 focus:ring-ifes-green/40 transition-all cursor-pointer">
                {Object.keys(config?.pcaYearsMap || PCA_YEARS_MAP).sort((a, b) => b.localeCompare(a)).map(year => (<option key={year} value={year}>{year}</option>))}
              </select>
            </div>
            <button onClick={() => fetchData(selectedYear, true)} disabled={isSyncing} className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all border border-blue-200 cursor-pointer disabled:opacity-50"><RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} /></button>
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-xs border border-slate-100 hover:border-ifes-green/20 cursor-pointer"><LayoutDashboard size={18} /><span className="hidden md:inline">Menu Princ.</span></button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1920px] px-6 mx-auto py-8 space-y-8">
        {dashboardView === 'planning' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-ifes-green/30 transition-all flex flex-col">
                <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                  <FileSpreadsheet size={80} className="text-ifes-green" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="p-2 bg-ifes-green/10 rounded-lg text-ifes-green">
                      <Target size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                        Plano de Contratação Anual (PCA)
                      </h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Metadados Oficiais PNCP</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="px-4 border-l border-slate-100 first:border-l-0">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Sequencial</span>
                      <span className="text-[11px] font-black text-slate-700 block truncate font-mono">
                        {pcaMeta?.sequencialPca || '---'}
                      </span>
                    </div>
                    <div className="px-4 border-l border-slate-100">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Situação</span>
                      <span className="text-[9px] font-black text-emerald-600 uppercase flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {pcaMeta?.situacao || 'Ativo'}
                      </span>
                    </div>
                    <div className="px-4 border-l border-slate-100">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Poder/Esfera</span>
                      <span className="text-[9px] font-black text-slate-600 uppercase">
                        {pcaMeta?.poder || 'Exec'}/{pcaMeta?.esfera || 'Fed'}
                      </span>
                    </div>
                    <div className="px-4 border-l border-slate-100 col-span-2 md:col-span-1">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Última Atualização</span>
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {pcaMeta?.dataAtualizacao ? formatDate(pcaMeta.dataAtualizacao) : '---'}
                      </span>
                    </div>
                    <div className="px-4 border-l border-slate-100 hidden md:block">
                      <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Campus / Unidade</span>
                      <span className="text-[10px] font-black text-slate-700 block truncate" title={pcaMeta?.unidadeSubordinada}>
                        {pcaMeta?.unidadeSubordinada || 'BSF'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0 pl-6 border-l border-slate-100">
                    <span className="text-[8px] font-black text-ifes-green uppercase tracking-widest mb-0.5">Total Estimado</span>
                    <span className="text-xl font-black text-slate-900 tracking-tighter">
                      {formatCurrency(pcaMeta?.valorTotalEstimado || summary.totalValue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Seção de Controle de Gráficos */}
            <div className="flex items-center gap-3 py-2">
              <div className="h-px flex-1 bg-slate-200" />
              <button
                onClick={() => setIsChartsVisible(!isChartsVisible)}
                className="flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm hover:border-ifes-green/50 hover:text-ifes-green transition-all group"
              >
                <BarChart3 size={14} className="text-slate-400 group-hover:text-ifes-green" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-hover:text-ifes-green">
                  {isChartsVisible ? "Ocultar Dashboards Analíticos" : "Exibir Dashboards Analíticos"}
                </span>
                {isChartsVisible ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className={`grid grid-cols-1 lg:grid-cols-5 gap-6 ${isChartsVisible ? 'min-h-[400px]' : ''}`}>
              {isChartsVisible && (
                <>
                  <div className="lg:col-span-3 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                        <RefreshCw size={14} className="text-blue-500" /> Cronograma de Contratação
                      </h3>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-ifes-green" />
                          <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Início do Processo</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-full h-[300px] relative">
                      {chartsReady && (
                        <ResponsiveContainer width="99%" height="100%" debounce={50}>
                          <ComposedChart data={summary.monthlyPlan}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                            <YAxis yAxisId="left" hide />
                            <YAxis yAxisId="right" orientation="right" hide />
                            <Tooltip
                              formatter={(v: number, name: string) => name === 'value' ? [formatCurrency(v), 'Valor Estimado'] : [v, 'Qtd. Início Proc.']}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '10px' }} />
                            <Bar yAxisId="left" dataKey="value" name="Valor Estimado" fill="#2f9e41" radius={[4, 4, 0, 0]} barSize={24} />
                            <Bar yAxisId="right" dataKey="count" name="Qtd. Processos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-w-0 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                        <PieChartIcon size={14} className="text-ifes-green" /> Distribuição por Categoria
                      </h3>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{summary.totalItems} Itens</span>
                    </div>
                    <div className="w-full flex-1 relative min-h-[300px]">
                      {chartsReady && (
                        <ResponsiveContainer width="99%" height="100%" debounce={50}>
                          <PieChart>
                            <Pie data={chartData} cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={5} dataKey="value" stroke="none">
                              {chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}
                            </Pie>
                            <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {dashboardView === 'status' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><ProcessDashboard data={activeData} /></div>}

        <div className={`bg-white rounded-2xl border ${dashboardView === 'planning' ? 'border-slate-200' : 'border-blue-100'} shadow-sm overflow-hidden flex flex-col font-sans mb-20`}>
          <div className={`p-6 border-b ${dashboardView === 'planning' ? 'border-slate-100 bg-slate-50/30' : 'border-blue-100 bg-blue-50/30'} flex flex-col md:flex-row items-center justify-between gap-6`}>
            <div><h2 className={`text-xl font-black ${dashboardView === 'planning' ? 'text-slate-800' : 'text-blue-900'} tracking-tight`}>{dashboardView === 'planning' ? 'Detalhamento do Plano (PNCP)' : 'Processos em Andamento'}</h2><p className={`text-[10px] font-bold ${dashboardView === 'planning' ? 'text-slate-400' : 'text-blue-400'} uppercase tracking-widest mt-1 italic`}>{dashboardView === 'planning' ? `Lista completa de itens importados do PNCP - Ano ${selectedYear}` : 'Listagem de processos com protocolo SIPAC vinculado'}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} /><input type="text" placeholder="Buscar por descrição ou área..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-ifes-green/20 transition-all" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} /></div>
              <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-700 transition-colors shadow-sm"><Plus size={16} /><span>Nova Demanda</span></button>
            </div>
          </div>

          {/* Paginação Superior */}
          {!loading && totalPages > 1 && (
            <div className={`px-6 py-4 border-b ${dashboardView === 'planning' ? 'border-slate-50 bg-slate-50/10' : 'border-blue-50 bg-blue-50/10'} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-9 w-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50 text-slate-500 transition-all cursor-pointer"><ChevronLeft size={16} /></button>
                <div className="px-4 h-9 flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
                  <span className="text-xs font-black text-slate-600 uppercase">Página <span className="text-ifes-green mx-1">{currentPage}</span> de {totalPages}</span>
                </div>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-9 w-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50 text-slate-500 transition-all cursor-pointer"><ChevronRight size={16} /></button>
              </div>
              <span className="text-[10px] font-bold text-slate-400 italic">Exibindo {pagedData.length} de {activeData.length} itens</span>
            </div>
          )}
          <ContractTable
            viewMode={dashboardView}
            data={pagedData}
            loading={loading}
            onSort={(key) => { const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'; setSortConfig({ key, direction }); }}
            sortConfig={sortConfig}
            selectedIds={selectedIds}
            onToggleSelection={(id) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); }}
            onToggleAll={() => { const allIds = pagedData.map(i => String(i.id)); if (allIds.every(id => selectedIds.includes(id))) { setSelectedIds(prev => prev.filter(id => !allIds.includes(id))); } else { setSelectedIds(prev => [...prev, ...allIds]); } }}
            onEdit={(item) => { setEditingItem(item); setIsEditModalOpen(true); }}
            onViewDetails={(item) => { setViewingItem(item); setActiveTab('planning'); setIsDetailsModalOpen(true); }}
            onViewPcaDetails={(item) => { setViewingItem(item); setIsPcaModalOpen(true); }}
            onViewSummary={(item) => { setViewingItem(item); setIsFlashModalOpen(true); }}
          />
          {!loading && totalPages > 1 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-9 w-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50 text-slate-500 transition-all cursor-pointer"><ChevronLeft size={16} /></button>
                <div className="px-4 h-9 flex items-center bg-white border border-slate-200 rounded-lg shadow-sm">
                  <span className="text-xs font-black text-slate-600 uppercase">Página <span className="text-ifes-green mx-1">{currentPage}</span> de {totalPages}</span>
                </div>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-9 w-9 flex items-center justify-center border border-slate-200 rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50 text-slate-500 transition-all cursor-pointer"><ChevronRight size={16} /></button>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic font-mono">Total: {activeData.length} registros</span>
            </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">
                    {viewingDocMetadata?.ordem || '0'} - {viewingDocMetadata?.tipo || 'Visualizando Documento'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Portal SIPAC • Visualização Integrada</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.open(`${API_SERVER_URL}/api/proxy/pdf?url=${encodeURIComponent(viewingDocMetadata?.url || '')}`, '_blank')}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-700 transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
                  title="Baixar Documento"
                >
                  <Download size={14} /> Baixar PDF
                </button>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-50 transition-all flex items-center gap-2">
                  <ExternalLink size={14} /> Abrir Original
                </a>
                <button
                  onClick={() => {
                    setPreviewUrl(null);
                    setViewingDocMetadata(null);
                    setIsPreviewLoading(false);
                  }}
                  className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-800 relative group">
              {isPreviewLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                  <RefreshCw size={48} className="animate-spin text-white mb-4" />
                  <span className="text-white font-black uppercase tracking-widest text-[10px]">Acessando Portal SIPAC...</span>
                </div>
              )}
              <iframe
                src={previewUrl}
                className="w-full h-full border-none bg-white"
                title="Preview do Documento"
                onLoad={() => setIsPreviewLoading(false)}
              />
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
            <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-5">
                <div className="p-2 bg-ifes-blue/10 rounded-2xl text-ifes-blue">
                  <Plus size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Nova Demanda</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registro Manual de Contratação</p>
                </div>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"
              >
                <X size={28} />
              </button>
            </header>

            <div className="p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Descrição Curta da Necessidade</label>
                <textarea
                  className="w-full px-6 py-4 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all shadow-sm"
                  rows={3}
                  placeholder="Ex: Aquisição emergencial de suprimentos para laboratório..."
                  value={newItem.titulo}
                  onChange={(e) => setNewItem({ ...newItem, titulo: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Categoria de Compra</label>
                  <div className="relative">
                    <select
                      className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-black outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all appearance-none cursor-pointer"
                      value={newItem.categoria}
                      onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value as Category })}
                    >
                      <option value={Category.Bens}>🏢 Bens (Materiais)</option>
                      <option value={Category.Servicos}>🛠️ Serviços</option>
                      <option value={Category.TIC}>💻 Tecnologia (TIC)</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Estimativa de Investimento</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                    <input
                      type="number"
                      className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-black outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all"
                      value={newItem.valor}
                      onChange={(e) => setNewItem({ ...newItem, valor: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Cronograma Desejado</label>
                  <input
                    type="date"
                    className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-black outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all"
                    value={newItem.inicio}
                    onChange={(e) => setNewItem({ ...newItem, inicio: e.target.value })}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Unidade Responsável</label>
                  <input
                    type="text"
                    className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-bold outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all"
                    value={newItem.area}
                    onChange={(e) => setNewItem({ ...newItem, area: e.target.value })}
                  />
                </div>
              </div>

              <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 flex gap-4 items-center">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                  <AlertCircle size={20} />
                </div>
                <p className="text-[10px] font-black text-amber-800 leading-relaxed uppercase tracking-tight">
                  Nota: Demandas manuais não consultam o banco oficial do PNCP automaticamente.
                </p>
              </div>
            </div>

            <footer className="p-8 bg-slate-50/80 border-t border-slate-100 flex gap-4 backdrop-blur-sm">
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="flex-1 px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-black hover:bg-slate-100 hover:text-slate-800 transition-all uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddManualItem}
                disabled={saving}
                className="flex-[2] px-8 py-4 bg-ifes-blue text-white rounded-lg text-xs font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-widest"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={3} />}
                Prontinho! Registrar Demanda
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal de Detalhes SIPAC - FULL PAGE EDITION */}
      {
        isDetailsModalOpen && viewingItem && viewingItem.dadosSIPAC && (
          <div className="fixed inset-0 z-50 bg-white animate-in fade-in duration-200">
            <div className="w-full h-full overflow-hidden font-sans flex flex-col">

              {/* HERO HEADER */}
              <header className="shrink-0 bg-white border-b border-slate-200 z-20 relative">
                {/* Top Info Block */}
                <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-50/30">

                  {/* Bloco 1: Identidade do Processo (Esquerda) - col-span-4 */}
                  <div className="lg:col-span-4 flex flex-col justify-center">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
                        {viewingItem.dadosSIPAC.numeroProcesso}
                      </h2>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide
                         ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'bg-').replace('700', '100').replace('600', '100')}
                         ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'text-').replace('700', '700').replace('600', '700')}
                       `}>
                        {getProcessStatus(viewingItem)}
                      </span>
                    </div>
                    <div className="group relative">
                      <p className="text-xs font-bold text-slate-500 line-clamp-2 uppercase leading-relaxed cursor-help">
                        {viewingItem.dadosSIPAC.assuntoDescricao}
                      </p>
                      <div className="hidden group-hover:block absolute top-full left-0 z-50 bg-slate-800 text-white p-2 rounded-lg text-xs w-64 mt-2 shadow-xl">
                        {viewingItem.dadosSIPAC.assuntoDescricao}
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Metadados Chave (Centro) - col-span-5 */}
                  <div className="lg:col-span-5 grid grid-cols-2 gap-4 border-l border-slate-200 pl-8">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Building2 size={10} /> Unidade Atual
                      </span>
                      <p className="text-xs font-bold text-slate-700 truncate" title={viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0 ? viewingItem.dadosSIPAC.movimentacoes[0].unidadeDestino : viewingItem.dadosSIPAC.unidadeOrigem}>
                        {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                          ? viewingItem.dadosSIPAC.movimentacoes[0].unidadeDestino
                          : viewingItem.dadosSIPAC.unidadeOrigem}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Clock size={10} /> Última Movimentação
                      </span>
                      <p className="text-xs font-bold text-slate-700">
                        {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                          ? [...viewingItem.dadosSIPAC.movimentacoes].sort((a, b) => new Date(b.data.split('/').reverse().join('-')).getTime() - new Date(a.data.split('/').reverse().join('-')).getTime())[0].data
                          : 'Recente'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Tag size={10} /> Natureza
                      </span>
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {viewingItem.dadosSIPAC.natureza || 'OSTENSIVO'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <User size={10} /> Autuado por
                      </span>
                      <p className="text-xs font-bold text-slate-700 truncate uppercase" title={viewingItem.dadosSIPAC.usuarioAutuacion}>
                        {viewingItem.dadosSIPAC.usuarioAutuacion?.split(' ')[0]}...
                      </p>
                    </div>
                  </div>

                  {/* Bloco 3: Interessados e Ações (Direita) - col-span-3 */}
                  <div className="lg:col-span-3 flex flex-col items-end gap-3 border-l border-slate-200 pl-8">

                    {/* Actions Toolbar */}
                    <div className="flex items-center gap-1">
                      {(viewingItem.dadosSIPAC as any).id && (
                        <a
                          href={`https://sipac.ifes.edu.br/public/jsp/processos/processo_detalhado.jsf?id=${(viewingItem.dadosSIPAC as any).id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Abrir no SIPAC (Link Direto)"
                        >
                          <ExternalLink size={18} />
                        </a>
                      )}
                      <button
                        onClick={() => { setIsDetailsModalOpen(false); setEditingItem(viewingItem); setIsEditModalOpen(true); }}
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                        title="Editar Vínculo"
                      >
                        <Link size={18} />
                      </button>
                      <button
                        onClick={() => setIsDetailsModalOpen(false)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Fechar"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Stakeholders Stack */}
                    <div className="flex flex-col items-end group relative cursor-help">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Interessados</span>
                      <div className="flex -space-x-2">
                        {(viewingItem.dadosSIPAC.interessados || []).slice(0, 3).map((person, idx) => (
                          <div key={idx} className="w-8 h-8 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-indigo-700 uppercase" title={person.nome}>
                            {person.nome.substring(0, 2)}
                          </div>
                        ))}
                        {(viewingItem.dadosSIPAC.interessados || []).length > 3 && (
                          <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500">
                            +{viewingItem.dadosSIPAC.interessados.length - 3}
                          </div>
                        )}
                      </div>
                      {/* Tooltip for Stakeholders */}
                      <div className="hidden group-hover:block absolute top-full right-0 z-50 bg-white border border-slate-200 p-4 rounded-xl shadow-xl w-72 mt-2">
                        <h4 className="text-xs font-black text-slate-800 uppercase mb-3 border-b border-slate-100 pb-2">Lista de Interessados</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {(viewingItem.dadosSIPAC.interessados || []).map((p, i) => (
                            <div key={i} className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-700">{p.nome}</span>
                              <span className="text-[8px] font-medium text-slate-400 uppercase">{p.tipo}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* TAB NAVIGATION */}
                <nav className="flex items-center px-8 gap-8 border-t border-slate-100 bg-white overflow-x-auto scroller-hide">
                  <button
                    onClick={() => setActiveTab('planning')}
                    className={`flex items-center gap-2 py-4 border-b-2 text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap
                       ${activeTab === 'planning' ? 'border-ifes-green text-ifes-green' : 'border-transparent text-slate-400 hover:text-slate-600'}
                     `}
                  >
                    <LayoutDashboard size={14} /> Dados PCA
                  </button>

                  <button
                    onClick={() => setActiveTab('documents')}
                    className={`flex items-center gap-2 py-4 border-b-2 text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap
                       ${activeTab === 'documents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}
                     `}
                  >
                    <FileText size={14} /> Documentos & Atas
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === 'documents' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                      {(viewingItem.dadosSIPAC.documentos || []).length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center gap-2 py-4 border-b-2 text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap
                       ${activeTab === 'history' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}
                     `}
                  >
                    <History size={14} /> Histórico de Tramitação
                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${activeTab === 'history' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                      {(viewingItem.dadosSIPAC.movimentacoes || []).length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('indicators')}
                    className={`flex items-center gap-2 py-4 border-b-2 text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap
                       ${activeTab === 'indicators' ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-400 hover:text-slate-600'}
                     `}
                  >
                    <BarChart3 size={14} /> Indicadores
                  </button>

                  {!isLoadingPncp && pncpMatch && (
                    <button
                      onClick={() => setActiveTab('pncp')}
                      className={`flex items-center gap-2 py-4 border-b-2 text-xs font-black uppercase tracking-wide transition-all whitespace-nowrap
                        ${activeTab === 'pncp' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}
                      `}
                    >
                      <TrendingUp size={14} /> Licitação & Edital
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] bg-emerald-100 text-emerald-700 animate-pulse">
                        LIVE
                      </span>
                    </button>
                  )}

                  {isLoadingPncp && (
                    <div className="flex items-center gap-2 py-4 text-xs font-black text-slate-300 uppercase tracking-wide">
                      <RefreshCw size={14} className="animate-spin" /> Consultando PNCP...
                    </div>
                  )}
                </nav>
              </header>


              <main className="flex-1 overflow-y-auto bg-slate-50/50 p-8 scroll-smooth">
                {activeTab === 'planning' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto space-y-6">
                    {/* 1. Planning Overview Header - Highlight Financials */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-ifes-green transition-all">
                        <div className="flex items-start justify-between">
                          <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><DollarSign size={20} /></span>
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Valor Planejado</span>
                        </div>
                        <div className="mt-4">
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(viewingItem.valor)}</h3>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">Custo Estimado Total</p>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div className="flex items-start justify-between">
                          <span className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Package size={20} /></span>
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Quantidade</span>
                        </div>
                        <div className="mt-4">
                          <h3 className="text-2xl font-black text-slate-900 tracking-tight">{viewingItem.quantidade} <span className="text-sm text-slate-400 font-bold">{viewingItem.unidadeMedida}</span></h3>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">Volume de Aquisição</p>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                        <div className="flex items-start justify-between">
                          <span className="p-2 bg-purple-50 text-purple-500 rounded-lg"><Target size={20} /></span>
                          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Previsão</span>
                        </div>
                        <div className="mt-4">
                          <h3 className="text-base font-black text-slate-900 tracking-tight">{formatDate(viewingItem.inicio)}</h3>
                          <p className="text-[10px] font-bold text-slate-400 mt-1">Data Desejada de Início</p>
                        </div>
                      </div>
                    </div>

                    {/* 2. Unified PCA Items List */}
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
                          <List size={20} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-700 uppercase tracking-wide">Itens do PCA que compõem esse processo</h3>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">Lista detalhada dos itens do Plano de Contratação Anual</p>
                        </div>
                      </div>

                      <div className="overflow-hidden border border-slate-200 rounded-xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">IFC</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Estimado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(viewingItem.isGroup && viewingItem.childItems ? viewingItem.childItems : [viewingItem]).map((item, idx) => (
                              <tr
                                key={idx}
                                onClick={() => { setViewingItem(item); setIsPcaModalOpen(true); }}
                                className="group hover:bg-blue-50/50 transition-colors cursor-pointer"
                              >
                                <td className="px-6 py-4">
                                  <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-md group-hover:bg-white group-hover:text-blue-600 border border-slate-200 group-hover:border-blue-200 transition-colors inline-block min-w-[60px] text-center">
                                    {item.identificadorFuturaContratacao || '---'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-400 group-hover:text-blue-500 transition-colors">
                                  {item.numeroItem || idx + 1}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-700 group-hover:text-blue-800 transition-colors line-clamp-2">{item.titulo}</span>
                                    <span className="text-[9px] font-medium text-slate-400 mt-1 uppercase">{item.categoria}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <span className="text-xs font-black text-slate-700 group-hover:text-blue-700 transition-colors">{formatCurrency(item.valor)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'documents' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* Left: Document List */}
                    <div className="lg:col-span-5 flex flex-col h-full overflow-hidden">
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-y-auto custom-scrollbar flex-1">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                            <tr>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider w-16">#</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Documento</th>
                              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Data</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(viewingItem.dadosSIPAC.documentos || []).map((doc, i) => {
                              const lakeDoc = lakeDocuments.find(ld =>
                                String(ld.sipacMetadata?.ordem) === String(doc.ordem) &&
                                String(ld.sipacMetadata?.tipo) === String(doc.tipo)
                              );
                              const isSelected = selectedDoc?.ordem === doc.ordem && selectedDoc?.tipo === doc.tipo;

                              return (
                                <tr
                                  key={i}
                                  onClick={() => {
                                    if (selectedDoc?.url !== doc.url) {
                                      setSelectedDoc(doc);
                                      setIsDocLoading(true);
                                    }
                                  }}
                                  className={`cursor-pointer transition-all border-l-4 ${isSelected ? 'bg-blue-50 border-l-blue-500' : 'hover:bg-slate-50 border-l-transparent'}`}
                                >
                                  <td className={`px-6 py-4 text-xs font-black ${isSelected ? 'text-blue-600' : 'text-slate-300'}`}>{doc.ordem}</td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                      <span className={`text-xs font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{doc.tipo}</span>
                                      <span className="text-[10px] font-medium text-slate-400 uppercase mt-0.5">{doc.natureza || 'Ostensivo'}</span>
                                      {lakeDoc && (
                                        <div className="flex items-center gap-2 mt-1.5">
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-purple-50 text-purple-600 uppercase tracking-tight">
                                            <Sparkles size={8} /> AI Ready
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-[10px] font-medium text-slate-500">{doc.data}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Right: Preview Pane */}
                    <div className="lg:col-span-7 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden flex flex-col relative h-full max-h-[calc(100vh-250px)]">
                      {selectedDoc ? (
                        <div className="flex flex-col h-full">
                          <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                <FileText size={16} />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-black text-slate-700 line-clamp-1" title={selectedDoc.tipo}>{selectedDoc.tipo}</span>
                                <span className="text-[10px] font-bold text-slate-400">Documento nº {selectedDoc.ordem}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedDoc.url && (
                                <a
                                  href={selectedDoc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title="Abrir em Nova Aba"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                            </div>
                          </header>
                          <div className="flex-1 bg-slate-200 relative group">
                            {selectedDoc.url ? (
                              <>
                                {isDocLoading && (
                                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50/80 backdrop-blur-sm animate-in fade-in duration-200">
                                    <RefreshCw className="animate-spin text-blue-600 mb-2" size={32} />
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Carregando Documento...</span>
                                  </div>
                                )}
                                <iframe
                                  key={`${selectedDoc.ordem}-${selectedDoc.tipo}`}
                                  src={`${API_SERVER_URL}/api/proxy/pdf?url=${encodeURIComponent(selectedDoc.url)}`}
                                  className="w-full h-full"
                                  title="Document Preview"
                                  onLoad={() => setIsDocLoading(false)}
                                />
                              </>
                            ) : (
                              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <AlertCircle size={32} />
                                <span className="text-sm font-bold">Visualização não disponível</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-4">
                          <div className="p-6 bg-slate-50 rounded-full border border-slate-200">
                            <Eye size={40} />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Nenhum documento selecionado</p>
                            <p className="text-xs font-medium text-slate-400 mt-2">Selecione um item na lista ao lado para visualizar</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-4xl mx-auto pl-4">

                    {/* Quick Info Card */}
                    <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex items-center gap-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><Target size={64} /></div>
                        <div className="p-3 bg-white rounded-xl shadow-sm text-slate-500 relative z-10">
                          <Target size={20} />
                        </div>
                        <div className="relative z-10">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Local de Origem</span>
                          <span className="text-xs font-bold text-slate-700 block uppercase line-clamp-2" title={viewingItem.dadosSIPAC.movimentacoes?.[viewingItem.dadosSIPAC.movimentacoes.length - 1]?.unidadeOrigem}>
                            {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                              ? viewingItem.dadosSIPAC.movimentacoes[viewingItem.dadosSIPAC.movimentacoes.length - 1].unidadeOrigem
                              : '---'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex items-center gap-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-[0.05]"><MapPin size={64} className="text-blue-600" /></div>
                        <div className="p-3 bg-white rounded-xl shadow-sm text-blue-500 relative z-10">
                          <MapPin size={20} />
                        </div>
                        <div className="relative z-10">
                          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-1">Local Atual</span>
                          <span className="text-xs font-bold text-blue-800 block uppercase line-clamp-2" title={viewingItem.dadosSIPAC.unidadeAtual}>
                            {viewingItem.dadosSIPAC.unidadeAtual || '---'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="relative border-l-2 border-slate-200 ml-4 space-y-12 py-4">
                      {[...(viewingItem.dadosSIPAC.movimentacoes || [])].reverse().map((mov, i) => (
                        <div key={i} className="relative pl-12 group">
                          {/* Timeline Dot */}
                          <div className="absolute -left-[9px] top-6 w-4 h-4 rounded-full bg-white border-2 border-slate-300 group-hover:border-indigo-500 transition-colors z-10" />

                          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative group-hover:border-indigo-200 transition-all">
                            {/* Arrow Visual Flow */}
                            <div className="absolute -left-3 top-7 w-3 h-px bg-slate-300 group-hover:bg-indigo-300" />

                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-50 pb-4 mb-4 gap-4">
                              <div className="flex items-center gap-3">
                                <div className="px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
                                  <span className="text-xs font-black text-slate-700 block">{mov.data}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase block mt-0.5">{mov.horario}</span>
                                </div>
                                {mov.urgente?.toLowerCase().includes('sim') && (
                                  <span className="bg-red-50 text-red-600 text-[9px] font-black px-2 py-1 rounded-md animate-pulse border border-red-100">URGENTE</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full">
                                <User size={12} />
                                {mov.usuarioRecebedor ? `Recebido por: ${mov.usuarioRecebedor.split(' ')[0]}` : 'Aguardando Recebimento'}
                              </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
                              <div className="flex-1 w-full">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Origem</span>
                                <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
                                  <p className="text-xs font-bold text-red-800 uppercase">{mov.unidadeOrigem}</p>
                                  <p className="text-[10px] font-medium text-red-600/70 mt-1 uppercase italic">{mov.usuarioRemetente || 'Sistema'}</p>
                                </div>
                              </div>

                              <div className="shrink-0 text-slate-300">
                                <ChevronRight size={24} strokeWidth={3} />
                              </div>

                              <div className="flex-1 w-full">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Destino</span>
                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                  <p className="text-xs font-bold text-emerald-800 uppercase">{mov.unidadeDestino}</p>
                                  <p className="text-[10px] font-medium text-emerald-600/70 mt-1 uppercase italic">
                                    {mov.dataRecebimento ? `Recebido em ${mov.dataRecebimento}` : 'Em Trânsito'}
                                  </p>
                                </div>
                              </div>
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'indicators' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-5xl mx-auto space-y-8">
                    {(() => {
                      const plannedDate = new Date(viewingItem.inicio);
                      let actualDate: Date | null = null;

                      if (viewingItem.dadosSIPAC?.dataAutuacion) {
                        const [day, month, year] = viewingItem.dadosSIPAC.dataAutuacion.split('/');
                        actualDate = new Date(Number(year), Number(month) - 1, Number(day));
                      }

                      const diffTime = actualDate ? actualDate.getTime() - plannedDate.getTime() : 0;
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      const isDelayed = diffDays > 0;
                      const statusColor = !actualDate ? 'slate' : isDelayed ? 'red' : 'emerald';

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Comparative Card */}
                          <div className="col-span-1 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className={`absolute top-0 right-0 p-8 opacity-5 text-${statusColor}-500 group-hover:scale-110 transition-transform`}>
                              <Clock size={120} />
                            </div>

                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 relative z-10">Eficiência de Abertura</h3>

                            <div className="flex flex-col gap-6 relative z-10">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Planejado (PCA)</span>
                                  <span className="text-lg font-black text-slate-700">{formatDate(viewingItem.inicio)}</span>
                                </div>
                                <div className="h-px w-12 bg-slate-300 mx-2"></div>
                                <div className="text-right">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Realizado (SIPAC)</span>
                                  <span className={`text-lg font-black text-${statusColor}-600`}>
                                    {viewingItem.dadosSIPAC?.dataAutuacion || 'N/A'}
                                  </span>
                                </div>
                              </div>

                              <div className={`p-4 rounded-xl border ${!actualDate ? 'bg-slate-50 border-slate-200' : isDelayed ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'} flex items-center gap-4`}>
                                <div className={`p-2 rounded-lg ${!actualDate ? 'bg-white text-slate-400' : isDelayed ? 'bg-white text-red-500' : 'bg-white text-emerald-500'} shadow-sm`}>
                                  {isDelayed ? <AlertTriangle size={20} /> : <Check size={20} />}
                                </div>
                                <div>
                                  <span className={`text-xs font-black uppercase block ${!actualDate ? 'text-slate-500' : isDelayed ? 'text-red-700' : 'text-emerald-700'}`}>
                                    {!actualDate ? 'Aguardando Abertura' : isDelayed ? 'Processo Atrasado' : 'No Prazo / Antecipado'}
                                  </span>
                                  {actualDate && (
                                    <span className={`text-[10px] font-bold ${isDelayed ? 'text-red-600/70' : 'text-emerald-600/70'}`}>
                                      {Math.abs(diffDays)} dias de {isDelayed ? 'atraso' : 'antecedência'} entre o planejamento e a abertura.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Execution Time Card */}
                          <div className="col-span-1 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="absolute top-0 right-0 p-8 opacity-5 text-blue-500 group-hover:scale-110 transition-transform">
                              <History size={120} />
                            </div>

                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 relative z-10">Tempo de Execução</h3>

                            {(() => {
                              const movements = viewingItem.dadosSIPAC?.movimentacoes || [];
                              const lastMovement = movements.length > 0 ? movements[0] : null;
                              const isClosed = lastMovement?.unidadeDestino?.toLowerCase().includes('arquivo') ||
                                (lastMovement as any)?.despacho?.toLowerCase().includes('arquiva') ||
                                (viewingItem.dadosSIPAC as any).status === 'ARCHIVED';

                              const startDate = actualDate || new Date();

                              let endDate = new Date();
                              let statusText = "Em Andamento";

                              if (isClosed && lastMovement) {
                                const [d, m, y] = lastMovement.data.split('/');
                                endDate = new Date(Number(y), Number(m) - 1, Number(d));
                                statusText = "Encerrado / Arquivado";
                              }

                              const totalTime = endDate.getTime() - startDate.getTime();
                              const totalDays = Math.max(0, Math.floor(totalTime / (1000 * 60 * 60 * 24)));
                              const years = Math.floor(totalDays / 365);
                              const months = Math.floor((totalDays % 365) / 30);
                              const days = (totalDays % 365) % 30;

                              return (
                                <div className="flex flex-col gap-6 relative z-10">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Início da Vigência</span>
                                      <span className="text-lg font-black text-slate-700">{viewingItem.dadosSIPAC?.dataAutuacion || 'N/A'}</span>
                                    </div>
                                    <div className="h-px w-12 bg-slate-300 mx-2"></div>
                                    <div className="text-right">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Status Atual</span>
                                      <span className={`text-lg font-black ${isClosed ? 'text-slate-500' : 'text-blue-600'}`}>
                                        {statusText}
                                      </span>
                                    </div>
                                  </div>

                                  <div className={`p-6 rounded-2xl border ${isClosed ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-100'} flex flex-col items-center justify-center gap-2`}>
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tempo Total Decorrido</span>
                                    <div className="flex items-baseline gap-2">
                                      <span className={`text-4xl font-black ${isClosed ? 'text-slate-600' : 'text-blue-600'}`}>
                                        {totalDays}
                                      </span>
                                      <span className="text-sm font-bold text-slate-400 uppercase">Dias</span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide opacity-70">
                                      {years > 0 && <span>{years} anos</span>}
                                      {months > 0 && <span>{months} meses</span>}
                                      <span>{days} dias</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'pncp' && pncpMatch && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-5xl mx-auto space-y-8">
                    {/* A. Cabeçalho da Licitação (Destaque) */}
                    <div className="bg-white p-8 rounded-3xl border border-emerald-100 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-10 transition-opacity">
                        <TrendingUp size={120} className="text-emerald-500" />
                      </div>

                      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
                            <Target size={32} />
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1 block">Dados Oficiais PNCP</span>
                            <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                              {pncpMatch.modalidadeNome} nº {pncpMatch.numeroCompra}/{pncpMatch.anoCompra}
                            </h2>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">{pncpMatch.situacaoNome}</span>
                            </div>
                          </div>
                        </div>

                        {pncpMatch.linkSistemaOrigem && (
                          <a
                            href={pncpMatch.linkSistemaOrigem}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 group/btn"
                          >
                            Acessar no Compras.gov
                            <ExternalLink size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* B. Detalhes Legais e Cronograma */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Objeto da Contratação</span>
                          <p className="text-sm font-bold text-slate-700 leading-relaxed uppercase">
                            {pncpMatch.objeto}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-50">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Amparo Legal</span>
                            <p className="text-xs font-bold text-slate-600">{pncpMatch.amparoLegalNome || '---'}</p>
                          </div>
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Modo de Disputa</span>
                            <p className="text-xs font-bold text-slate-600">{pncpMatch.modoDisputaNome || '---'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-10">
                          <Calendar size={80} />
                        </div>

                        <div className="space-y-6 relative z-10">
                          <div>
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] block mb-2">Publicação no PNCP</span>
                            <div className="flex items-center gap-3">
                              <Calendar size={18} className="text-emerald-400" />
                              <span className="text-base font-black">{formatDate(pncpMatch.dataPublicacaoPncp)}</span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] block mb-2">Abertura da Sessão</span>
                            <div className="flex items-center gap-3">
                              <Clock size={18} className="text-amber-400" />
                              <span className="text-base font-black">{formatDate(pncpMatch.dataAberturaProposta)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] block mb-1">Valor Estimado Total</span>
                          <span className="text-3xl font-black text-emerald-400 tracking-tighter">
                            {formatCurrency(pncpMatch.valorTotalEstimado)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* C. Tabela de Itens Licitados */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-slate-400">
                            <List size={20} />
                          </div>
                          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Itens Licitados (Base PNCP)</h3>
                        </div>
                        <span className="px-3 py-1 bg-white rounded-full border border-slate-200 text-[10px] font-black text-slate-400 uppercase">
                          {pncpItems.length} Itens Encontrados
                        </span>
                      </header>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-white border-b border-slate-100">
                              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição detalhada</th>
                              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qtd.</th>
                              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Unit. Est.</th>
                              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Total Est.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {pncpItems.length > 0 ? (
                              pncpItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-8 py-5">
                                    <span className="text-xs font-black text-slate-400">{item.numeroItem}</span>
                                  </td>
                                  <td className="px-8 py-5">
                                    <div className="flex flex-col gap-1">
                                      <p className="text-xs font-bold text-slate-700 leading-relaxed uppercase">{item.descricao}</p>
                                      <span className="text-[9px] font-medium text-slate-400 uppercase italic">
                                        Critério: {item.criterioJulgamentoNome || 'Menor Preço'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-8 py-5 text-center">
                                    <span className="text-sm font-black text-slate-600">{item.quantidade}</span>
                                  </td>
                                  <td className="px-8 py-5 text-right">
                                    <span className="text-xs font-bold text-slate-500">{formatCurrency(item.valorUnitarioEstimado)}</span>
                                  </td>
                                  <td className="px-8 py-5 text-right">
                                    <span className="text-sm font-black text-slate-900">
                                      {formatCurrency(item.quantidade * item.valorUnitarioEstimado)}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-8 py-12 text-center">
                                  <div className="flex flex-col items-center gap-3 text-slate-300">
                                    <RefreshCw size={40} className="animate-spin" />
                                    <span className="text-xs font-black uppercase tracking-[0.2em]">Buscando detalhes dos itens...</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        )}


      {
        isEditModalOpen && editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
              <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div className={`flex items-center gap-5`}>
                  <div className="p-2 bg-ifes-blue/10 rounded-lg text-ifes-blue"><ExternalLink size={24} strokeWidth={2.5} /></div>
                  <div><h2 className="text-2xl font-black text-slate-900 tracking-tight">Vincular Protocolo</h2></div>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className={`p-2.5 hover:bg-red-50 hover:text-red-500 rounded-md transition-all text-slate-400 bg-white border border-slate-100`}>
                  <X size={24} />
                </button>
              </header>
              <main className="p-10 space-y-10 custom-scrollbar overflow-y-auto max-h-[80vh]">
                <section className="bg-slate-50 rounded-xl border border-slate-200 p-8 space-y-6">
                  <div className="flex flex-col md:flex-row gap-6 items-start">
                    <div className="flex-1 w-full space-y-4">
                      <input type="text" placeholder="Protocolo (Ex: 23543...)" className="w-full px-4 py-3 border rounded-xl" value={editingItem.protocoloSIPAC || ''} onChange={(e) => setEditingItem({ ...editingItem, protocoloSIPAC: formatProtocolo(e.target.value) })} />
                      <div className="flex gap-3">
                        <button onClick={handleFetchSIPAC} disabled={isFetchingSIPAC || !editingItem.protocoloSIPAC} className="flex-1 py-3 bg-white border rounded-lg text-xs font-black">{isFetchingSIPAC ? 'Buscando...' : 'Consultar'}</button>
                        {editingItem.protocoloSIPAC && editingItem.dadosSIPAC && <button onClick={() => handleUnlinkProcess(editingItem)} className="px-6 py-3 bg-red-50 text-red-600 rounded-lg font-black text-xs">Desvincular</button>}
                      </div>
                    </div>
                  </div>
                </section>
              </main>
              <footer className="p-8 bg-slate-50/80 border-t border-slate-100 flex gap-4">
                <button onClick={() => setIsEditModalOpen(false)} className="flex-1 px-8 py-4 bg-white border rounded-lg text-[10px] font-black">Cancelar</button>
                <button onClick={handleSaveValues} disabled={saving || (!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC)} className="flex-[2] px-8 py-4 bg-ifes-blue text-white rounded-lg text-[10px] font-black">{saving ? 'Salvando...' : 'Salvar Vínculo'}</button>
              </footer>
            </div>
          </div>
        )
      }

      {/* Modal de Itens do Agrupamento (PCA) */}
      {isItemsListModalOpen && viewingItem && viewingItem.childItems && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden font-sans flex flex-col max-h-[90vh]">
            <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                  <List size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Itens Relacionados no PCA</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Detalhamento das demandas vinculadas a este processo</p>
                </div>
              </div>
              <button
                onClick={() => setIsItemsListModalOpen(false)}
                className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"
              >
                <X size={28} />
              </button>
            </header>

            <div className="flex-1 overflow-auto p-10 custom-scrollbar">
              <div className="overflow-hidden border border-slate-100 rounded-2xl bg-slate-50/30">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-slate-100">
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cód. Item (IFC)</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição / Título</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {viewingItem.childItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                            {item.identificadorFuturaContratacao || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-700 group-hover:text-ifes-blue transition-colors">{item.titulo}</span>
                            <span className="text-[9px] font-medium text-slate-400 mt-0.5">{item.area}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-slate-500 uppercase">{item.categoria}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-black text-slate-700">{formatCurrency(item.valor)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50/80">
                    <tr>
                      <td colSpan={3} className="px-6 py-5 text-[10px] font-black text-slate-500 uppercase text-right">Total Consolidado:</td>
                      <td className="px-6 py-5 text-right">
                        <span className="text-sm font-black text-ifes-blue">
                          {formatCurrency(viewingItem.childItems.reduce((acc, i) => acc + i.valor, 0))}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-8 p-6 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4 items-center">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                  <Info size={20} />
                </div>
                <p className="text-[10px] font-black text-blue-800 leading-relaxed uppercase tracking-tight">
                  Estes itens compõem o planejamento deste processo no Plano de Contratação Anual (PCA). O valor total acima reflete a soma de todos os itens agrupados.
                </p>
              </div>
            </div>

            <footer className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsItemsListModalOpen(false)}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-100 hover:text-slate-800 transition-all uppercase tracking-widest shadow-sm"
              >
                Fechar Visualização
              </button>
            </footer>
          </div>
        </div>
      )}
      {/* Modal de Detalhes do Planejamento PCA */}
      {isPcaModalOpen && viewingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden font-sans flex flex-col max-h-[90vh]">
            <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-5">
                <div className="p-2 bg-ifes-blue/10 rounded-xl text-ifes-blue">
                  <Package size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Detalhes do Planejamento (PCA)</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Dados oficiais extraídos do PNCP</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!viewingItem.protocoloSIPAC && (
                  <button
                    onClick={() => {
                      setIsPcaModalOpen(false);
                      setEditingItem(viewingItem);
                      setIsEditModalOpen(true);
                    }}
                    className="px-4 py-2 bg-ifes-blue text-white rounded-lg text-xs font-black hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100"
                  >
                    <Link size={14} /> Vincular Agora
                  </button>
                )}
                <button
                  onClick={() => setIsPcaModalOpen(false)}
                  className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"
                >
                  <X size={28} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-8">
              {/* Card de Identificação */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informações Gerais</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Cód. / Número Item</span>
                    <span className="text-sm font-black text-slate-700">#{viewingItem.numeroItem || 'N/A'}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 col-span-2">
                    <span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Código do Catálogo (CATMAT/CATSER)</span>
                    <span className="text-sm font-black text-slate-700">{viewingItem.codigoItem || 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Categoria</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase inline-block mt-1 ${viewingItem.categoria === Category.Bens ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      viewingItem.categoria === Category.TIC ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                      {viewingItem.categoria}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Data Desejada</span>
                    <span className="text-sm font-black text-slate-700">{formatDate(viewingItem.inicio)}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <span className="block text-[9px] font-black text-slate-400 uppercase mb-1">Unidade Requisitante</span>
                    <span className="text-sm font-black text-slate-700 truncate block transition-all" title={viewingItem.unidadeRequisitante || viewingItem.area}>
                      {viewingItem.unidadeRequisitante || viewingItem.area}
                    </span>
                  </div>
                </div>
              </section>

              {/* Descrição Detalhada */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição do Objeto</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm leading-relaxed">
                  <p className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-2">{viewingItem.titulo}</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {viewingItem.descricaoDetalhada || 'Sem descrição detalhada adicional disponível.'}
                  </p>
                </div>
              </section>

              {/* Quantidades e Valores */}
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Metrificação e Orçamento</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <span className="block text-[9px] font-black text-blue-400 uppercase mb-1">Unidade de Medida</span>
                    <span className="text-sm font-black text-blue-700 uppercase">{viewingItem.unidadeMedida || 'UN'}</span>
                  </div>
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <span className="block text-[9px] font-black text-blue-400 uppercase mb-1">Quantidade</span>
                    <span className="text-sm font-black text-blue-700">{viewingItem.quantidade || 0}</span>
                  </div>
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                    <span className="block text-[9px] font-black text-blue-400 uppercase mb-1">Valor Unitário</span>
                    <span className="text-sm font-black text-blue-700">{formatCurrency(viewingItem.valorUnitario || 0)}</span>
                  </div>
                  <div className="bg-ifes-blue p-4 rounded-2xl shadow-lg shadow-blue-100">
                    <span className="block text-[9px] font-black text-white/60 uppercase mb-1">Valor Total Estimado</span>
                    <span className="text-sm font-black text-white">{formatCurrency(viewingItem.valor)}</span>
                  </div>
                </div>
              </section>

              {/* Agrupamento */}
              {viewingItem.grupoContratacao && (
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Agrupamento de Contratação</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 flex items-center gap-4">
                    <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                      <Target size={18} />
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-amber-500 uppercase tracking-wider leading-none mb-1">Nome do Agrupamento</span>
                      <span className="text-sm font-black text-amber-900">{viewingItem.grupoContratacao}</span>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <footer className="p-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                <Info size={14} className="text-slate-300" />
                Dados sincronizados via integração oficial PNCP
              </div>
              <button
                onClick={() => setIsPcaModalOpen(false)}
                className="px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-100 hover:text-slate-800 transition-all uppercase tracking-widest shadow-sm"
              >
                Voltar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div >
  );
};

export default AnnualHiringPlan;
