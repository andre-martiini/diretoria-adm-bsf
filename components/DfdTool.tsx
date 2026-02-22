import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2, FileText, Calendar, AlertCircle, CheckCircle2, Loader2, FileDown, Copy, Download, Tags, Trash2, ChevronDown, ChevronUp, RefreshCw, ShieldCheck, History } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractNeeds, selectBestCandidate } from './Catmat/dfdAiService';
import { searchCatalog } from './Catmat/catalogService';
import logoIfes from '../logo-ifes.png';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GeneratedResult {
  succinctDescription: string;
  priorityClassification: 'Baixa' | 'Média' | 'Alta';
  needJustification: string;
  priorityJustification: string;
  expectedDate: string;
}

const DfdTool: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<SystemConfig | null>(null);
  
  const [view, setView] = useState<'form' | 'history'>('form');
  const [historyItems, setHistoryItems] = useState<any[]>([]);

  useEffect(() => {
    const h = localStorage.getItem('gestao_clc_dfd_history');
    if (h) setHistoryItems(JSON.parse(h));
  }, []);

  const deleteHistoryItem = (id: number) => {
    const newHist = historyItems.filter(h => h.id !== id);
    setHistoryItems(newHist);
    localStorage.setItem('gestao_clc_dfd_history', JSON.stringify(newHist));
  };

  const loadHistoryItem = (item: any) => {
    setObjectDescription(item.objectDescription);
    setExpectedDate(item.expectedDate);
    setNeedInput(item.needInput || '');
    setResult(item.result);
    setSiasgSuggestions(item.siasgSuggestions || []);
    setView('form');
  };

  useEffect(() => {
    const initConfig = async () => {
      const sysConfig = await fetchSystemConfig();
      setConfig(sysConfig);
    };
    initConfig();
  }, []);

  const [expectedDate, setExpectedDate] = useState('');
  const [objectDescription, setObjectDescription] = useState('');
  const [needInput, setNeedInput] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgencyReason, setUrgencyReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState('');

  // SIASG Suggestions State
  const [siasgSuggestions, setSiasgSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionProgress, setSuggestionProgress] = useState(0);
  const [suggestionPhase, setSuggestionPhase] = useState('');
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<number, boolean>>({});

  const toggleExpanded = (index: number) => {
    setExpandedSuggestions(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSwapAlternative = (suggestionIndex: number, alternativeItem: any) => {
    setSiasgSuggestions(prev => {
      const newSuggs = [...prev];
      const sugg = newSuggs[suggestionIndex];
      
      const oldBest = {
        codigoMaterial: sugg.tag === 'CATMAT' ? sugg.codigo : undefined,
        codigoServico: sugg.tag === 'CATSER' ? sugg.codigo : undefined,
        descricaoMaterial: sugg.tag === 'CATMAT' ? sugg.descricao : undefined,
        descricaoServico: sugg.tag === 'CATSER' ? sugg.descricao : undefined,
      };
      
      const newAlternatives = sugg.alternativas.filter((a: any) => a !== alternativeItem);
      newAlternatives.unshift(oldBest);
      
      newSuggs[suggestionIndex] = {
        ...sugg,
        codigo: alternativeItem.codigoMaterial || alternativeItem.codigoServico,
        descricao: alternativeItem.descricaoMaterial || alternativeItem.descricaoServico,
        justificativa: "Item selecionado manualmente pelo usuário como alternativa.",
        alternativas: newAlternatives
      };
      return newSuggs;
    });
  };

  const handleSuggestSiasg = async () => {
    if (!objectDescription || !needInput) {
      setError('Por favor, preencha a descrição do objeto e a necessidade antes de sugerir os códigos.');
      return;
    }
    setError('');
    setLoadingSuggestions(true);
    setSuggestionProgress(0);
    setSuggestionPhase('Analisando contexto...');
    
    try {
      const combinedText = `Objeto: ${objectDescription}\nNecessidade: ${needInput}`;
      const needs = await extractNeeds(combinedText);
      const results: any[] = [];
      
      const totalSteps = 1 + (needs.length * 2);
      let currentStep = 1;
      setSuggestionProgress(Math.round((currentStep / totalSteps) * 100));

      for (const need of needs) {
        setSuggestionPhase(`Buscando catálogo para: ${need.necessidade}`);
        const candidates = await searchCatalog(need.termos_busca, need.tipo, 30);
        
        currentStep++;
        setSuggestionProgress(Math.round((currentStep / totalSteps) * 100));

        if (candidates.length > 0) {
          setSuggestionPhase(`Selecionando melhor item para: ${need.necessidade}`);
          const best = await selectBestCandidate(need.necessidade, candidates);
          
          currentStep++;
          setSuggestionProgress(Math.round((currentStep / totalSteps) * 100));
          
          if (best) {
            results.push({
              tag: need.tipo,
              codigo: best.codigo_selecionado,
              descricao: best.descricao_selecionada,
              justificativa: best.justificativa,
              valor_estimado: need.valor_estimado,
              alternativas: candidates.filter(c => String(c.codigoMaterial || c.codigoServico) !== String(best.codigo_selecionado)).slice(0, 5)
            });
          }
        } else {
          currentStep++;
          setSuggestionProgress(Math.round((currentStep / totalSteps) * 100));
        }
      }
      setSiasgSuggestions(results);
    } catch (err: any) {
      console.error('Erro na IA de SIASG:', err);
      setError(`Erro ao sugerir códigos SIASG: ${err.message}`);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const removeSiasgSuggestion = (index: number) => {
    setSiasgSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedDate || !objectDescription || !needInput) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    if (isUrgent && !urgencyReason) {
      setError('Por favor, descreva o motivo da urgência.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!rawApiKey) {
        throw new Error('Chave de API do Gemini não encontrada no arquivo .env.local');
      }

      const apiKey = rawApiKey.trim();
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Tentativa 1: Modelo solicitado (2.5 Flash Lite)
      let modelName = 'gemini-2.5-flash-lite';
      let model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
Contexto Institucional: Ifes - Campus Barra de São Francisco.
Tarefa: Gerar uma Justificativa da Necessidade formal e técnica baseada no input simplificado do usuário para um Documento de Formalização da Demanda (DFD).

Lógica de Prioridade:
Se o usuário marcou como Urgente, a prioridade é "Alta" e você deve gerar a justificativa da prioridade baseada no motivo da urgência.
Se não é Urgente, arbitre entre "Baixa" ou "Média" conforme a natureza do objeto e a data de entrega desejada, e crie a justificativa dessa prioridade.

ESTRITAMENTE FORMAL E TÉCNICO (REGRAS DE OURO):
- O texto DEVE seguir rigorosamente o Manual de Redação da Presidência da República.
- ELIMINE QUALQUER INFORMALIDADE: Transforme gírias, coloquialismos ou reclamações em termos técnicos. 
- Exemplo: Se o usuário disser "o pessoal tá reclamando que tá ruim", escreva "foi identificada a necessidade de atualização para garantir a continuidade operacional e o bem-estar da comunidade acadêmica".
- Use voz passiva e terceira pessoa do singular (ex: "faz-se necessário", "observa-se").
- Priorize termos como "infraestrutura", "fomento", "otimização", "atendimento à legislação vigente".
- O resultado deve ser pronto para um documento oficial, sem NENHUM traço de informalidade do input original.

Inputs do Usuário:
Data Desejada para Conclusão/Entrega: ${expectedDate}
Descrição do Objeto: ${objectDescription}
Explicação do Usuário (Por que comprar): ${needInput}
Indicador de Urgência: ${isUrgent ? 'Sim' : 'Não'}
Motivo da Urgência (se houver): ${urgencyReason}

Retorne EXATAMENTE e APENAS um objeto JSON válido (sem marcadores de markdown como \`\`\`json) com a seguinte estrutura:
{
  "succinctDescription": "Descrição sucinta do objeto (máximo 200 caracteres)",
  "priorityClassification": "Baixa", // Ou "Média" ou "Alta"
  "needJustification": "Texto formal e técnico da Justificativa da Necessidade, focado no contexto do Ifes - Campus Barra de São Francisco.",
  "priorityJustification": "Texto fundamentando o grau de urgência/prioridade definido."
}
      `;

      let aiResponse;
      try {
        aiResponse = await model.generateContent(prompt);
      } catch (firstTryErr: any) {
        console.warn(`[Gemini] Erro no modelo ${modelName}:`, firstTryErr.message);
        // Fallback para 1.5 se o 2.5-lite falhar (pode ser restrição da chave)
        modelName = 'gemini-1.5-flash';
        model = genAI.getGenerativeModel({ model: modelName });
        aiResponse = await model.generateContent(prompt);
      }

      const responseText = aiResponse.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
      const parsedResult = JSON.parse(responseText);

      const finalResult = {
        ...parsedResult,
        expectedDate
      };
      setResult(finalResult);

      setHistoryItems(prev => {
        const item = {
          id: Date.now(),
          timestamp: Date.now(),
          objectDescription,
          needInput,
          expectedDate,
          result: finalResult,
          siasgSuggestions
        };
        const newHist = [item, ...prev].slice(0, 50);
        localStorage.setItem('gestao_clc_dfd_history', JSON.stringify(newHist));
        return newHist;
      });
    } catch (err: any) {
      console.error('Erro detalhado do Gemini:', err);
      if (err.message?.includes('API key not valid')) {
        setError('A chave de API do Gemini ainda é reportada como inválida. Certifique-se de que a chave em VITE_GEMINI_API_KEY no .env.local é uma chave do "Google AI Studio" e não do Firebase.');
      } else {
        setError(`Erro: ${err.message}. Tente reiniciar o servidor.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-[#f8fafc] font-sans text-slate-800">
      {/* Standardized Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain" />
            <div className="flex flex-col border-l border-slate-100 pl-3">
              <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">IA Engine de DFD</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                {config?.unidadeGestora.nome || 'Campus Barra de São Francisco'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setView(view === 'history' ? 'form' : 'history')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all font-bold text-sm border cursor-pointer ${view === 'history' ? 'bg-ifes-green hover:bg-[#15803d] text-white border-none shadow-lg shadow-ifes-green/20' : 'bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green border-slate-100 hover:border-ifes-green/20'}`}
            >
              <History size={18} />
              <span className="hidden md:inline">{view === 'history' ? 'Novo DFD' : 'Histórico de DFDs'}</span>
            </button>
            <div className="w-[1px] h-6 bg-slate-200"></div>
            <button
              onClick={() => navigate('/ferramentas')}
              className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-red-200 cursor-pointer"
            >
              <ArrowLeft size={18} />
              <span className="hidden md:inline">Voltar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12 print:p-0 print:max-w-none space-y-8">
        
        {view === 'history' ? (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
               <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Histórico de DFDs</h2>
                  <p className="text-sm font-medium text-slate-500 mt-1">Seus últimos 50 documentos gerados</p>
               </div>
             </div>
             
             {historyItems.length === 0 ? (
               <div className="py-24 flex flex-col items-center justify-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 text-slate-300 shadow-sm">
                  <History size={48} className="mb-6 opacity-20" />
                  <h3 className="font-black text-sm uppercase tracking-[0.3em]">Nenhum DFD no cache</h3>
                  <p className="text-xs font-medium mt-2">Dê vida as contatações na engine de DFD.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 <AnimatePresence>
                   {historyItems.map((item) => (
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.95 }} 
                       animate={{ opacity: 1, scale: 1 }} 
                       exit={{ opacity: 0, scale: 0.9 }}
                       key={item.id} className="glass bg-white/70 p-6 rounded-[2.5rem] border border-white/40 shadow-sm hover:shadow-premium hover:border-ifes-green/40 transition-all flex flex-col justify-between group"
                     >
                        <div className="flex justify-between items-start mb-4">
                           <span className="text-[10px] font-black text-white bg-slate-900 px-3 py-1.5 rounded-lg uppercase tracking-widest">
                              {new Date(item.timestamp).toLocaleString()}
                           </span>
                           <button onClick={() => deleteHistoryItem(item.id)} className="w-8 h-8 rounded-full bg-white shadow outline outline-1 outline-slate-100 text-slate-300 flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:outline-red-100 transition-all opacity-0 group-hover:opacity-100">
                             <Trash2 size={14} />
                           </button>
                        </div>
                        <h4 className="text-lg font-bold text-slate-800 leading-snug tracking-tight mb-2 line-clamp-2">
                          {item.objectDescription}
                        </h4>
                        <p className="text-sm text-slate-500 line-clamp-3 mb-6">
                          {item.result?.succinctDescription}
                        </p>
                        <button 
                          onClick={() => loadHistoryItem(item)}
                          className="w-full py-3 bg-ifes-green/10 text-ifes-green rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-ifes-green hover:text-white transition-colors"
                        >
                          Carregar DFD
                        </button>
                     </motion.div>
                   ))}
                 </AnimatePresence>
               </div>
             )}
           </motion.div>
        ) : (
          <>
        <motion.section 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative print:hidden"
        >
          <div className="absolute inset-0 bg-ifes-green/5 rounded-[2.5rem] -rotate-1 scale-105 pointer-events-none"></div>
          <div className="relative glass bg-white/70 p-8 rounded-[2.5rem] shadow-premium border border-white/40 backdrop-blur-xl flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <Wand2 className="text-ifes-green" size={28} />
                Assistente de Formalização
              </h2>
              <p className="text-slate-500 font-medium text-sm mt-1">Gere justificativas técnicas e documentos formais instantaneamente com Inteligência Artificial.</p>
            </div>
          </div>
        </motion.section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block">
          
          {/* Formulário */}
          <div className="glass bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-premium print:hidden">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">1</div>
              <h2 className="text-lg font-bold text-slate-800">Dados da Contratação</h2>
            </div>

            <form onSubmit={handleGenerate} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Data Desejada da Entrega/Conclusão *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="date"
                    required
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-ifes-green focus:border-transparent transition-all outline-none text-sm font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Descrição do Objeto *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ex: Lápis preto nº 2"
                  value={objectDescription}
                  onChange={(e) => setObjectDescription(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-ifes-green focus:border-transparent transition-all outline-none resize-none text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Por que precisamos dessa compra? (Necessidade) *</label>
                <div className="relative">
                  <textarea
                    required
                    rows={3}
                    placeholder="Explique brevemente com suas palavras..."
                    value={needInput}
                    onChange={(e) => setNeedInput(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-ifes-green focus:border-transparent transition-all outline-none resize-none mb-3 text-sm font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleSuggestSiasg}
                    disabled={loadingSuggestions}
                    className="flex items-center gap-2 bg-blue-100/50 hover:bg-blue-100 text-blue-700 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border border-blue-200 disabled:opacity-50"
                  >
                    {loadingSuggestions ? <Loader2 size={16} className="animate-spin" /> : <Tags size={16} />}
                    <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                      ✨ Sugerir Códigos SIASG (IA)
                    </span>
                  </button>
                  
                  {loadingSuggestions && (
                    <div className="mt-3 bg-white border border-blue-100 p-3 rounded-xl shadow-sm">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest leading-tight">{suggestionPhase}</span>
                        <span className="text-[10px] font-black text-blue-800 tabular-nums">{suggestionProgress}%</span>
                      </div>
                      <div className="w-full bg-blue-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full transition-all duration-300 ease-out" style={{ width: `${suggestionProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {siasgSuggestions.length > 0 && (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-4 rounded-xl space-y-3">
                   <div className="flex items-center justify-between">
                     <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                       Itens da Demanda (Códigos SIASG Sugeridos)
                     </h3>
                     <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md">
                        IA Ativa
                     </span>
                   </div>
                   {siasgSuggestions.map((item, idx) => (
                     <div key={idx} className="bg-white rounded-lg border border-slate-200 shadow-sm relative group overflow-hidden">
                        <div className="flex justify-between items-start gap-3 p-3">
                           <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                 <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-white ${item.tag === 'CATMAT' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                   {item.tag}
                                 </span>
                                 <span className="text-xs font-bold text-slate-700">Cód: {item.codigo}</span>
                                 <div className="flex items-center gap-1.5 ml-auto">
                                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                     Valor Est. R$
                                   </label>
                                   <input
                                     type="number"
                                     min="0"
                                     step="0.01"
                                     value={item.valor_estimado || ''}
                                     onChange={(e) => {
                                       const val = parseFloat(e.target.value);
                                       setSiasgSuggestions(prev => {
                                         const newSuggs = [...prev];
                                         newSuggs[idx].valor_estimado = isNaN(val) ? 0 : val;
                                         return newSuggs;
                                       });
                                     }}
                                     className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-bold text-slate-700 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                     placeholder="0,00"
                                   />
                                 </div>
                              </div>
                              <p className="text-sm font-bold text-slate-900 leading-tight mb-1">
                                {item.descricao}
                              </p>
                              <p className="text-xs text-slate-500 italic mt-2 border-l-2 border-slate-200 pl-2">
                                {item.justificativa}
                              </p>
                           </div>
                           <div className="flex flex-col items-center gap-1">
                             <button 
                               type="button" 
                               onClick={() => removeSiasgSuggestion(idx)}
                               className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-red-50"
                               title="Remover Sugestão"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                        </div>

                        {item.alternativas && item.alternativas.length > 0 && (
                           <div className="border-t border-slate-100">
                             <button
                               type="button"
                               onClick={() => toggleExpanded(idx)}
                               className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-center gap-1 transition-colors uppercase tracking-widest"
                             >
                               {expandedSuggestions[idx] ? (
                                 <><ChevronUp size={12} /> Ocultar {item.alternativas.length} alternativas</>
                               ) : (
                                 <><ChevronDown size={12} /> Ver {item.alternativas.length} outras opções</>
                               )}
                             </button>
                             
                             {expandedSuggestions[idx] && (
                               <div className="bg-slate-50 p-3 flex flex-col gap-2 max-h-64 overflow-y-auto">
                                 {item.alternativas.map((alt: any, aIdx: number) => {
                                    const altCode = alt.codigoMaterial || alt.codigoServico;
                                    const altDesc = alt.descricaoMaterial || alt.descricaoServico;
                                    return (
                                      <div key={aIdx} className="bg-white border border-slate-200 p-2 rounded-lg flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition-colors">
                                        <div className="flex-1 min-w-0">
                                          <div className="text-[10px] font-bold text-slate-500 mb-0.5">Cód: {altCode}</div>
                                          <div className="text-xs font-medium text-slate-800 line-clamp-2 leading-snug" title={altDesc}>
                                            {altDesc}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleSwapAlternative(idx, alt)}
                                          className="flex-shrink-0 flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1.5 rounded-md text-[10px] font-bold transition-all shadow-sm"
                                        >
                                          <RefreshCw size={12} /> Escolher
                                        </button>
                                      </div>
                                    );
                                 })}
                               </div>
                             )}
                           </div>
                        )}
                     </div>
                   ))}
                </div>
              )}

              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="w-5 h-5 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-bold text-slate-800">Esta contratação é Urgente?</span>
                </label>
                
                {isUrgent && (
                  <div className="mt-4 pl-8">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Motivo da Urgência *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Descreva por que há urgência..."
                      value={urgencyReason}
                      onChange={(e) => setUrgencyReason(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 bg-ifes-green hover:bg-[#15803d] text-white p-4 rounded-xl font-black transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-ifes-green/20 uppercase tracking-widest text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Processando Demanda...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={20} />
                    <span>Sintetizar com IA</span>
                  </>
                )}
              </motion.button>
            </form>
          </div>

          {/* Resultado */}
          <div>
            <div className="sticky top-28 bg-[#1f2937] rounded-[2rem] p-6 md:p-8 shadow-premium border border-slate-700 text-white print:static print:bg-white print:text-slate-900 print:shadow-none print:p-0 print:border-0">
              
              {/* Header do Relatório com Melhor Contraste */}
              <div className="flex items-center justify-between mb-8 print:mb-12">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white ring-4 ring-[#1f2937] print:hidden font-black">
                     <FileText size={18} />
                   </div>
                   <div className="flex flex-col">
                      <h2 className="text-xl font-black text-white tracking-tight print:text-slate-900">Documento Gerado</h2>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest print:hidden">Versão Final</span>
                   </div>
                </div>
                {result && (
                   <button 
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 bg-ifes-green hover:bg-[#15803d] text-white px-4 py-2 flex-shrink-0 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-all print:hidden shadow-lg shadow-ifes-green/20"
                   >
                     <FileDown size={16} />
                     <span>Exportar PDF</span>
                   </button>
                )}
              </div>

              {/* Versão PDF Header (Oculta na Web) */}
              <div className="hidden print:flex items-center justify-between border-b-2 border-slate-200 pb-6 mb-8 text-slate-500 italic text-xs">
                <div className="flex items-center gap-4">
                   <img src="/logo-ifes.png" alt="Ifes Logo" className="h-12" />
                   <div>
                     <p className="font-bold text-slate-900 not-italic text-sm">Instituto Federal do Espírito Santo</p>
                     <p>Campus Barra de São Francisco</p>
                   </div>
                </div>
                <div className="text-right">
                  <p>Documento de Formalização da Demanda (DFD)</p>
                  <p>Emitido via Portal PCA Intelligence</p>
                </div>
              </div>

              {result ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                      <div className="flex justify-between items-start mb-1">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Conclusão</span>
                        <button onClick={() => handleCopy(new Date(result.expectedDate).toLocaleDateString('pt-BR'))} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={12} />
                        </button>
                      </div>
                      <div className="text-lg font-bold print:text-slate-900">{new Date(result.expectedDate).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                      <div className="flex justify-between items-start mb-1">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Prioridade</span>
                        <button onClick={() => handleCopy(result.priorityClassification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold
                            ${result.priorityClassification === 'Alta' ? 'bg-red-500/20 text-red-300 print:bg-red-50 print:text-red-700' : 
                              result.priorityClassification === 'Média' ? 'bg-amber-500/20 text-amber-300 print:bg-amber-50 print:text-amber-700' :
                              'bg-emerald-500/20 text-emerald-300 print:bg-emerald-50 print:text-emerald-700'}`}>
                           {result.priorityClassification}
                         </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Descrição Sucinta</span>
                       <button onClick={() => handleCopy(result.succinctDescription)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={14} />
                       </button>
                    </div>
                    <p className="text-sm font-bold leading-relaxed print:text-slate-900">{result.succinctDescription}</p>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200 print:mt-4">
                    <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Justificativa da Necessidade</span>
                       <div className="flex gap-2 print:hidden">
                          <button onClick={() => handleCopy(result.needJustification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={14} />
                          </button>
                       </div>
                    </div>
                    <p className="text-sm/relaxed text-slate-200 whitespace-pre-wrap print:text-slate-800">{result.needJustification}</p>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200 print:mt-4">
                     <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Justificativa de Prioridade</span>
                       <button onClick={() => handleCopy(result.priorityJustification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={14} />
                       </button>
                    </div>
                    <p className="text-sm/relaxed text-slate-200 whitespace-pre-wrap print:text-slate-800">{result.priorityJustification}</p>
                  </div>

                  {siasgSuggestions.length > 0 && (
                    <div className="bg-slate-700/50 p-4 rounded-xl print:bg-slate-50 print:border print:border-slate-200 print:mt-4">
                       <div className="flex justify-between items-start mb-3">
                         <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">
                           Itens da Demanda (Catálogo SIASG)
                         </span>
                       </div>
                       <div className="space-y-2">
                         {siasgSuggestions.map((item, idx) => (
                           <div key={idx} className="bg-slate-800/50 p-3 rounded-lg print:bg-white print:border print:border-slate-100 flex justify-between items-center gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider text-white ${item.tag === 'CATMAT' ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                    {item.tag}
                                  </span>
                                  <span className="text-xs font-bold text-emerald-400 print:text-slate-600">Cód: {item.codigo}</span>
                                </div>
                                <p className="text-xs font-bold text-slate-200 print:text-slate-800 line-clamp-2" title={item.descricao}>{item.descricao}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500 mb-0.5">Valor Estimado</p>
                                 <p className="text-sm font-black text-amber-400 print:text-amber-700">
                                   R$ {Number(item.valor_estimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                 </p>
                              </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                  
                  <div className="mt-8 flex items-center justify-center gap-2 text-emerald-400 font-bold bg-emerald-900/40 p-3 rounded-lg border border-emerald-500/30 print:hidden">
                     <CheckCircle2 size={18} />
                     <span>Pronto para submissão oficial</span>
                  </div>

                  <div className="hidden print:block mt-20 text-[10px] text-slate-400 border-t border-slate-100 pt-4 text-center">
                    Documento gerado eletronicamente em {new Date().toLocaleString('pt-BR')} via Portal PCA Intelligence. 
                    Este é um draft técnico para composição do Documento de Formalização da Demanda.
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-4">
                  <Wand2 size={48} className="opacity-20" />
                  <p className="text-center text-sm font-medium">Preencha os dados e clique em gerar<br/>para receber a documentação formal.</p>
                </div>
              )}
            </div>
          </div>

          </div>
        </>
        )}
      </main>
    </div>
  );
};

export default DfdTool;
