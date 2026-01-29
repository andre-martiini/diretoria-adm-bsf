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
  AlertTriangle,
  Eye,
  Download,
  Sparkles,
  List
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
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import {
  ContractItem,
  SummaryData,
  Category,
  SortConfig,
  SIPACProcess,
  AIStructuredAnalysis
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid
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

  // Variáveis Dinâmicas de Configuração
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Inicialização da Configuração
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
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [dashboardView, setDashboardView] = useState<'planning' | 'status'>('planning');
  const [isItemsListModalOpen, setIsItemsListModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);
  const processedAISummaryRefs = useRef<Set<string>>(new Set());


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

  const generateAISummary = useCallback(async (item: ContractItem) => {
    // Evita loop infinito: se já tentamos processar este ID nesta sessão, aborta
    if (!item.id || processedAISummaryRefs.current.has(String(item.id))) return;

    if (!item.dadosSIPAC?.documentos || isGeneratingSummary) return;

    const currentDespachosCount = (item.dadosSIPAC.documentos || []).filter(d =>
      d.tipo.toUpperCase().includes('DESPACHO')
    ).length;

    // CASO ESPECIAL: Resumo já existe e o Flash também, mas não tem contagem salva (Legado).
    // Apenas atualizamos a contagem para servir de base para o futuro, sem gerar novo resumo.
    if (item.dadosSIPAC.resumoIA && item.dadosSIPAC.resumoIA_Flash && item.dadosSIPAC.despachosCount === undefined) {
      console.log(`[AI] Atualizando contagem base de despachos para ${item.protocoloSIPAC}`);

      const updatedSipacData = { ...item.dadosSIPAC, despachosCount: currentDespachosCount };
      const updatedItem = { ...item, dadosSIPAC: updatedSipacData };

      if (viewingItem?.id === item.id) setViewingItem(updatedItem);
      setData(prev => prev.map(i => (i.id === item.id || i.protocoloSIPAC === item.protocoloSIPAC) ? { ...i, dadosSIPAC: updatedSipacData } : i));

      const q = query(collection(db, 'pca_data'), where('protocoloSIPAC', '==', item.protocoloSIPAC));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((docSnap) => batch.update(docSnap.ref, { 'dadosSIPAC.despachosCount': currentDespachosCount }));
      if (!querySnapshot.empty) await batch.commit();
      return;
    }

    // Só gera se não houver resumo (detalhado ou flash) OU se o conteúdo mudou (hash)
    const needsSummary = !item.dadosSIPAC?.resumoIA ||
      !item.dadosSIPAC?.resumoIA_Flash ||
      (item.dadosSIPAC?.snapshot_hash && item.dadosSIPAC?.snapshot_hash !== item.dadosSIPAC?.last_ai_hash);

    if (!needsSummary) {
      console.log(`[AI] Resumo atualizado para ${item.protocoloSIPAC}. Pulando IA.`);
      return;
    }

    // Marca como processado para evitar retentativas infinitas em caso de erro
    processedAISummaryRefs.current.add(String(item.id));

    setIsGeneratingSummary(true);
    try {
      console.log(`[AI] Iniciando resumo para ${item.protocoloSIPAC}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 300s timeout (5 min)

      const resp = await fetch(`${API_SERVER_URL}/api/sipac/processo/resumo-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processoInfo: item.dadosSIPAC,
          documentos: item.dadosSIPAC.documentos
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) throw new Error('Ops! A inteligência artificial está tímida agora. Tente novamente em instantes.');

      const data = await resp.json();

      // Suporte para o novo formato JSON (Flash + Detalhado) ou legado
      const detailedSummary = data.relatorioDetalhado || data.summary || data.detailed || "";
      const flashSummary = data.resumoFlash || data.short || "";

      if (detailedSummary || flashSummary) {
        // Obter métricas de saúde e fase
        const lastMovDate = item.dadosSIPAC.movimentacoes?.[0]?.data || item.dadosSIPAC.dataAutuacion;
        const { score, daysIdle } = calculateHealthScore(lastMovDate);
        const internalPhase = deriveInternalPhase(item.dadosSIPAC.unidadeAtual || '');

        // Dados a atualizar
        const updatedSipacData: SIPACProcess = {
          ...item.dadosSIPAC,
          resumoIA: detailedSummary,
          resumoIA_Flash: flashSummary,
          analise_ia_estruturada: data.analise_ia_estruturada,
          despachosCount: currentDespachosCount,
          health_score: score,
          dias_sem_movimentacao: daysIdle,
          fase_interna_status: internalPhase,
          last_ai_hash: item.dadosSIPAC.snapshot_hash
        };

        // Atualiza o item atual localmente (mesmo se for grupo)
        if (viewingItem && String(viewingItem.id) === String(item.id)) {
          setViewingItem(prev => prev ? { ...prev, dadosSIPAC: updatedSipacData } : null);
        }

        // Atualiza a lista geral local
        setData(prev => prev.map(i => (i.id === item.id || i.protocoloSIPAC === item.protocoloSIPAC) ? { ...i, dadosSIPAC: updatedSipacData } : i));

        // PERSISTÊNCIA NO FIRESTORE (Query por protocolo)
        const q = query(
          collection(db, 'pca_data'),
          where('protocoloSIPAC', '==', item.protocoloSIPAC)
        );

        const querySnapshot = await getDocs(q);
        const batch = writeBatch(db);
        let updateCount = 0;

        querySnapshot.forEach((docSnap) => {
          batch.update(docSnap.ref, { dadosSIPAC: updatedSipacData });
          updateCount++;
        });

        if (updateCount > 0) {
          await batch.commit();
          console.log(`[AI] Resumo salvo para ${updateCount} itens vinculados ao protocolo ${item.protocoloSIPAC}`);
        } else {
          console.warn(`[AI] Nenhum item encontrado por protocolo. Tentando salvar pelo ID direto: ${item.id}`);
          // Só tenta salvar pelo ID se for um ID real (não virtual de grupo com barra)
          if (item.id && !String(item.id).includes('/') && !String(item.id).startsWith('process-group')) {
            const docRef = doc(db, 'pca_data', String(item.id));
            await updateDoc(docRef, { dadosSIPAC: updatedSipacData });
            console.log(`[AI] Resumo salvo via ID direto para ${item.id}`);
          } else {
            console.warn(`[AI] Impossível salvar via ID direto: ID inválido ou virtual (${item.id})`);
          }
        }
      }
    } catch (err) {
      console.error("[AI ERROR]", err);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [viewingItem, isGeneratingSummary]);

  useEffect(() => {
    fetchData(selectedYear);
  }, [selectedYear, fetchData]);

  // Trigger para resumo IA em segundo plano quando visualiza o processo
  useEffect(() => {
    if (isDetailsModalOpen && viewingItem?.dadosSIPAC) {
      generateAISummary(viewingItem);
    }
  }, [isDetailsModalOpen, viewingItem, generateAISummary]);

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
        const itemIds = selectedIds.map(id => String(id));
        const selectedItems = data.filter(i => selectedIds.includes(String(i.id)));

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

        setToast({ message: `Tudo pronto! Agrupamos ${selectedIds.length} itens ao processo ${editingItem.protocoloSIPAC}.`, type: "success" });
        setSelectedIds([]);
      } else {
        // Caso 2: Individual
        if (editingItem.dadosSIPAC && editingItem.protocoloSIPAC) {
          await linkItemsToProcess(editingItem.protocoloSIPAC, [String(editingItem.id)], editingItem.dadosSIPAC);
        } else {
          // Apenas atualização de campos sem processo (ou desvínculo)
          const docId = editingItem.isManual ? String(editingItem.id) : `${selectedYear}-${editingItem.id}`;
          const docRef = doc(db, "pca_data", docId);
          await setDoc(docRef, {
            ...editingItem,
            updatedAt: Timestamp.now()
          }, { merge: true });
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

        setToast({ message: "Prontinho! O vínculo individual foi realizado.", type: "success" });
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

      setToast({ message: "Vínculo removido! O item agora está livre para novas ações.", type: "success" });
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

      if (sipacData.scraping_last_error) {
        setToast({ message: `Ops! Parece que o SIPAC nos deu um retorno inesperado: ${sipacData.scraping_last_error}`, type: "error" });
        if (isFromDetails) setViewingItem(updatedItem);
        else setEditingItem(updatedItem);
        return;
      }

      if (isFromDetails) {
        setViewingItem(updatedItem);

        const targetIds = item.isGroup && item.childItems
          ? item.childItems.map(c => String(c.id))
          : [String(item.id)];

        await linkItemsToProcess(item.protocoloSIPAC, targetIds, updatedItem.dadosSIPAC!);

        const lastMovDate = updatedItem.dadosSIPAC!.movimentacoes?.[0]?.data || updatedItem.dadosSIPAC!.dataAutuacion;
        const metrics = calculateHealthScore(lastMovDate);

        const enhancedSipacData = {
          ...updatedItem.dadosSIPAC!,
          fase_interna_status: deriveInternalPhase(updatedItem.dadosSIPAC!.unidadeAtual || ''),
          health_score: metrics.score,
          dias_sem_movimentacao: metrics.daysIdle
        };

        setData(prev => prev.map(i => String(i.id) === String(item.id) ? {
          ...updatedItem,
          dadosSIPAC: enhancedSipacData
        } : i));

        targetIds.forEach(id => {
          updatePcaCache(selectedYear, id, { dadosSIPAC: updatedItem.dadosSIPAC });
        });

        setToast({ message: "Tudo atualizado! O que faremos a seguir?", type: "success" });
      } else {
        setEditingItem(updatedItem);
      }
    } catch (err) {
      console.error("Erro ao buscar SIPAC:", err);
      alert("Ops! Não encontramos esse protocolo no SIPAC. Pode conferir se o número está certinho?");
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
      setToast({ message: "Feito! A nova demanda já está no seu radar.", type: "success" });
    } catch (err) {
      console.error("Erro ao adicionar:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleViewAllDespachos = async () => {
    if (!viewingItem?.dadosSIPAC?.documentos) return;

    const despachos = viewingItem.dadosSIPAC.documentos.filter(d =>
      d.tipo.toUpperCase().includes('DESPACHO') && d.url
    );

    if (despachos.length === 0) {
      setToast({ message: "Nenhum despacho encontrado neste processo.", type: 'warning' });
      return;
    }

    setIsLoadingDespachos(true);
    setIsDespachosModalOpen(true);
    setDespachosContent([]);

    try {
      const results: { tipo: string, data: string, texto: string, ordem: string }[] = [];
      // Fetch documents one by one to avoid overloading or session issues
      for (const doc of despachos) {
        try {
          const resp = await fetch(`${API_SERVER_URL}/api/sipac/documento/conteudo?url=${encodeURIComponent(doc.url || '')}`);
          const data = await resp.json();
          if (data.text) {
            results.push({
              tipo: doc.tipo,
              data: doc.data,
              ordem: doc.ordem,
              texto: data.text
            });
            // Update UI as they come in
            setDespachosContent([...results]);
          }
        } catch (err) {
          console.error(`Error fetching despacho ${doc.ordem}:`, err);
        }
      }
    } catch (err) {
      setToast({ message: "Erro ao carregar textos dos despachos.", type: 'error' });
    } finally {
      setIsLoadingDespachos(false);
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

  // --- LÓGICA DE DADOS POR VISÃO ---
  const activeData = useMemo(() => {
    // Base always processed (sorted by value desc)
    let base = [...processedData];

    // Apply Global Search & Filters
    if (searchTerm) {
      const low = searchTerm.toLowerCase();
      base = base.filter(i => i.titulo.toLowerCase().includes(low) || i.area.toLowerCase().includes(low));
    }
    if (selectedCategory !== 'Todas') base = base.filter(i => i.categoria === selectedCategory);
    if (statusFilter !== 'Todos') base = base.filter(i => i.computedStatus === statusFilter);

    // View Specific Logic
    if (dashboardView === 'planning') {
      // PCA: Raw Data from PNCP (No Grouping, No Process Filter specific logic unless applied by user)
      // Just return the base list
      return base.sort((a, b) => b.valor - a.valor);
    } else {
      // Gestão de Processos: Agrupamento por Protocolo SIPAC
      const processItems = base.filter(i => i.protocoloSIPAC && i.protocoloSIPAC.length > 5);

      const groups: Record<string, ContractItem[]> = {};
      processItems.forEach(item => {
        const proto = item.protocoloSIPAC as string;
        if (!groups[proto]) groups[proto] = [];
        groups[proto].push(item);
      });

      const result = Object.values(groups).map(items => {
        const first = items[0];
        // SOMA VALOR TOTAL DO PROCESSO
        const totalValue = items.reduce((acc, i) => acc + i.valor, 0);

        // TÍTULO: Assunto Detalhado do SIPAC (solicitação do usuário)
        const processTitle = first.dadosSIPAC?.assuntoDetalhado || first.dadosSIPAC?.assuntoDescricao || first.titulo;

        return {
          ...first,
          id: `process-group-${first.protocoloSIPAC}`,
          titulo: processTitle, // Override do título para o assunto do processo
          valor: totalValue,
          isGroup: true,
          itemCount: items.length,
          childItems: items,
          // Mantém dadosSIPAC do primeiro item (todos devem ser iguais pois é o mesmo protocolo)
          dadosSIPAC: first.dadosSIPAC
        } as ContractItem;
      });

      return result.sort((a, b) => b.valor - a.valor);
    }
  }, [processedData, dashboardView, searchTerm, selectedCategory, statusFilter]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeData.slice(start, start + itemsPerPage);
  }, [activeData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(activeData.length / itemsPerPage);

  const closeToast = () => setToast(null);

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/30 relative font-sans">
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
                <button
                  onClick={() => setDashboardView('planning')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dashboardView === 'planning' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Plano de Contratação (PCA)
                </button>
                <button
                  onClick={() => setDashboardView('status')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${dashboardView === 'status' ? 'bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Gestão de Processos
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col">
              <span className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Ano Ref.</span>
              <div className="flex items-center gap-3">
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-ifes-green/5 text-ifes-green border border-ifes-green/20 rounded-md px-2 py-1 text-xs font-black outline-none focus:ring-2 focus:ring-ifes-green/40 transition-all cursor-pointer"
                >
                  {Object.keys(config?.pcaYearsMap || PCA_YEARS_MAP).sort((a, b) => b.localeCompare(a)).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="w-px h-8 bg-slate-100 mx-2" />

            <button
              onClick={() => fetchData(selectedYear, true)}
              disabled={isSyncing}
              className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl transition-all border border-blue-200 cursor-pointer disabled:opacity-50"
              title="Atualizar dados diretamente da PNCP"
            >
              <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-xs border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
            >
              <LayoutDashboard size={18} />
              <span className="hidden md:inline">Menu Princ.</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1920px] px-6 mx-auto py-8 space-y-8">

        {/* VISUALIZAÇÃO DO PLANEJAMENTO (PCA) */}
        {dashboardView === 'planning' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            {/* CHART GRID FOR PCA */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* KPI 1: Valor Total */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden group hover:border-ifes-green/30 transition-all">
                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                  <DollarSign size={80} className="text-ifes-green" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Valor Total Planejado</p>
                  <h3 className="text-3xl font-black text-slate-900 mb-6">{formatCurrency(summary.totalValue)}</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                      <span>Itens Vinculados a Processos</span>
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

              {/* CHART 1: Alocação por Categoria */}
              <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <Target size={14} className="text-ifes-green" />
                  Por Categoria
                </h3>
                <div className="h-[200px] w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => formatCurrency(v)}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* CHART 2: Cronograma Mensal */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                <h3 className="text-xs font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  <RefreshCw size={14} className="text-blue-500" />
                  Cronograma de Contratação (Inicio Vigência)
                </h3>
                <div className="h-[200px] w-full">
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
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VISUALIZAÇÃO DA GESTÃO DE PROCESSOS */}
        {dashboardView === 'status' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ProcessDashboard data={activeData} />
          </div>
        )}

        {/* TABELA DE DADOS (Compartilhada mas com dados diferentes) */}
        <div className={`bg-white rounded-2xl border ${dashboardView === 'planning' ? 'border-slate-200' : 'border-violet-100'} shadow-sm overflow-hidden flex flex-col font-sans mb-20`}>
          <div className={`p-6 border-b ${dashboardView === 'planning' ? 'border-slate-100 bg-slate-50/30' : 'border-violet-100 bg-violet-50/30'} flex flex-col md:flex-row items-center justify-between gap-6`}>
            <div>
              <h2 className={`text-xl font-black ${dashboardView === 'planning' ? 'text-slate-800' : 'text-violet-900'} tracking-tight`}>
                {dashboardView === 'planning' ? 'Detalhamento do Plano (PNCP)' : 'Processos em Andamento'}
              </h2>
              <p className={`text-[10px] font-bold ${dashboardView === 'planning' ? 'text-slate-400' : 'text-violet-400'} uppercase tracking-widest mt-1 italic`}>
                {dashboardView === 'planning' ? `Lista completa de itens importados do PNCP - Ano ${selectedYear}` : 'Listagem de processos com protocolo SIPAC vinculado'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input
                  type="text"
                  placeholder="Buscar por descrição ou área..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-ifes-green/20 transition-all"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
              </div>

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

              {dashboardView === 'planning' && (
                <div className="flex bg-slate-900/5 p-1 rounded-xl items-center mx-2">
                  {[
                    { label: 'Todas', value: 'Todas' },
                    { label: 'Bens', value: Category.Bens },
                    { label: 'Serviços', value: Category.Servicos },
                    { label: 'TIC', value: Category.TIC }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSelectedCategory(opt.value); setCurrentPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${selectedCategory === opt.value
                        ? 'bg-white text-slate-800 shadow-sm ring-1 ring-black/5'
                        : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-700 transition-colors shadow-sm"
              >
                <Plus size={16} />
                <span>Nova Demanda</span>
              </button>
            </div>
          </div>

          <ContractTable
            viewMode={dashboardView}
            data={pagedData}
            loading={loading}
            onSort={(key) => {
              const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
              setSortConfig({ key, direction });
            }}
            sortConfig={sortConfig}
            selectedIds={selectedIds}
            onToggleSelection={(id) => {
              setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
            }}
            onToggleAll={() => {
              const allIds = pagedData.map(i => String(i.id));
              if (allIds.every(id => selectedIds.includes(id))) {
                setSelectedIds(prev => prev.filter(id => !allIds.includes(id)));
              } else {
                setSelectedIds(prev => [...prev, ...allIds]);
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
            onViewSummary={(item) => {
              setViewingItem(item);
              setIsFlashModalOpen(true);
              if (!item.dadosSIPAC?.resumoIA_Flash) {
                generateAISummary(item);
              }
            }}
          />

          {!loading && totalPages > 1 && (
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 capitalize">Página {currentPage} de {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50"><ChevronLeft size={16} /></button>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border rounded-lg bg-white disabled:opacity-30 hover:bg-slate-50"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href={`https://pncp.gov.br/app/pca/${config?.unidadeGestora.cnpj || CNPJ_IFES_BSF}/${selectedYear}/${(config?.pcaYearsMap || PCA_YEARS_MAP)[selectedYear] || '12'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-ifes-green transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-ifes-green/10 p-3 rounded-xl text-ifes-green"><ExternalLink size={20} /></div>
              <div>
                <span className="block font-bold text-slate-800 tracking-tight">PNCP Oficial {selectedYear}</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">
                  {config?.unidadeGestora.nome || 'Campus São Mateus'} • Acesse o portal
                </span>
              </div>
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

      {/* Modal de Previsualização de Documento */}
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Visualizando Documento</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Portal SIPAC • Visualização Integrada</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <ExternalLink size={14} />
                  Abrir Original
                </a>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-800 relative group">
              <iframe
                src={previewUrl}
                className="w-full h-full border-none bg-white"
                title="Preview do Documento"
              />
              <div className="absolute inset-0 pointer-events-none border-4 border-transparent group-hover:border-blue-500/10 transition-all" />

              {/* Overlay Informativo em caso de erro de carregamento (X-Frame-Options) */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-6 py-4 rounded-2xl shadow-xl border border-white flex flex-col items-center gap-2 max-w-sm text-center">
                <p className="text-xs font-bold text-slate-600">
                  Se o documento não aparecer, clique em <b>"Abrir Original"</b> acima.
                </p>
                <p className="text-[10px] text-slate-400 font-medium">
                  Alguns documentos podem ter restrições de visualização direta.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Agregação de Despachos */}
      {isDespachosModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Leitura de Despachos</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Processo: {viewingItem?.protocoloSIPAC} • {despachosContent.length} despacho(s) extraído(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDespachosModalOpen(false)}
                className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-12 bg-slate-50/30 font-sans">
              {isLoadingDespachos && despachosContent.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-sm font-bold text-slate-400 animate-pulse">Extraindo textos do SIPAC...</p>
                </div>
              )}

              {despachosContent.map((desp, i) => (
                <article key={i} className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="bg-blue-600 text-white text-[10px] font-black w-6 h-6 rounded-lg flex items-center justify-center">#{desp.ordem}</span>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{desp.tipo}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{desp.data}</span>
                  </div>
                  <div className="p-8">
                    <div className="whitespace-pre-wrap font-serif text-sm text-slate-700 leading-relaxed tracking-wide selection:bg-blue-100">
                      {desp.texto}
                    </div>
                  </div>
                </article>
              ))}

              {!isLoadingDespachos && despachosContent.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-slate-400 font-bold italic">Nenhum texto de despacho pôde ser extraído.</p>
                </div>
              )}

              {isLoadingDespachos && despachosContent.length > 0 && (
                <div className="flex justify-center py-4">
                  <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase">
                    <RefreshCw size={12} className="animate-spin" />
                    Carregando mais despachos...
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <p className="text-[10px] font-bold text-slate-400 italic">
                Dica: Role para baixo para ler todos os despachos na ordem cronológica de inserção.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Valores */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
            <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-5">
                <div className="p-2 bg-ifes-blue/10 rounded-lg text-ifes-blue">
                  <ExternalLink size={24} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Vincular Protocolo</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Integração SIPAC / Planejamento</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"
              >
                <X size={28} />
              </button>
            </header>

            <main className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Coluna 1: Dados de Planejamento */}
              <div className="space-y-6">
                <div className="bg-slate-50/50 p-8 rounded-lg border border-slate-100 h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-6">
                    <Target className="text-ifes-blue" size={16} strokeWidth={3} />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Dados de Planejamento</span>
                  </div>

                  <div className="flex-1 space-y-5 overflow-y-auto pr-2 custom-scrollbar max-h-[280px]">
                    {(editingItem.isGroup || editingItem.id === 'bulk-selection') ? (
                      (editingItem.childItems || (editingItem.id === 'bulk-selection' ? data.filter(i => selectedIds.includes(String(i.id))) : [])).map((item, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-lg border border-slate-200/60 flex justify-between items-start gap-4">
                          <p className="text-xs font-bold text-slate-700 leading-tight flex-1">{item.titulo}</p>
                          <span className="text-[11px] font-black text-slate-500 font-mono whitespace-nowrap">{formatCurrency(item.valor)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="bg-white p-6 rounded-lg border border-slate-200/60 flex justify-between items-center">
                        <p className="text-sm font-bold text-slate-700 flex-1">{editingItem.titulo}</p>
                        <span className="text-sm font-black text-slate-500 font-mono">{formatCurrency(editingItem.valor)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-dashed border-slate-200 flex justify-between items-center">
                    <div>
                      <span className="block text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-1">Total Estimado</span>
                      <span className="text-2xl font-black text-ifes-green tabular-nums">{formatCurrency(editingItem.valor)}</span>
                    </div>
                    {editingItem.isManual && (
                      <button
                        onClick={() => {
                          handleDeleteItem(String(editingItem.id));
                          setIsEditModalOpen(false);
                        }}
                        className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        title="Remover Registro"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Coluna 2: Vínculo SIPAC */}
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Protocolo SIPAC</label>
                  <div className="flex flex-col gap-3">
                    <div className="relative">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                      <input
                        type="text"
                        placeholder="00000.000000/0000-00"
                        maxLength={20}
                        className="w-full pl-12 pr-6 py-5 bg-white border border-slate-200 rounded-lg text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all shadow-sm"
                        value={editingItem.protocoloSIPAC || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, protocoloSIPAC: formatProtocolo(e.target.value) })}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={handleFetchSIPAC}
                        disabled={isFetchingSIPAC}
                        className="flex-1 py-4 bg-ifes-blue hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest"
                      >
                        {isFetchingSIPAC ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                        {isFetchingSIPAC ? 'Consultando...' : 'Consultar'}
                      </button>
                      {editingItem.protocoloSIPAC && editingItem.dadosSIPAC && (
                        <button
                          onClick={() => handleUnlinkProcess(editingItem)}
                          className="px-6 py-4 bg-red-50 text-red-600 rounded-lg font-black hover:bg-red-600 hover:text-white transition-all border border-red-100 shadow-sm text-xs uppercase tracking-widest"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {editingItem.dadosSIPAC ? (
                  <div className="bg-ifes-blue/5 rounded-lg p-8 border border-ifes-blue/10 animate-in slide-in-from-right-4 duration-500 h-[240px] flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-ifes-blue animate-pulse" />
                          <span className="text-[10px] font-black text-ifes-blue uppercase tracking-[0.2em]">Sincronizado via SIPAC</span>
                        </div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase">{editingItem.dadosSIPAC.ultimaAtualizacao}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <span className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Status Atual</span>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight line-clamp-1">{editingItem.dadosSIPAC.status}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Unidade Atual</span>
                          <span className="text-xs font-black text-slate-800 uppercase tracking-tight line-clamp-1">{editingItem.dadosSIPAC.unidadeAtual}</span>
                        </div>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-ifes-blue/10">
                      <span className="block text-[8px] font-black text-slate-400 uppercase mb-2 tracking-widest">Assunto Registrado</span>
                      <p className="text-xs font-bold text-slate-600 leading-snug line-clamp-3 italic">
                        "{editingItem.dadosSIPAC.assuntoDetalhado || 'Sem detalhamento no SIPAC.'}"
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[240px] bg-slate-50 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-center p-8">
                    <div className="bg-white p-4 rounded-lg shadow-sm text-slate-300 mb-4">
                      <Link size={32} strokeWidth={1.5} />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest max-w-[180px]">Aguardando vínculo de processo</p>
                  </div>
                )}
              </div>
            </main>

            <footer className="p-8 bg-slate-50/80 border-t border-slate-100 flex gap-4 backdrop-blur-sm">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1 px-8 py-4 bg-white border border-slate-200 text-slate-500 rounded-lg text-[10px] font-black hover:bg-slate-100 hover:text-slate-800 transition-all uppercase tracking-[0.2em]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveValues}
                disabled={saving || (!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC)}
                className="flex-[2] px-8 py-4 bg-ifes-blue text-white rounded-lg text-[10px] font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-[0.2em]"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} strokeWidth={3} />}
                {!!editingItem.protocoloSIPAC && !editingItem.dadosSIPAC ? 'Validando...' : 'Prontinho! Salvar Vínculo'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Modal de Item Manual */}
      {
        isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
              <header className="px-10 py-10 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-ifes-blue/10 rounded-md text-ifes-blue">
                      <Plus size={18} strokeWidth={3} />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Gestão Extra-PCA</span>
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Nova Demanda</h2>
                </div>
                <button
                  onClick={() => setIsManualModalOpen(false)}
                  className="p-3 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all text-slate-400"
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

                {/* Seção 2.1: Resumo IA (Opcional - Gerado em segundo plano) */}
                {(isGeneratingSummary || viewingItem?.dadosSIPAC?.resumoIA) && (
                  <div className="bg-white rounded-lg text-slate-700 border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 text-blue-500/5 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                      <Sparkles size={160} />
                    </div>

                    <div className="relative z-10">
                      <div
                        className="flex items-center justify-between p-8 cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => setExpandedSections(p => ({ ...p, resumoIA: !p.resumoIA }))}
                      >
                        <div className="flex items-center gap-2">
                          <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                            <Sparkles size={16} />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Resumo Inteligente do Andamento</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {isGeneratingSummary && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50/50 rounded-full border border-blue-100">
                              <RefreshCw size={10} className="animate-spin text-blue-500" />
                              <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 animate-pulse">Processando Despachos...</span>
                            </div>
                          )}
                          <div className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-all">
                            {expandedSections.resumoIA ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                          </div>
                        </div>
                      </div>

                      {expandedSections.resumoIA && (
                        <div className="px-8 pb-8 animate-in slide-in-from-top-2 duration-300">
                          {isGeneratingSummary && !viewingItem?.dadosSIPAC?.resumoIA ? (
                            <div className="space-y-3">
                              <div className="h-4 bg-slate-100 rounded-full w-3/4 animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-full animate-pulse" />
                              <div className="h-4 bg-slate-100 rounded-full w-5/6 animate-pulse" />
                            </div>
                          ) : (
                            <div className="space-y-8">
                              {/* Structured Analysis Cards */}
                              {viewingItem?.dadosSIPAC?.analise_ia_estruturada && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg">
                                    <span className="block text-[8px] font-black text-slate-400 uppercase mb-2">Parecer de Risco</span>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${viewingItem.dadosSIPAC.analise_ia_estruturada.parecer_risco === 'Alto' ? 'bg-red-500' :
                                        viewingItem.dadosSIPAC.analise_ia_estruturada.parecer_risco === 'Médio' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`} />
                                      <span className="text-sm font-black text-slate-700">{viewingItem.dadosSIPAC.analise_ia_estruturada.parecer_risco}</span>
                                    </div>
                                  </div>
                                  <div className="bg-blue-50/50 border border-blue-100/50 p-4 rounded-lg md:col-span-2">
                                    <span className="block text-[8px] font-black text-blue-400 uppercase mb-2">Próxima Etapa Sugerida</span>
                                    <p className="text-sm font-bold text-blue-700">{viewingItem.dadosSIPAC.analise_ia_estruturada.proxima_etapa_sugerida}</p>
                                  </div>
                                  {(viewingItem.dadosSIPAC.analise_ia_estruturada.pendencias_detectadas || []).length > 0 && (
                                    <div className="md:col-span-3 bg-amber-50/50 border border-amber-100/50 p-4 rounded-lg">
                                      <span className="block text-[8px] font-black text-amber-500 uppercase mb-2">Pendências Detectadas</span>
                                      <div className="flex flex-wrap gap-2">
                                        {viewingItem.dadosSIPAC.analise_ia_estruturada.pendencias_detectadas.map((p, i) => (
                                          <span key={i} className="text-[10px] font-bold bg-white border border-amber-100 text-amber-700 px-2 py-1 rounded-lg">
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div className="text-sm font-medium leading-relaxed text-slate-600 selection:bg-blue-50 prose prose-slate max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {viewingItem?.dadosSIPAC?.resumoIA || ""}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}

                          <div className="mt-6 flex items-center gap-2 text-slate-400 font-medium italic text-[10px]">
                            <Info size={12} className="text-blue-400" />
                            Este resumo foi gerado automaticamente por IA analisando os textos extraídos dos despachos.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                              {(viewingItem.dadosSIPAC.documentos || []).map((doc, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4 text-xs font-black text-slate-400">#{doc.ordem}</td>
                                  <td className="px-6 py-4">
                                    <span className="text-xs font-bold text-slate-800">{doc.tipo}</span>
                                  </td>
                                  <td className="px-6 py-4 text-xs text-slate-600 font-medium">{doc.data}</td>
                                  <td className="px-6 py-4 text-xs text-slate-600 font-medium uppercase">{doc.unidadeOrigem}</td>
                                  <td className="px-6 py-4 text-xs text-slate-500 font-bold uppercase">{doc.natureza || 'OSTENSIVO'}</td>
                                  <td className="px-6 py-4 text-center">
                                    {doc.url ? (
                                      doc.tipo.toUpperCase().includes('DESPACHO') ? (
                                        <button
                                          onClick={() => setPreviewUrl(doc.url as string)}
                                          className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                          title="Visualizar despacho"
                                        >
                                          <Eye size={14} />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => window.open(doc.url as string, '_blank')}
                                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                          title="Baixar / Ver Documento"
                                        >
                                          <Download size={14} />
                                        </button>
                                      )
                                    ) : (
                                      <span className="text-[10px] font-bold text-slate-300 uppercase">N/D</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
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
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Incidentes (Opcional) */}
                  {viewingItem.dadosSIPAC.incidentes && viewingItem.dadosSIPAC.incidentes.length > 0 && (
                    <div className="bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden transition-all">
                      <button
                        onClick={() => setExpandedSections(p => ({ ...p, incidentes: !p.incidentes }))}
                        className="w-full px-8 py-5 flex items-center justify-between hover:bg-red-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-red-50 p-2 rounded-md text-red-600">
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
                              <div key={i} className="bg-red-50/30 rounded-lg border border-red-100 p-6 space-y-4">
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

                                <div className="bg-white/60 p-4 rounded-lg border border-red-100/50">
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
        )
      }

      {/* Barra de Ações em Massa */}
      {
        selectedIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-10 duration-500">
            <div className="bg-slate-900/90 backdrop-blur-md text-white px-8 py-4 rounded-xl shadow-2xl border border-white/10 flex items-center gap-8 min-w-[500px] justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-ifes-green rounded-md flex items-center justify-center text-white font-black shadow-lg">
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
                  className="bg-ifes-green hover:bg-emerald-500 text-white px-6 py-2.5 rounded-lg text-xs font-black transition-all shadow-lg flex items-center gap-2 active:scale-95"
                >
                  <Link size={16} />
                  Vincular Processo Único
                </button>
              </div>
            </div>
          </div>
        )
      }
      {/* Modal de Resumo Flash */}
      {
        isFlashModalOpen && viewingItem && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden border border-white">
              <div className="px-10 py-8 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50/50 to-white">
                <div className="flex items-center gap-5">
                  <div className="bg-ifes-blue p-3 rounded-md text-white shadow-lg shadow-blue-100">
                    <Sparkles size={24} className={isGeneratingSummary ? 'animate-pulse' : ''} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Resumo Executivo</h3>
                    <p className="text-[10px] font-black text-ifes-blue/60 uppercase tracking-[0.2em] mt-1">Análise Inteligente (IA Flash)</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsFlashModalOpen(false)}
                  className="p-2 bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-md transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-10">
                <div className="bg-slate-50/50 rounded-lg p-8 border border-slate-100 relative min-h-[140px] flex flex-col justify-center shadow-inner">
                  {isGeneratingSummary && !viewingItem?.dadosSIPAC?.resumoIA_Flash ? (
                    <div className="flex flex-col items-center gap-4 py-6">
                      <RefreshCw className="animate-spin text-ifes-blue" size={32} strokeWidth={3} />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Sintonizando inteligência...</p>
                    </div>
                  ) : (
                    <div className="text-lg font-medium text-slate-700 leading-relaxed prose prose-slate max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {viewingItem?.dadosSIPAC?.resumoIA_Flash || "Ops! Não conseguimos processar o resumo flash agora."}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-400">
                    <Info size={14} strokeWidth={2.5} className="text-ifes-blue/40" />
                    <span className="text-[11px] font-bold italic tracking-tight">
                      análise baseada em dados públicos extraídos dos despachos de processos publicados no SIPAC
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setIsFlashModalOpen(false);
                      setTimeout(() => setIsDetailsModalOpen(true), 100);
                    }}
                    className="text-[11px] font-black text-ifes-blue hover:text-blue-700 underline underline-offset-8 decoration-2 transition-all"
                  >
                    Ver Relatório Detalhado
                  </button>
                </div>
              </div>

              <div className="px-10 py-6 bg-slate-50/80 border-t border-slate-100 flex justify-end backdrop-blur-sm">
                <button
                  onClick={() => setIsFlashModalOpen(false)}
                  className="bg-ifes-blue text-white px-8 py-3 rounded-md font-black text-xs hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 uppercase tracking-widest"
                >
                  Entendido!
                </button>
              </div>
            </div>
          </div>
        )
      }
      {/* Modal de Lista de Itens do PCA (Agrupamento) */}
      {
        isItemsListModalOpen && viewingItem && viewingItem.childItems && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden border border-white flex flex-col max-h-[80vh]">
              <header className="px-8 py-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600 p-2.5 rounded-md text-white">
                    <List size={20} strokeWidth={3} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Plano de Contratação Anual</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Detalhamento dos Itens do Agrupamento</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsItemsListModalOpen(false)}
                  className="p-2 hover:bg-slate-100 text-slate-400 rounded-md transition-all"
                >
                  <X size={24} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 mb-8">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-tight">Processo Mãe (Agrupador)</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{viewingItem.titulo}</p>
                </div>

                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-4 py-3">Item / Descrição</th>
                        <th className="px-4 py-3">Categoria</th>
                        <th className="px-4 py-3">IFC</th>
                        <th className="px-4 py-3 text-right">Valor Estimado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingItem.childItems.map((child, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-xs font-bold text-slate-700 uppercase line-clamp-2" title={child.titulo}>{child.titulo}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-1 rounded-md border border-slate-200">{child.categoria}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-bold text-slate-600 tracking-tight">{child.identificadorFuturaContratacao || '-'}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-black text-slate-700 tracking-tighter">{formatCurrency(child.valor)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <footer className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Total do Grupo</span>
                  <span className="text-xl font-black text-blue-600 font-mono tracking-tighter">{formatCurrency(viewingItem.valor)}</span>
                </div>
                <button
                  onClick={() => setIsItemsListModalOpen(false)}
                  className="bg-ifes-blue text-white px-8 py-3 rounded-md font-black text-xs hover:bg-blue-700 transition-all uppercase tracking-widest"
                >
                  Fechar Lista
                </button>
              </footer>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default AnnualHiringPlan;
