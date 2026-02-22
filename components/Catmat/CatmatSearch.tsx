
import React, { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Database, RefreshCw, Brain, CheckCircle, PlusCircle, Copy, Check, MessageSquare, History, Trash2 } from 'lucide-react';
import { ServiceItem, MaterialItem, AppView } from './types';
import { parseFile } from './parser';
import { db } from './db';
import { getSmartExpansion, SearchExpansion } from './geminiService';
import MiniSearch from 'minisearch';
import { motion, AnimatePresence } from 'motion/react';

const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em', 'na', 'no', 'ou', 'e', 'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'por']);

// Caching in memory context outside of component lifecycle
let globalCatserCatalog: ServiceItem[] | null = null;
let globalCatmatCatalog: MaterialItem[] | null = null;
let globalCatserIndex: MiniSearch<any> | null = null;
let globalCatmatIndex: MiniSearch<any> | null = null;

const LOCAL_URLS = {
  catser: '/data/Lista_CATSER_CORRIGIDA.xlsx',
  catmat: '/data/Lista_CATMAT.xlsx'
};

const toSentenceCase = (str: string) => {
  if (!str) return '';
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export default function CatmatSearch() {
  const navigate = useNavigate();
  const [view, setView] = useState<AppView | 'syncing' | 'history'>('syncing');
  const [catserCatalog, setCatserCatalog] = useState<ServiceItem[]>([]);
  const [catmatCatalog, setCatmatCatalog] = useState<MaterialItem[]>([]);
  
  // Estados de busca
  const [searchInput, setSearchInput] = useState('');
  const deferredSearchTerm = useDeferredValue(searchInput);
  const [filterGroup, setFilterGroup] = useState('Todos');
  
  // Estados da IA e Filtros Semânticos
  const [expansion, setExpansion] = useState<SearchExpansion | null>(null);
  const [activeExpansionTerms, setActiveExpansionTerms] = useState<string[]>([]);
  const [isExpanding, setIsExpanding] = useState(false);
  
  const [syncTarget, setSyncTarget] = useState<'CATSER' | 'CATMAT' | null>(null);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'downloading' | 'parsing' | 'saving'>('idle');
  const [progress, setProgress] = useState(0);
  
  const [searchHistory, setSearchHistory] = useState<{term: string, timestamp: number}[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  useEffect(() => {
    const h = localStorage.getItem('gestao_clc_catmat_history');
    if (h) setSearchHistory(JSON.parse(h));
  }, []);

  const deleteHistoryItem = (term: string) => {
    const newHist = searchHistory.filter(h => h.term !== term);
    setSearchHistory(newHist);
    localStorage.setItem('gestao_clc_catmat_history', JSON.stringify(newHist));
  };
  
  const clearAllHistory = () => {
    if (confirm('Deseja realmente apagar todo o histórico de buscas?')) {
      setSearchHistory([]);
      localStorage.removeItem('gestao_clc_catmat_history');
    }
  };

  const sortDataByCode = (data: any[], key: string) => {
    return [...data].sort((a, b) => {
      const valA = String(a[key] || '');
      const valB = String(b[key] || '');
      const numA = parseInt(valA, 10);
      const numB = parseInt(valB, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return valA.localeCompare(valB);
    });
  };

  const downloadAndProcess = useCallback(async (type: 'catser' | 'catmat') => {
    const url = LOCAL_URLS[type];
    setSyncTarget(type.toUpperCase() as any);
    setSyncPhase('downloading');
    setProgress(0);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Falha ao ler arquivo local (${response.status})`);

      const contentLength = +(response.headers.get('Content-Length') || 0);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Falha ao ler dados.');

      let receivedLength = 0;
      let chunks = [];

      while(true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedLength += value.length;
        if (contentLength) {
          setProgress(Math.round((receivedLength / contentLength) * 100));
        } else {
          setProgress(Math.min(99, Math.round((receivedLength / 105000000) * 100)));
        }
      }

      setSyncPhase('parsing');
      setProgress(100);
      
      const blob = new Blob(chunks);
      const buffer = await blob.arrayBuffer();
      const isMat = type === 'catmat';
      let data = parseFile(buffer, isMat);

      if (data && data.length > 0) {
        setSyncPhase('saving');
        const sortedData = sortDataByCode(data, isMat ? 'codigoMaterial' : 'codigoServico');
        
        if (isMat) {
          globalCatmatCatalog = sortedData;
          setCatmatCatalog(sortedData);
          await db.saveCatalog('catmat', sortedData);
        } else {
          globalCatserCatalog = sortedData;
          setCatserCatalog(sortedData);
          await db.saveCatalog('catser', sortedData);
        }
        return true;
      }
      return false;
    } catch (err) {
      console.error(`Erro ao processar ${type}:`, err);
      return false;
    } finally {
      setSyncPhase('idle');
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      // Retorna imediatamente se já carregado globalmente nesta sessão
      if (globalCatserCatalog && globalCatmatCatalog) {
         setCatserCatalog(globalCatserCatalog);
         setCatmatCatalog(globalCatmatCatalog);
         setView('catser');
         return; 
      }

      const cachedSer = await db.getCatalog('catser');
      const cachedMat = await db.getCatalog('catmat');
      
      if (cachedSer) { globalCatserCatalog = cachedSer; setCatserCatalog(cachedSer); }
      if (cachedMat) { globalCatmatCatalog = cachedMat; setCatmatCatalog(cachedMat); }

      if (!cachedSer) {
        setView('syncing');
        await downloadAndProcess('catser');
      }
      if (!cachedMat) {
        setView('syncing');
        await downloadAndProcess('catmat');
      }
      
      const finalSer = globalCatserCatalog || await db.getCatalog('catser');
      if (finalSer && view === 'syncing') setView('catser');
    };
    init();
  }, [downloadAndProcess]);

  // Efeito para disparar a IA e gerenciar as tags ativas
  useEffect(() => {
    const term = deferredSearchTerm.trim();
    if (term.length < 3) {
      setExpansion(null);
      setActiveExpansionTerms([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsExpanding(true);

      // Save to history
      setSearchHistory(prev => {
        const hist = [{term, timestamp: Date.now()}, ...prev.filter(h => h.term !== term)].slice(0, 50);
        localStorage.setItem('gestao_clc_catmat_history', JSON.stringify(hist));
        return hist;
      });

      const result = await getSmartExpansion(term);
      if (result) {
        setExpansion(result);
        // Ativa o termo original + os sugeridos pela IA
        setActiveExpansionTerms([term, ...result.synonyms, ...result.categories]);
      } else {
        setExpansion(null);
        setActiveExpansionTerms([term]);
      }
      setIsExpanding(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [deferredSearchTerm]);

  const normalize = (text: string) => 
    text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const toggleTerm = (term: string) => {
    setActiveExpansionTerms(prev => 
      prev.includes(term) ? prev.filter(t => t !== term) : [...prev, term]
    );
    setCurrentPage(1);
  };

  const currentCatalog = useMemo(() => {
    return view === 'catser' ? catserCatalog : catmatCatalog;
  }, [view, catserCatalog, catmatCatalog]);

  // Cálculo de termos com contagem e ordenação decrescente (incluindo o original)
  const expansionTermsWithCounts = useMemo(() => {
    const baseTerm = deferredSearchTerm.trim();
    if (!baseTerm || currentCatalog.length === 0) return [];
    
    const aiTerms = expansion ? [...expansion.synonyms, ...expansion.categories] : [];
    const uniqueMap = new Map<string, string>();
    
    [baseTerm, ...aiTerms].forEach(t => {
      if (t.trim().length > 2) {
        const norm = normalize(t);
        if (!uniqueMap.has(norm)) uniqueMap.set(norm, t);
      }
    });
    
    const allUniquePotentialTerms = Array.from(uniqueMap.values());
    const countsMap: Record<string, number> = {};
    const normalizedList = allUniquePotentialTerms.map(t => ({ original: t, normalized: normalize(t) }));
    
    const catalogInGroup = filterGroup === 'Todos' 
      ? currentCatalog 
      : currentCatalog.filter(i => i.grupoDescricao === filterGroup);

    catalogInGroup.forEach(item => {
      const itemText = normalize(Object.values(item).join(' '));
      normalizedList.forEach(t => {
        if (itemText.includes(t.normalized)) {
          countsMap[t.original] = (countsMap[t.original] || 0) + 1;
        }
      });
    });

    return normalizedList
      .map(t => ({ term: t.original, count: countsMap[t.original] || 0 }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [expansion, currentCatalog, filterGroup, deferredSearchTerm]);

  // Criação dos Índices Invertidos (MiniSearch) imediatamente após carga em memória
  const catserIndex = useMemo(() => {
    if (globalCatserIndex) return globalCatserIndex;
    const miniSearch = new MiniSearch({
      idField: 'codigoServico',
      fields: ['descricaoServico', 'classeDescricao', 'grupoDescricao'],
      storeFields: ['codigoServico', 'grupoDescricao'],
      searchOptions: {
        boost: { descricaoServico: 3, classeDescricao: 1, grupoDescricao: 1 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: 'OR'
      },
      tokenize: (string) => string.toLowerCase().split(/[\s\-]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)),
      processTerm: (term) => term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    });
    if (catserCatalog.length > 0) {
      miniSearch.addAll(catserCatalog);
      globalCatserIndex = miniSearch;
    }
    return miniSearch;
  }, [catserCatalog]);

  const catmatIndex = useMemo(() => {
    if (globalCatmatIndex) return globalCatmatIndex;
    const miniSearch = new MiniSearch({
      idField: 'codigoMaterial',
      fields: ['descricaoMaterial', 'classeDescricao', 'grupoDescricao'],
      storeFields: ['codigoMaterial', 'grupoDescricao'],
      searchOptions: {
        boost: { descricaoMaterial: 3, classeDescricao: 1, grupoDescricao: 1 },
        fuzzy: 0.2,
        prefix: true,
        combineWith: 'OR'
      },
      tokenize: (string) => string.toLowerCase().split(/[\s\-]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)),
      processTerm: (term) => term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    });
    if (catmatCatalog.length > 0) {
      // Para evitar que a tela trave, ideal seria um Worker, mas o CACHE GLOBAL
      // evita que isso ocorra repedidas vezes
      miniSearch.addAll(catmatCatalog);
      globalCatmatIndex = miniSearch;
    }
    return miniSearch;
  }, [catmatCatalog]);

  const currentCatalogMap = useMemo(() => {
    const map = new Map<string, any>();
    const isMat = view === 'catmat';
    const idField = isMat ? 'codigoMaterial' : 'codigoServico';
    for (const item of currentCatalog) {
      map.set(String(item[idField]), item);
    }
    return map;
  }, [currentCatalog, view]);

  // Filtragem e RANKING por relevância com MiniSearch (BM25)
  const filteredData = useMemo(() => {
    if (view === 'syncing') return [];

    if (activeExpansionTerms.length === 0) {
      if (filterGroup === 'Todos') return currentCatalog;
      return currentCatalog.filter(item => item.grupoDescricao === filterGroup);
    }

    const currentSearchIndex = view === 'catser' ? catserIndex : catmatIndex;

    const queries = activeExpansionTerms.map(term => {
      const isOriginal = normalize(term) === normalize(deferredSearchTerm);
      return {
        queries: [term],
        boost: {
          descricaoServico: isOriginal ? 15 : 3,
          descricaoMaterial: isOriginal ? 15 : 3,
          classeDescricao: isOriginal ? 5 : 1,
          grupoDescricao: isOriginal ? 5 : 1
        }
      };
    });

    const searchResults = currentSearchIndex.search({
      combineWith: 'OR',
      queries
    }, {
      filter: (result) => filterGroup === 'Todos' || result.grupoDescricao === filterGroup
    });

    const mapped = [];
    for (const res of searchResults) {
      const item = currentCatalogMap.get(String(res.id));
      if (item) mapped.push(item);
    }

    return mapped;
  }, [currentCatalog, currentCatalogMap, view, catserIndex, catmatIndex, activeExpansionTerms, deferredSearchTerm, filterGroup]);

  // Checagem se existem resultados na OUTRA aba para o aviso de erro
  const existsInOtherCatalog = useMemo(() => {
    if (filteredData.length > 0 || deferredSearchTerm.trim().length < 3) return false;
    
    const otherIndex = view === 'catser' ? catmatIndex : catserIndex;
    const queries = activeExpansionTerms.length > 0 ? activeExpansionTerms : [deferredSearchTerm];
    
    const results = otherIndex.search({
      combineWith: 'OR',
      queries: queries.map(q => ({ queries: [q] }))
    });
    
    return results.length > 0;
  }, [filteredData, view, catserIndex, catmatIndex, activeExpansionTerms, deferredSearchTerm]);

  const groups = useMemo(() => {
    const set = new Set(currentCatalog.map(i => i.grupoDescricao));
    return ['Todos', ...Array.from(set)].filter(Boolean).sort();
  }, [currentCatalog]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const PaginationControls = ({ discrete = false }: { discrete?: boolean }) => {
    if (totalPages <= 1) return null;
    return (
      <div className={`flex items-center gap-1 ${discrete ? '' : 'mt-12 justify-center gap-2'}`}>
        <button 
          disabled={currentPage === 1}
          onClick={() => {setCurrentPage(p => p - 1); window.scrollTo(0,0)}}
          className={`${discrete ? 'w-8 h-8 rounded-lg' : 'px-6 py-3 rounded-xl'} bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:bg-slate-50 transition-all flex items-center justify-center`}
        >
          {discrete ? <i className="fas fa-chevron-left text-[8px]"></i> : 'Anterior'}
        </button>
        <div className={`${discrete ? 'px-2 text-slate-400 font-bold text-[10px]' : 'px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest'}`}>
          {discrete ? `${currentPage} / ${totalPages}` : `Pág. ${currentPage} / ${totalPages}`}
        </div>
        <button 
          disabled={currentPage === totalPages}
          onClick={() => {setCurrentPage(p => p + 1); window.scrollTo(0,0)}}
          className={`${discrete ? 'w-8 h-8 rounded-lg' : 'px-6 py-3 rounded-xl'} bg-white border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 disabled:opacity-30 hover:bg-slate-50 transition-all flex items-center justify-center`}
        >
          {discrete ? <i className="fas fa-chevron-right text-[8px]"></i> : 'Próxima'}
        </button>
      </div>
    );
  };

  const isService = view === 'catser';

  const handleRefresh = async () => {
    if (confirm('Deseja recarregar os catálogos agora? Isso refará a importação das planilhas internas.')) {
        await db.clear();
        window.location.reload();
    }
  };

  if (view === 'syncing') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">
            Carregando Catálogos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      <nav className="glass bg-white/70 h-24 px-8 flex items-center justify-between border-b border-white/40 sticky top-0 z-50 shadow-premium">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/ferramentas')}
            className="flex flex-col items-center justify-center w-12 h-12 bg-white rounded-full hover:bg-slate-50 text-slate-400 hover:text-slate-800 transition-colors shadow-sm border border-slate-100"
            title="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-slate-900 leading-none tracking-tight uppercase">Pesquisa Inteligente</h1>
            <span className={`text-[10px] font-bold text-ifes-green uppercase tracking-widest mt-1`}>CATMAT & CATSER</span>
          </div>
          <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
          <div className="flex gap-2">
            <button onClick={() => {setView('catser'); setCurrentPage(1)}} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'catser' ? `bg-ifes-green hover:bg-[#15803d] text-white shadow-lg shadow-ifes-green/20` : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'}`}>
              Serviços ({catserCatalog.length})
            </button>
            <button onClick={() => {setView('catmat'); setCurrentPage(1)}} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === 'catmat' ? `bg-ifes-green hover:bg-[#15803d] text-white shadow-lg shadow-ifes-green/20` : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'}`}>
              Materiais ({catmatCatalog.length})
            </button>
            <button onClick={() => setView('history')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${view === 'history' ? `bg-slate-900 text-white shadow-lg shadow-slate-900/20` : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'}`}>
              <History size={14} /> Histórico
            </button>
          </div>
        </div>
        <button onClick={handleRefresh} className="text-slate-400 hover:text-ifes-green transition-colors p-3 bg-white hover:bg-slate-50 rounded-full shadow-sm border border-slate-100" title="Atualizar Banco de Dados">
          <RefreshCw size={20} />
        </button>
      </nav>

      <main className="max-w-7xl w-full mx-auto p-8 flex-1">
        {view === 'history' ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
               <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Histórico de Buscas</h2>
                  <p className="text-sm font-medium text-slate-500 mt-1">Sujas últimas 50 pesquisas automáticas</p>
               </div>
               {searchHistory.length > 0 && (
                 <button onClick={clearAllHistory} className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-2xl border border-red-100 font-black text-[10px] uppercase tracking-widest hover:bg-red-100 transition-colors">
                   <Trash2 size={16} /> Limpar Tudo
                 </button>
               )}
             </div>
             
             {searchHistory.length === 0 ? (
               <div className="py-24 flex flex-col items-center justify-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-300">
                  <History size={48} className="mb-6 opacity-20" />
                  <h3 className="font-black text-sm uppercase tracking-[0.3em]">Nenhum histórico recente</h3>
                  <p className="text-xs font-medium mt-2">Suas buscas aparecerão aqui.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 <AnimatePresence>
                   {searchHistory.map((item, idx) => (
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.95 }} 
                       animate={{ opacity: 1, scale: 1 }} 
                       exit={{ opacity: 0, scale: 0.9 }}
                       key={item.timestamp} className="glass bg-white/70 p-6 rounded-[2rem] border border-white/40 shadow-sm hover:shadow-premium hover:border-ifes-green/40 transition-all flex flex-col justify-between group"
                     >
                        <div className="flex justify-between items-start mb-4">
                           <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg uppercase tracking-widest">
                              {new Date(item.timestamp).toLocaleString()}
                           </span>
                           <button onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.term); }} className="w-8 h-8 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                             <Trash2 size={14} />
                           </button>
                        </div>
                        <h4 className="text-xl font-bold text-slate-800 leading-snug tracking-tight mb-6 line-clamp-2">
                          "{item.term}"
                        </h4>
                        <button 
                          onClick={() => {
                            setSearchInput(item.term);
                            setView('catser');
                            setCurrentPage(1);
                          }}
                          className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
                        >
                          Repetir Busca
                        </button>
                     </motion.div>
                   ))}
                 </AnimatePresence>
               </div>
             )}
          </motion.div>
        ) : (
          <>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 mb-8">
              <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative group">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 group-focus-within:text-ifes-green transition-colors">
                {isExpanding ? <RefreshCw size={24} className="animate-spin text-ifes-green" /> : <Search size={24} className="text-slate-300 group-focus-within:text-ifes-green" />}
              </div>
              <input 
                type="text" 
                placeholder={`Pesquisar ${isService ? 'serviços' : 'materiais'}...`}
                value={searchInput}
                onChange={e => {setSearchInput(e.target.value); setCurrentPage(1)}}
                className={`w-full bg-white/80 border-2 border-white/60 rounded-[2rem] pl-16 pr-6 py-5 text-lg font-bold outline-none focus:bg-white focus:border-ifes-green/40 focus:ring-4 focus:ring-ifes-green/10 transition-all shadow-premium backdrop-blur-sm`}
              />
              {isExpanding && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                   <span className={`px-3 py-1 bg-ifes-green/10 text-ifes-green text-[10px] font-black uppercase rounded-lg border border-ifes-green/20`}>
                     Ranking Inteligente...
                   </span>
                </div>
              )}
            </div>
            <div className="md:w-72">
              <select 
                value={filterGroup}
                onChange={e => {setFilterGroup(e.target.value); setCurrentPage(1)}}
                className="w-full bg-white/80 border-2 border-white/60 focus:bg-white focus:border-ifes-green/40 focus:ring-4 focus:ring-ifes-green/10 rounded-[2rem] px-6 py-5 font-bold text-slate-600 outline-none appearance-none cursor-pointer shadow-premium backdrop-blur-sm transition-all"
              >
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          
          {expansionTermsWithCounts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass bg-white/70 border border-white/40 p-6 rounded-[2rem] shadow-premium">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Database size={16} className="text-ifes-green" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Palavras-chave Ativas (Itens com mais matches aparecem primeiro):
                  </span>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => setActiveExpansionTerms(expansionTermsWithCounts.map(t => t.term))} className="text-[9px] font-black text-ifes-green hover:underline uppercase tracking-widest">Ativar Todas</button>
                  <button onClick={() => setActiveExpansionTerms([])} className="text-[9px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest">Desmarcar</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {expansionTermsWithCounts.map(({ term, count }, i) => {
                  const isActive = activeExpansionTerms.includes(term);
                  const isOriginal = normalize(term) === normalize(deferredSearchTerm);
                  
                  return (
                    <button 
                      key={i} 
                      onClick={() => toggleTerm(term)}
                      className={`px-4 py-2.5 text-[10px] font-bold rounded-xl border transition-all flex items-center gap-2.5 ${isActive 
                        ? (isOriginal ? 'bg-slate-900 border-slate-900 text-white shadow-lg ring-2 ring-slate-200' : 'bg-ifes-green border-ifes-green text-white shadow-md shadow-ifes-green/20')
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    >
                      <span className="flex items-center gap-2">
                        {isActive ? <CheckCircle size={12} /> : <PlusCircle size={12} className="opacity-40" />}
                        <span className="uppercase">{term}</span>
                        {isOriginal && <span className="text-[7px] bg-white/20 px-1.5 py-0.5 rounded font-black tracking-tighter">BUSCA ORIGINAL</span>}
                      </span>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums ${isActive ? (isOriginal ? 'bg-slate-700 text-white' : 'bg-white/20 text-white') : 'bg-slate-100 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
              {expansion && (
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-ifes-green/10 flex items-center justify-center text-ifes-green flex-shrink-0">
                    <Brain size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dica da IA para o Catálogo</p>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                      "{expansion.explanation}"
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>

        <div className="flex justify-between items-center mb-6 px-1">
           <div className="flex items-center gap-4">
             <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Resultados Ordenados por Relevância</span>
               <span className="text-lg font-black text-slate-900 leading-none tabular-nums">
                {filteredData.length.toLocaleString()}
               </span>
             </div>
             {deferredSearchTerm !== searchInput && (
               <div className="flex items-center gap-2 bg-ifes-green/10 px-3 py-1.5 rounded-full border border-ifes-green/20">
                 <div className="w-2 h-2 bg-ifes-green rounded-full animate-ping"></div>
                 <span className="text-[9px] font-black text-ifes-green uppercase tracking-widest">Recalculando ranking...</span>
               </div>
             )}
           </div>
           <PaginationControls discrete={true} />
        </div>

        <div className="grid grid-cols-1 gap-4">
          {paginatedData.length === 0 ? (
            <div className={`py-32 flex flex-col items-center justify-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-300`}>
              {existsInOtherCatalog ? (
                <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <div className={`w-20 h-20 bg-ifes-green/10 text-ifes-green rounded-full flex items-center justify-center mx-auto mb-6 text-2xl border border-ifes-green/20`}>
                      <RefreshCw size={32} />
                   </div>
                   <h3 className={`font-black text-lg uppercase tracking-tight text-slate-800`}>Item encontrado na outra aba!</h3>
                   <p className="text-sm font-medium mt-2 text-slate-500 max-w-sm mx-auto">
                     Você está na aba de <b>{isService ? 'SERVIÇOS' : 'MATERIAIS'}</b>, mas encontramos resultados para sua busca em <b>{isService ? 'MATERIAIS' : 'SERVIÇOS'}</b>.
                   </p>
                   <button 
                     onClick={() => {setView(isService ? 'catmat' : 'catser'); setCurrentPage(1)}}
                     className={`mt-8 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-transform shadow-xl`}
                   >
                     Alternar para {isService ? 'Materiais' : 'Serviços'}
                   </button>
                </div>
              ) : (
                <>
                  <Search size={48} className="mb-6 opacity-20" />
                  <h3 className="font-black text-sm uppercase tracking-[0.3em]">Nada foi encontrado</h3>
                  <p className="text-xs font-medium mt-2">Tente ativar outras tags de sugestão da IA.</p>
                </>
              )}
            </div>
          ) : (
            paginatedData.map((item: any, idx) => {
              const code = item.codigoMaterial || item.codigoServico;
              const desc = item.descricaoMaterial || item.descricaoServico;
              return (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }} key={`${idx}-${code}`} className={`glass bg-white/70 p-6 rounded-[2rem] border border-white/40 shadow-sm flex items-center justify-between group hover:border-ifes-green/40 transition-all hover:shadow-premium`}>
                  <div className="flex-1 pr-6">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-[10px] font-black text-white bg-slate-900 px-2.5 py-1 rounded-lg uppercase tracking-widest`}>
                        CÓD {code}
                      </span>
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-lg text-ifes-green bg-ifes-green/10 border border-ifes-green/20`}>
                        {toSentenceCase(item.classeDescricao)}
                      </span>
                    </div>
                    <h4 className={`text-xl font-bold text-slate-800 group-hover:text-ifes-green leading-snug transition-colors tracking-tight`}>
                      {toSentenceCase(desc)}
                    </h4>
                    <div className="flex items-center gap-2 mt-3">
                      <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                      <p className="text-xs font-medium text-slate-500">
                        {toSentenceCase(item.grupoDescricao)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                     <button 
                       onClick={() => {
                          navigator.clipboard.writeText(String(code));
                          const btn = document.getElementById(`btn-copy-${code}`);
                          if (btn) {
                            const icon = btn.querySelector('i');
                            if (icon) {
                              icon.className = 'fas fa-check text-emerald-500 text-base scale-110 transition-transform';
                              setTimeout(() => {
                                icon.className = 'fas fa-copy text-base scale-100 transition-transform';
                              }, 2000);
                            }
                          }
                       }}
                       id={`btn-copy-${code}`}
                       className="w-10 h-10 rounded-lg bg-transparent text-slate-400 flex items-center justify-center hover:bg-slate-100 hover:text-ifes-green transition-all active:scale-95"
                       title="Copiar Código"
                     >
                       <Copy size={20} />
                     </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
        <PaginationControls />
        </>
        )}
      </main>
    </div>
  );
}
