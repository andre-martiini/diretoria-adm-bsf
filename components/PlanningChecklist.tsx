import React, { useMemo, useState } from 'react';
import { SIPACDocument, DocumentChecklistAIAnalysis } from '../types';
import { validateProcessDocuments, STANDARD_DOCUMENT_RULES, ARP_DOCUMENT_RULES, IRP_DOCUMENT_RULES } from '../services/documentValidationService';
import { CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, FileText, DollarSign, RefreshCw, Bot } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface PlanningChecklistProps {
  documents: SIPACDocument[];
  initialIsARP?: boolean;
  initialMode?: 'standard' | 'arp' | 'irp';
  onToggleARP?: (isARP: boolean) => void;
  onModeChange?: (mode: 'standard' | 'arp' | 'irp') => void;
  estimatedValue?: number | null;
  checklistAssociations?: Record<string, string>;
  onAssociateDocument?: (ruleId: string, documentOrder: string) => void;
  documentAiAnalyses?: Record<string, DocumentChecklistAIAnalysis>;
  isAnalyzingAiChecklist?: boolean;
  aiChecklistError?: string | null;
  onRefreshAiChecklist?: () => void;
}


const PlanningChecklist: React.FC<PlanningChecklistProps> = ({
  documents,
  initialIsARP = false,
  initialMode,
  onToggleARP,
  onModeChange,
  estimatedValue = null,
  checklistAssociations,
  onAssociateDocument,
  documentAiAnalyses,
  isAnalyzingAiChecklist = false,
  aiChecklistError = null,
  onRefreshAiChecklist
}) => {
  const [mode, setMode] = useState<'standard' | 'arp' | 'irp'>(() => initialMode || (initialIsARP ? 'arp' : 'standard'));
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);

  React.useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
      return;
    }
    if (initialIsARP && mode === 'standard') setMode('arp');
  }, [initialIsARP, initialMode]);

  const checklist = useMemo(() => {
    return validateProcessDocuments(documents, mode, checklistAssociations, estimatedValue, documentAiAnalyses);
  }, [documents, mode, checklistAssociations, estimatedValue, documentAiAnalyses]);

  const analysisByOrder = useMemo(() => {
    const map = new Map<string, DocumentChecklistAIAnalysis>();
    Object.values(documentAiAnalyses || {}).forEach((analysis) => {
      map.set(String(analysis.documentOrder), analysis);
    });
    return map;
  }, [documentAiAnalyses]);

  const ruleNameById = useMemo(() => {
    const allRules = [...STANDARD_DOCUMENT_RULES, ...ARP_DOCUMENT_RULES, ...IRP_DOCUMENT_RULES];
    const map = new Map<string, string>();
    allRules.forEach((rule) => {
      if (!map.has(rule.id)) map.set(rule.id, rule.nome);
    });
    return map;
  }, []);

  const handleModeChange = (newMode: 'standard' | 'arp' | 'irp') => {
    setMode(newMode);
    if (onModeChange) {
      onModeChange(newMode);
      return;
    }
    // Backward compatibility with legacy boolean handler
    if (onToggleARP) {
      onToggleARP(newMode === 'arp');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Presente': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'Pendente': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'Dispensado': return 'text-blue-600 bg-blue-50 border-blue-100';
      default: return 'text-slate-600 bg-slate-50 border-slate-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Presente': return <CheckCircle2 size={18} />;
      case 'Pendente': return <AlertTriangle size={18} />;
      case 'Dispensado': return <Info size={18} />;
      default: return <XCircle size={18} />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      {/* Header with Toggle */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FileText className="text-ifes-green" size={24} />
            Checklist de Documentação
          </h3>
          <p className="text-xs font-medium text-slate-400 mt-1">
            Validação automática baseada na IN 05/2017 e Lei 14.133/2021
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 overflow-x-auto">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2 whitespace-nowrap">Tipo de Processo:</span>

          <button
            onClick={() => handleModeChange('standard')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${mode === 'standard' ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Padrão
          </button>

          <button
            onClick={() => handleModeChange('arp')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${mode === 'arp' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Adesão ARP / Carona
          </button>

          <button
            onClick={() => handleModeChange('irp')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap ${mode === 'irp' ? 'bg-white text-purple-600 shadow-sm ring-1 ring-purple-200' : 'text-slate-400 hover:text-slate-600'}`}
          >
            IRP (Registro de Preços)
          </button>
        </div>

        <button
          onClick={() => onRefreshAiChecklist && onRefreshAiChecklist()}
          disabled={!onRefreshAiChecklist || isAnalyzingAiChecklist}
          className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          title="Atualizar analise IA por OCR dos documentos"
        >
          {isAnalyzingAiChecklist ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />}
          {isAnalyzingAiChecklist ? 'Analisando OCR...' : 'Reanalisar OCR com IA'}
        </button>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <button
          onClick={() => setIsAiSummaryOpen((prev) => !prev)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <h4 className="text-sm font-black text-slate-700 uppercase tracking-wide">Resumo IA por Documento</h4>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {Object.keys(documentAiAnalyses || {}).length} analisado(s)
            </span>
            {isAiSummaryOpen ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </button>

        {aiChecklistError && (
          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-bold">
            {aiChecklistError}
          </div>
        )}

        {isAiSummaryOpen && (
          <div className="grid grid-cols-1 gap-2">
            {documents.map((doc) => {
              const analysis = analysisByOrder.get(String(doc.ordem));
              return (
                <div key={`${doc.ordem}-${doc.tipo}`} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-black text-slate-700">{doc.ordem} - {doc.tipo}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {analysis ? `${analysis.matchedRules.length} regra(s)` : 'Sem analise'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    {analysis?.summary || 'Resumo nao disponivel para este documento.'}
                  </p>
                  {analysis && analysis.matchedRules.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {analysis.matchedRules.map((match, idx) => (
                        <span key={`${match.ruleId}-${idx}`} className="px-2 py-0.5 rounded-md text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {ruleNameById.get(match.ruleId) || match.ruleId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Checklist Grid */}
      <div className="grid grid-cols-1 gap-4">
        {checklist.map((item) => {
            const isMissing = item.status === 'Pendente';
            const isExpanded = expandedRuleId === item.rule.id;

            return (
                <div
                    key={item.rule.id}
                    className={`bg-white rounded-xl border transition-all duration-300 overflow-hidden ${isMissing ? 'border-amber-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
                >
                    <div
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50 transition-colors"
                        onClick={() => setExpandedRuleId(isExpanded ? null : item.rule.id)}
                    >
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${getStatusColor(item.status).split(' ')[1]} ${getStatusColor(item.status).split(' ')[0]}`}>
                                {getStatusIcon(item.status)}
                            </div>
                            <div>
                                <h4 className={`text-sm font-black ${isMissing ? 'text-amber-900' : 'text-slate-700'}`}>
                                    {item.rule.nome}
                                </h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                    {item.rule.obrigatoriedade}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(item.status)}`}>
                                {item.status.toUpperCase()}
                            </span>
                            {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                        <div className="px-4 md:px-16 pb-6 pt-0 animate-in slide-in-from-top-2 duration-200">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-4 cursor-default">
                                {item.note && (
                                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                                        <Info size={14} className="text-blue-600" />
                                        <span className="text-xs font-bold text-blue-800">
                                            {item.note}
                                        </span>
                                    </div>
                                )}

                                {item.foundDocument && (
                                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                                        <CheckCircle2 size={14} className="text-emerald-600" />
                                        <span className="text-xs font-bold text-emerald-800">
                                            Documento encontrado: <span className="font-black">{item.foundDocument.tipo}</span> (nº {item.foundDocument.ordem})
                                        </span>
                                    </div>
                                )}

                                {/* Seção de Vínculo Manual */}
                                <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                        Vínculo Manual de Documento
                                    </label>
                                    <select
                                        className="w-full text-xs p-2 rounded border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium text-slate-700"
                                        value={checklistAssociations?.[item.rule.id] || (item.foundDocument?.ordem || "")}
                                        onChange={(e) => onAssociateDocument && onAssociateDocument(item.rule.id, e.target.value)}
                                    >
                                        <option value="">-- Seleção Automática / Nenhum --</option>
                                        {documents.map(doc => (
                                            <option key={doc.ordem} value={doc.ordem}>
                                                {doc.ordem} - {doc.tipo} ({doc.data})
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[9px] text-slate-400 mt-1 italic">
                                        Selecione um documento da lista para forçar o vínculo com este item do checklist.
                                    </p>
                                </div>

                                {item.rule.hipotesesDispensa && (
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Hipóteses de Dispensa</span>
                                        <p className="text-xs font-medium text-slate-600 leading-relaxed italic bg-white p-3 rounded-lg border border-slate-100">
                                            "{item.rule.hipotesesDispensa}"
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Checklist de Elementos Obrigatórios</span>
                                    <ul className="space-y-2 bg-white p-4 rounded-lg border border-slate-100">
                                        {item.rule.elementosObrigatorios.map((elem, i) => (
                                            <li key={i} className="flex items-start gap-2 text-xs font-medium text-slate-600">
                                                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                {elem}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};

export default PlanningChecklist;
