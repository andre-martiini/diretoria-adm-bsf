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
  BookOpen
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
  SIPACProcess
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
  BarChart, Bar, XAxis, CartesianGrid
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
import { analyzeProcessFinancials } from '../utils/analysis/smartScanner';
import { ProcessFinancials } from '../types';
import FinancialTimeline from './FinancialTimeline';

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as pdfjsLib from 'pdfjs-dist';

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
  const [pcaMeta, setPcaMeta] = useState<{ id: string, dataPublicacao: string } | null>(null);
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
  const [isDespachosModalOpen, setIsDespachosModalOpen] = useState<boolean>(false);
  const [isFlashModalOpen, setIsFlashModalOpen] = useState<boolean>(false);
  const [despachosContent, setDespachosContent] = useState<{ tipo: string, data: string, texto: string, ordem: string }[]>([]);
  const [isLoadingDespachos, setIsLoadingDespachos] = useState<boolean>(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);
  const [viewingItem, setViewingItem] = useState<ContractItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    documentos: false,
    movimentacoes: false,
    interessados: false,
    incidentes: false,
    resumoIA: true
  });
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [dashboardView, setDashboardView] = useState<'planning' | 'status'>('planning');
  const [isItemsListModalOpen, setIsItemsListModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);

  const processedAISummaryRefs = useRef<Set<string>>(new Set());

  // Data Lake States
  const [lakeDocuments, setLakeDocuments] = useState<any[]>([]);
  const [isLakeModalOpen, setIsLakeModalOpen] = useState(false);
  const [selectedLakeDoc, setSelectedLakeDoc] = useState<any>(null);
  const [lakeDocUrl, setLakeDocUrl] = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [loadingLake, setLoadingLake] = useState(false);

  // Financial Analysis States
  const [financialData, setFinancialData] = useState<ProcessFinancials | null>(null);
  const [isAnalyzingFinancials, setIsAnalyzingFinancials] = useState(false);

  // Chat Auditor Regional States (RAG)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string, timestamp: Date }[]>([]);
  const [chatQuery, setChatQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [extractedTexts, setExtractedTexts] = useState<Record<string, string>>({}); // Map url -> text
  const [isExtracting, setIsExtracting] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

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

  // Client-side PDF Extraction
  const fetchAndExtractPDF = async (docUrl: string): Promise<string> => {
    try {
      // Usa o proxy para obter o binário do PDF
      const proxyUrl = `${API_SERVER_URL}/api/proxy/pdf?url=${encodeURIComponent(docUrl)}`;
      const loadingTask = pdfjsLib.getDocument(proxyUrl);
      const pdf = await loadingTask.promise;
      let fullText = '';

      // Extrai texto de todas as páginas
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `--- PÁGINA ${i} ---\n${pageText}\n\n`;
      }
      return fullText;
    } catch (error: any) {
      console.error("Erro ao extrair PDF:", error);
      throw new Error(`Falha na leitura do PDF: ${error.message}`);
    }
  };

  const handleSendMessage = async () => {
    if (!chatQuery.trim() || !viewingItem || isThinking) return;

    const userMessage = chatQuery.trim();
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      setToast({ message: "Chave de API do Gemini não configurada (VITE_GEMINI_API_KEY).", type: "error" });
      return;
    }

    // 1. Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setChatQuery('');
    setIsThinking(true);

    try {
      // 2. Extract context if not ready
      let contextText = Object.values(extractedTexts).join("\n\n");

      if (!contextText && viewingItem.dadosSIPAC?.documentos) {
        setIsExtracting(true);
        const newTexts: Record<string, string> = {};

        // Tenta extrair dos primeiros 5 documentos para não demorar demais
        // Prioriza Despachos, Editais, Termos de Referência
        const docsToProcess = viewingItem.dadosSIPAC.documentos
          .filter(d => d.url)
          .slice(0, 5);

        for (const doc of docsToProcess) {
           try {
             if (doc.url) {
               const text = await fetchAndExtractPDF(doc.url);
               newTexts[doc.url] = `[DOCUMENTO: ${doc.tipo} (${doc.data})]\n${text}`;
             }
           } catch (e) {
             console.warn(`Erro ao ler documento ${doc.tipo}:`, e);
           }
        }

        setExtractedTexts(prev => ({...prev, ...newTexts}));
        contextText = Object.values(newTexts).join("\n\n");
        setIsExtracting(false);
      }

      if (!contextText) {
        throw new Error("Não foi possível extrair texto dos documentos para análise.");
      }

      // 3. Call Gemini
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" });

      const systemInstruction = `
Você é um Auditor Digital especializado em processos públicos.
Responda à pergunta do usuário com base EXCLUSIVAMENTE no texto extraído dos documentos fornecido abaixo.
Se a informação não estiver no texto, diga que não encontrou.
Cite a fonte (tipo do documento ou página) quando possível.
`;

      const prompt = `${systemInstruction}\n\nCONTEXTO EXTRAÍDO DOS ARQUIVOS PDF:\n${contextText}\n\nPERGUNTA DO USUÁRIO: ${userMessage}`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

  // Trigger para resumo IA em segundo plano quando visualiza o processo
  useEffect(() => {
    if (isDetailsModalOpen && viewingItem?.dadosSIPAC) {
      generateAISummary(viewingItem);
      // Reset financial data when opening new item
      setFinancialData(viewingItem.dadosSIPAC.analise_financeira || null);
    }
  };

  const handleRunFinancialAnalysis = async () => {
    if (!viewingItem?.dadosSIPAC) return;
    setIsAnalyzingFinancials(true);
    try {
        // Run the smart scanner
        const results = await analyzeProcessFinancials(viewingItem.dadosSIPAC);
        setFinancialData(results);

        // Update local state and viewingItem
        const updatedSipac = { ...viewingItem.dadosSIPAC, analise_financeira: results };
        setViewingItem({ ...viewingItem, dadosSIPAC: updatedSipac });

        // Persist to Firestore (Optimistic)
        // Note: Ideally we should update Firestore here similar to generateAISummary
         if (viewingItem.protocoloSIPAC) {
            const q = query(collection(db, 'pca_data'), where('protocoloSIPAC', '==', viewingItem.protocoloSIPAC));
            const querySnapshot = await getDocs(q);
            const batch = writeBatch(db);
            querySnapshot.forEach((docSnap) => batch.update(docSnap.ref, { 'dadosSIPAC.analise_financeira': results }));
            if (!querySnapshot.empty) await batch.commit();
        }

    } catch (error) {
        console.error("Financial Analysis failed", error);
        setToast({ message: "Falha ao realizar análise financeira dos documentos.", type: 'error' });
    } finally {
        setIsAnalyzingFinancials(false);
    }
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

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isThinking]);

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
          titulo: first.dadosSIPAC?.assuntoDetalhado || first.titulo,
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
            <div className="border-l border-slate-100 pl-6 ml-6 hidden md:block">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button onClick={() => setDashboardView('planning')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dashboardView === 'planning' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-400 hover:text-slate-600'}`}>Plano de Contratação (PCA)</button>
                <button onClick={() => setDashboardView('status')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dashboardView === 'status' ? 'bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100' : 'text-slate-400 hover:text-slate-600'}`}>Gestão de Processos</button>
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
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-ifes-green/30 transition-all">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity"><DollarSign size={80} className="text-ifes-green" /></div>
                <div className="relative z-10"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor Total Planejado</p><h3 className="text-3xl font-black text-slate-900 mb-6">{formatCurrency(summary.totalValue)}</h3>
                  <div className="space-y-2"><div className="flex justify-between text-[9px] font-black text-slate-400 uppercase"><span>Itens Vinculados a Processos</span><span>{((summary.totalExecutado / (summary.totalItems || 1)) * 100).toFixed(0)}%</span></div><div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-ifes-green transition-all duration-500" style={{ width: `${(summary.totalExecutado / (summary.totalItems || 1)) * 100}%` }}></div></div></div></div>
              </div>
              <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col"><h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide"><Target size={14} className="text-ifes-green" /> Por Categoria</h3><div className="h-[200px] w-full relative"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" stroke="none">{chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}</Pie><Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /></PieChart></ResponsiveContainer></div></div>
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col"><h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide"><RefreshCw size={14} className="text-blue-500" /> Cronograma de Contratação (Inicio Vigência)</h3><div className="h-[200px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.monthlyPlan}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} /><Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} /><Bar dataKey="value" fill="#2f9e41" radius={[4, 4, 0, 0]} barSize={24} /></BarChart></ResponsiveContainer></div></div>
            </div>
          </div>
        )}

        {dashboardView === 'status' && <div className="animate-in fade-in slide-in-from-bottom-4 duration-500"><ProcessDashboard data={activeData} /></div>}

        <div className={`bg-white rounded-2xl border ${dashboardView === 'planning' ? 'border-slate-200' : 'border-violet-100'} shadow-sm overflow-hidden flex flex-col font-sans mb-20`}>
          <div className={`p-6 border-b ${dashboardView === 'planning' ? 'border-slate-100 bg-slate-50/30' : 'border-violet-100 bg-violet-50/30'} flex flex-col md:flex-row items-center justify-between gap-6`}>
            <div><h2 className={`text-xl font-black ${dashboardView === 'planning' ? 'text-slate-800' : 'text-violet-900'} tracking-tight`}>{dashboardView === 'planning' ? 'Detalhamento do Plano (PNCP)' : 'Processos em Andamento'}</h2><p className={`text-[10px] font-bold ${dashboardView === 'planning' ? 'text-slate-400' : 'text-violet-400'} uppercase tracking-widest mt-1 italic`}>{dashboardView === 'planning' ? `Lista completa de itens importados do PNCP - Ano ${selectedYear}` : 'Listagem de processos com protocolo SIPAC vinculado'}</p></div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} /><input type="text" placeholder="Buscar por descrição ou área..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-ifes-green/20 transition-all" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} /></div>
              <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-700 transition-colors shadow-sm"><Plus size={16} /><span>Nova Demanda</span></button>
            </div>
          </div>
          <ContractTable viewMode={dashboardView} data={pagedData} loading={loading} onSort={(key) => { const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'; setSortConfig({ key, direction }); }} sortConfig={sortConfig} selectedIds={selectedIds} onToggleSelection={(id) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); }} onToggleAll={() => { const allIds = pagedData.map(i => String(i.id)); if (allIds.every(id => selectedIds.includes(id))) { setSelectedIds(prev => prev.filter(id => !allIds.includes(id))); } else { setSelectedIds(prev => [...prev, ...allIds]); } }} onEdit={(item) => { setEditingItem(item); setIsEditModalOpen(true); }} onViewDetails={(item) => { setViewingItem(item); setIsDetailsModalOpen(true); }} onViewSummary={(item) => { setViewingItem(item); setIsFlashModalOpen(true); }} />
          {!loading && totalPages > 1 && (<div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between"><span className="text-[10px] font-bold text-slate-400 capitalize">Página {currentPage} de {totalPages}</span><div className="flex gap-2"><button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50"><ChevronLeft size={16} /></button><button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50"><ChevronRight size={16} /></button></div></div>)}
        </div>
      </main>

      {/* MODALS */}
      {previewUrl && (<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300"><div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden"><div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><div className="flex items-center gap-4"><div className="bg-blue-50 p-3 rounded-xl text-blue-600"><FileText size={20} /></div><div><h3 className="text-xl font-black text-slate-800 tracking-tight">Visualizando Documento</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Portal SIPAC • Visualização Integrada</p></div></div><div className="flex items-center gap-3"><a href={previewUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-50 transition-all flex items-center gap-2"><ExternalLink size={14} /> Abrir Original</a><button onClick={() => setPreviewUrl(null)} className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"><X size={24} /></button></div></div><div className="flex-1 bg-slate-800 relative group"><iframe src={previewUrl} className="w-full h-full border-none bg-white" title="Preview do Documento" /></div></div></div>)}

      {isDetailsModalOpen && viewingItem && viewingItem.dadosSIPAC && (
        <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col font-sans animate-in fade-in duration-300">
          <header className="bg-white border-b border-slate-200 px-10 py-6 flex items-center justify-between shadow-sm shrink-0 sticky top-0 z-[80]">
            <div className="flex items-center gap-6"><div className="bg-ifes-blue p-3.5 rounded-lg shadow-lg shadow-blue-100"><Search size={28} className="text-white" strokeWidth={3} /></div><div><h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">Processo {viewingItem.dadosSIPAC.numeroProcesso}<span className={`text-[10px] px-3 py-1 rounded-md uppercase font-black tracking-widest ${getStatusColor(getProcessStatus(viewingItem))}`}>{getProcessStatus(viewingItem)}</span></h2><div className="flex items-center gap-4 mt-1.5"><span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sincronizado via SIPAC em {viewingItem.dadosSIPAC.ultimaAtualizacao}</span></div></div></div>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsChatOpen(!isChatOpen)} className={`flex items-center gap-2 px-4 py-2 border rounded-md text-xs font-black transition-all shadow-sm ${isChatOpen ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-100 text-blue-600 hover:bg-blue-50'}`}><Bot size={16} /> Consultor Digital</button>
              <button onClick={() => setIsDetailsModalOpen(false)} className="p-2.5 hover:bg-red-50 hover:text-red-500 rounded-md transition-all text-slate-400 bg-white border border-slate-100"><X size={24} /></button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-8 py-10">
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
              <div className="bg-white rounded-lg border border-slate-200 p-10 shadow-sm">
                <div className="flex items-center gap-2 mb-6"><div className="p-1 px-2 bg-ifes-blue/10 rounded-md text-ifes-blue"><Target size={14} strokeWidth={3} /></div><span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dados de Planejamento do PCA</span></div>
                <div className="flex flex-col gap-6"><h3 className="text-3xl font-black text-slate-900 leading-tight">{viewingItem.titulo}</h3>
                  <div className="flex items-center gap-4 flex-wrap pt-4">
                    <div><span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Valor Estimado</span><div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center"><span className="text-sm font-black text-slate-600 tracking-tighter">{formatCurrency(viewingItem.valor)}</span></div></div>
                    <div><span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Categoria</span><div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center"><span className="text-sm font-black text-slate-600">{viewingItem.categoria}</span></div></div>
                  </div>
                </div>
              </div>

              {/* Documentos */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden transition-all">
                <button onClick={() => setExpandedSections(p => ({ ...p, documentos: !p.documentos }))} className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3"><div className="bg-blue-50 p-2 rounded-md text-blue-600"><FileText size={20} /></div><span className="font-black text-slate-800 uppercase text-xs tracking-widest">Documentos</span></div>
                  {expandedSections.documentos ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
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
        )
      }
      {/* Modal de Detalhes SIPAC - FULL PAGE EDITION */}
      {
        isDetailsModalOpen && viewingItem && viewingItem.dadosSIPAC && (
          <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col font-sans animate-in fade-in duration-300">
            {/* Header Superior Fixo */}
            <header className="bg-white border-b border-slate-200 px-10 py-6 flex items-center justify-between shadow-sm shrink-0 sticky top-0 z-[80]">
              <div className="flex items-center gap-6">
                <div className="bg-ifes-blue p-3.5 rounded-lg shadow-lg shadow-blue-100">
                  <Search size={28} className="text-white" strokeWidth={3} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    Processo {viewingItem.dadosSIPAC.numeroProcesso}
                    <span className={`text-[10px] px-3 py-1 rounded-md uppercase font-black tracking-widest ${getStatusColor(getProcessStatus(viewingItem))}`}>
                      {getProcessStatus(viewingItem)}
                    </span>
                  </h2>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sincronizado via SIPAC em {viewingItem.dadosSIPAC.ultimaAtualizacao}</span>
                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                    <button
                      onClick={() => handleUpdateSIPACItem(viewingItem, true)}
                      disabled={isFetchingSIPAC}
                      className="flex items-center gap-2 px-3 py-1 bg-ifes-blue/5 hover:bg-ifes-blue/10 text-ifes-blue rounded-full text-[10px] font-black uppercase transition-all disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={isFetchingSIPAC ? 'animate-spin' : ''} strokeWidth={3} />
                      {isFetchingSIPAC ? 'Sincronizando...' : 'Tudo certo! Atualizar AGORA'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  disabled={lakeDocuments.some(d => d.status === 'PROCESSING')}
                  title={lakeDocuments.some(d => d.status === 'PROCESSING') ? "Aguarde o processamento dos documentos para consultar." : "Falar com Consultor Digital"}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-md text-xs font-black transition-all shadow-sm ${lakeDocuments.some(d => d.status === 'PROCESSING')
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed opacity-70'
                    : (isChatOpen ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-100 text-blue-600 hover:bg-blue-50')
                    }`}
                >
                  {lakeDocuments.some(d => d.status === 'PROCESSING') ? <RefreshCw size={16} className="animate-spin" /> : <Bot size={16} />}
                  Consultor Digital
                </button>
                <button
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    setEditingItem(viewingItem);
                    setIsEditModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-black text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                >
                  <PencilLine size={16} />
                  Editar Vínculo
                </button>
                <button
                  onClick={() => handleUnlinkProcess(viewingItem)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-md text-xs font-black text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm group"
                >
                  <Link size={16} className="rotate-45" />
                  Desvincular
                </button>
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="p-2.5 hover:bg-red-50 hover:text-red-500 rounded-md transition-all text-slate-400 bg-white border border-slate-100"
                >
                  <X size={24} />
                </button>
              </div>
            </header>


            <main className="flex-1 overflow-y-auto px-8 py-10">
              <div className="max-w-6xl mx-auto space-y-8 pb-20">

                {/* Seção 1: Dados de Planejamento */}
                <div className="bg-white rounded-lg border border-slate-200 p-10 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1 px-2 bg-ifes-blue/10 rounded-md text-ifes-blue">
                      <Target size={14} strokeWidth={3} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dados de Planejamento do PCA</span>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-3xl font-black text-slate-900 leading-tight">
                        {viewingItem.titulo}
                      </h3>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap pt-4">
                      <div>
                        <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Valor Estimado</span>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                          <span className="text-sm font-black text-slate-600 tracking-tighter">{formatCurrency(viewingItem.valor)}</span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Categoria</span>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                          <span className="text-sm font-black text-slate-600">{viewingItem.categoria}</span>
                        </div>
                      </div>

                      <div>
                        <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Início Previsto</span>
                        <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                          <span className="text-sm font-black text-slate-600">{formatDate(viewingItem.inicio)}</span>
                        </div>
                      </div>

                      {viewingItem.isGroup && (
                        <div>
                          <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Itens do Agrupamento</span>
                          <button
                            onClick={() => setIsItemsListModalOpen(true)}
                            className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-100 h-10 flex items-center gap-2 hover:bg-blue-100 transition-colors group cursor-pointer"
                          >
                            <List size={14} className="text-blue-500 group-hover:text-blue-600" strokeWidth={3} />
                            <span className="text-sm font-black text-blue-600 uppercase tracking-tight">{viewingItem.childItems?.length || 0} Itens do PCA</span>
                          </button>
                        </div>
                      )}

                      {viewingItem.identificadorFuturaContratacao && (
                        <div>
                          <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Código do Item (IFC)</span>
                          <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                            <span className="text-sm font-black text-slate-600 tracking-tighter">
                              {viewingItem.identificadorFuturaContratacao}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-6 border-t border-dashed border-slate-100">
                      <span className="block text-[9px] font-black text-slate-400 uppercase mb-4 tracking-widest">Justificativa / Objeto no SIPAC</span>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed italic border-l-4 border-ifes-blue/40 pl-6 bg-ifes-blue/5 py-4 rounded-r-lg">
                        "{viewingItem.dadosSIPAC.assuntoDetalhado || 'Sem descrição detalhada disponível no SIPAC.'}"
                      </p>
                    </div>
                  </div>
                </div>

                {/* Seção 2: Identificação do Processo (SIPAC) */}
                <div className="bg-white rounded-lg border border-slate-200 p-10 shadow-sm">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1 px-2 bg-slate-950 rounded-md text-white">
                      <Info size={14} strokeWidth={3} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identificação do Processo no SIPAC</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-6">
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Número do Processo</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-sm font-black text-slate-600 tracking-tighter">{viewingItem.dadosSIPAC.numeroProcesso}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Status no SIPAC</span>
                      <div className={`px-4 py-2 rounded-lg border h-10 flex items-center gap-2 ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'bg-').replace('700', '50').replace('600', '50')} ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'border-').replace('700', '100').replace('600', '100')}`}>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'bg-').replace('700', '500').replace('600', '500')}`} />
                        <span className={`text-xs font-black uppercase truncate ${getStatusColor(getProcessStatus(viewingItem)).replace('text-', 'text-').replace('700', '700').replace('600', '700')}`}>
                          {getProcessStatus(viewingItem)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Data de Autuação</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-sm font-black text-slate-600">{viewingItem.dadosSIPAC.dataAutuacion}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Última Tramitação</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-xs font-black text-slate-600 uppercase truncate">
                          {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                            ? `${viewingItem.dadosSIPAC.movimentacoes[0].data}`
                            : 'Recente'}
                        </span>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Assunto do Processo</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-xs font-black text-slate-600 uppercase truncate">
                          <span className="text-ifes-blue mr-2 font-black">{viewingItem.dadosSIPAC.assuntoCodigo}</span>
                          {viewingItem.dadosSIPAC.assuntoDescricao}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Natureza</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-xs font-black text-slate-600 uppercase truncate">{viewingItem.dadosSIPAC.natureza || 'OSTENSIVO'}</span>
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Usuário de Autuação</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <p className="text-xs font-black text-slate-600 truncate uppercase italic" title={viewingItem.dadosSIPAC.usuarioAutuacion}>
                          {viewingItem.dadosSIPAC.usuarioAutuacion}
                        </p>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Unidade de Origem</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-xs font-black text-slate-600 uppercase truncate">{viewingItem.dadosSIPAC.unidadeOrigem || 'Não identificada'}</span>
                      </div>
                    </div>
                    <div className="lg:col-span-2">
                      <span className="block text-[9px] font-black text-slate-300 uppercase mb-2 tracking-widest">Unidade sob Custódia (Local Atual)</span>
                      <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100 h-10 flex items-center">
                        <span className="text-xs font-black text-slate-600 uppercase truncate">
                          {viewingItem.dadosSIPAC.movimentacoes && viewingItem.dadosSIPAC.movimentacoes.length > 0
                            ? viewingItem.dadosSIPAC.movimentacoes[0].unidadeDestino
                            : viewingItem.dadosSIPAC.unidadeOrigem}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Seção 2.5: Análise Financeira Inteligente */}
                <div className="bg-white rounded-lg border border-slate-200 p-10 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-1 px-2 bg-emerald-50 rounded-md text-emerald-600">
                                <DollarSign size={14} strokeWidth={3} />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Execução Financeira (Smart Scan)</span>
                        </div>

                        {!financialData && (
                            <button
                                onClick={handleRunFinancialAnalysis}
                                disabled={isAnalyzingFinancials}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 uppercase tracking-widest"
                            >
                                {isAnalyzingFinancials ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                {isAnalyzingFinancials ? 'Analisando Docs...' : 'Realizar Varredura Financeira'}
                            </button>
                        )}
                    </div>

                    {financialData ? (
                         <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <div className="flex justify-end mb-4">
                                 <button onClick={handleRunFinancialAnalysis} className="text-[10px] font-bold text-emerald-600 hover:underline flex items-center gap-1">
                                     <RefreshCw size={10} /> Atualizar Análise
                                 </button>
                             </div>
                             <FinancialTimeline financials={financialData} loading={isAnalyzingFinancials} />
                         </div>
                    ) : (
                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
                            <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm text-slate-300">
                                <DollarSign size={24} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-600">Nenhuma análise financeira disponível</h4>
                            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                                Clique em "Realizar Varredura" para que o sistema identifique automaticamente Notas de Empenho, Faturas e Pagamentos nos documentos anexados.
                            </p>
                        </div>
                    )}
                </div>

                {/* Seção 2.1: Resumo IA (DESATIVADO TEMPORARIAMENTE) */}
                {/* 
                {(isGeneratingSummary || viewingItem?.dadosSIPAC?.resumoIA) && (
                  ... resto do código do resumo IA ...
                )}
                */}


                <div className="space-y-4">

                  {/* 1. Interessados */}
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden transition-all">
                    <button
                      onClick={() => setExpandedSections(p => ({ ...p, interessados: !p.interessados }))}
                      className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-indigo-50 p-2 rounded-md text-indigo-600">
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
                            <div key={i} className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                              <span className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{interessado.tipo}</span>
                              <p className="text-sm font-bold text-slate-700">{interessado.nome}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Documentos do Processo */}
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden transition-all">
                    <button
                      onClick={() => setExpandedSections(p => ({ ...p, documentos: !p.documentos }))}
                      className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2 rounded-md text-blue-600">
                          <FileText size={20} />
                        </div>
                        <span className="font-black text-slate-800 uppercase text-xs tracking-widest">Documentos e Atas</span>
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full">{(viewingItem.dadosSIPAC.documentos || []).length}</span>
                      </div>
                      {expandedSections.documentos ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
                    </button>
                    {expandedSections.documentos && (
                      <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                        <div className="overflow-hidden border border-slate-100 rounded-lg">
                          <table className="w-full text-left">
                            <thead className="bg-slate-50/50">
                              <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Ordem</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Tipo de Documento</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Data</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Origem</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">Natureza</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase text-center">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(viewingItem.dadosSIPAC.documentos || []).map((doc, i) => {
                                // Busca se o documento existe no Data Lake
                                const lakeDoc = lakeDocuments.find(ld =>
                                  String(ld.sipacMetadata?.ordem) === String(doc.ordem) &&
                                  String(ld.sipacMetadata?.tipo) === String(doc.tipo)
                                );

                                return (
                                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-xs font-black text-slate-400">#{doc.ordem}</td>
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <span className="text-xs font-bold text-slate-800">{doc.tipo}</span>
                                        {lakeDoc && (
                                          <div className="flex flex-col gap-1 mt-0.5">
                                            {/* Status de Armazenamento */}
                                            <span className="text-[8px] font-black text-blue-500 uppercase tracking-tighter flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                                              <div className="w-1 h-1 bg-blue-500 rounded-full" />
                                              Data Lake Seguro
                                            </span>

                                            {lakeDoc.status === 'COMPLETED' && (
                                              <span className="text-[8px] font-black text-purple-600 uppercase tracking-tighter flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                                                <Sparkles size={8} className="text-purple-600" />
                                                IA Indexada
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-600 font-medium">{doc.data}</td>
                                    <td className="px-6 py-4 text-xs text-slate-600 font-medium uppercase">{doc.unidadeOrigem}</td>
                                    <td className="px-6 py-4 text-xs text-slate-500 font-bold uppercase">{doc.natureza || 'OSTENSIVO'}</td>
                                    <td className="px-6 py-4 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        {/* Ações de Visualização/Download - Interface Limpa */}
                                        {lakeDoc && lakeDoc.status === 'PROCESSING' ? (
                                          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                                            <RefreshCw size={12} className="animate-spin text-blue-500" />
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Processando...</span>
                                          </div>
                                        ) : lakeDoc ? (
                                          <>
                                            <button
                                              onClick={() => handleOpenLakeDoc(lakeDoc)}
                                              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
                                              title="Visualização via Data Lake"
                                            >
                                              <Eye size={14} strokeWidth={3} />
                                              <span className="text-[10px] font-black uppercase tracking-tight">Ver</span>
                                            </button>
                                            <button
                                              onClick={() => window.open(lakeDoc.downloadUrl, '_blank')}
                                              className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all font-black text-[10px] uppercase flex items-center gap-1"
                                              title="Download do Data Lake"
                                            >
                                              <Download size={14} />
                                            </button>
                                          </>
                                        ) : doc.url ? (
                                          doc.tipo.toUpperCase().includes('DESPACHO') ? (
                                            <button
                                              onClick={() => setPreviewUrl(doc.url as string)}
                                              className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                                              title="Visualizar despacho (SIPAC)"
                                            >
                                              <Eye size={14} />
                                              <span className="text-[10px] font-black uppercase tracking-tight">Ver</span>
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => window.open(doc.url as string, '_blank')}
                                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
                                              title="Baixar / Ver Documento (SIPAC)"
                                            >
                                              <Download size={14} />
                                              <span className="text-[10px] font-black uppercase tracking-tight">Baixar</span>
                                            </button>
                                          )
                                        ) : (
                                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Pendente</span>
                                        )}
                                      </div>
                                    </td>

                                  </tr>
                                );
                              })}
                            </tbody>

                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. Movimentações */}
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden transition-all">
                    <button
                      onClick={() => setExpandedSections(p => ({ ...p, movimentacoes: !p.movimentacoes }))}
                      className="w-full px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-emerald-50 p-2 rounded-md text-emerald-600">
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
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* CHAT */}
      {isChatOpen && viewingItem && (
        <div className="fixed bottom-6 right-6 z-[150] w-[450px] h-[650px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-500">
          <header className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3"><div className="bg-blue-600 p-2 rounded-lg"><Bot size={20} strokeWidth={3} /></div><div><h3 className="text-sm font-black tracking-tight">Consultor Digital</h3><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Gemini 2.0 Flash Lite</p></div></div>
            <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/10 rounded-md transition-all"><X size={20} /></button>
          </header>
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
            {chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50 px-10">
                <Sparkles size={32} className="text-blue-500" />
                <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Inicie uma análise</p>
                <p className="text-[11px] font-medium text-slate-500">Farei a leitura dos documentos PDF em tempo real.</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 shadow-sm rounded-tl-none'}`}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {(isThinking || isExtracting) && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <RefreshCw size={14} className="animate-spin text-blue-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isExtracting ? 'Lendo PDFs...' : 'Analisando...'}</span>
                </div>
              </div>
            )}
          </div>
          <div className="p-4 bg-white border-t border-slate-100 shrink-0">
            <div className="relative flex items-center">
              <input type="text" value={chatQuery} onChange={(e) => setChatQuery(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Pergunte sobre o processo..." className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
              <button onClick={handleSendMessage} disabled={isThinking || isExtracting || !chatQuery.trim()} className="absolute right-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 transition-all shadow-lg active:scale-95"><Send size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingItem && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden font-sans"><header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20"><div className="flex items-center gap-5"><div className="p-2 bg-ifes-blue/10 rounded-lg text-ifes-blue"><ExternalLink size={24} strokeWidth={2.5} /></div><div><h2 className="text-2xl font-black text-slate-900 tracking-tight">Vincular Protocolo</h2></div></div><button onClick={() => setIsEditModalOpen(false)} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"><X size={28} /></button></header><main className="p-10 space-y-10 custom-scrollbar overflow-y-auto max-h-[80vh]"><section className="bg-slate-50 rounded-xl border border-slate-200 p-8 space-y-6"><div className="flex flex-col md:flex-row gap-6 items-start"><div className="flex-1 w-full space-y-4"><input type="text" placeholder="Protocolo (Ex: 23543...)" className="w-full px-4 py-3 border rounded-xl" value={editingItem.protocoloSIPAC || ''} onChange={(e) => setEditingItem({ ...editingItem, protocoloSIPAC: formatProtocolo(e.target.value) })} /><div className="flex gap-3"><button onClick={handleFetchSIPAC} disabled={isFetchingSIPAC || !editingItem.protocoloSIPAC} className="flex-1 py-3 bg-white border rounded-lg text-xs font-black">{isFetchingSIPAC ? 'Buscando...' : 'Consultar'}</button>{editingItem.protocoloSIPAC && editingItem.dadosSIPAC && <button onClick={() => handleUnlinkProcess(editingItem)} className="px-6 py-3 bg-red-50 text-red-600 rounded-lg font-black text-xs">Desvincular</button>}</div></div></div></section></main><footer className="p-8 bg-slate-50/80 border-t border-slate-100 flex gap-4"><button onClick={() => setIsEditModalOpen(false)} className="flex-1 px-8 py-4 bg-white border rounded-lg text-[10px] font-black">Cancelar</button><button onClick={handleSaveValues} disabled={saving || (!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC)} className="flex-[2] px-8 py-4 bg-ifes-blue text-white rounded-lg text-[10px] font-black">{saving ? 'Salvando...' : 'Salvar Vínculo'}</button></footer></div></div>)}
    </div>
  );
};

export default AnnualHiringPlan;
