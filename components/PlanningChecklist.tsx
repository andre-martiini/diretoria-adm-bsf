import React, { useMemo, useState } from 'react';
import { SIPACDocument } from '../types';
import { validateProcessDocuments } from '../services/documentValidationService';
import { CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, FileText, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface PlanningChecklistProps {
  documents: SIPACDocument[];
  initialIsARP?: boolean;
  onToggleARP?: (isARP: boolean) => void;
  estimatedValue?: number | null;
}


const PlanningChecklist: React.FC<PlanningChecklistProps> = ({
  documents,
  initialIsARP = false,
  onToggleARP,
  checklistAssociations,
  onAssociateDocument
}) => {
  const [isARP, setIsARP] = useState(initialIsARP);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  React.useEffect(() => {
    setIsARP(initialIsARP);
  }, [initialIsARP]);

  const checklist = useMemo(() => {
    return validateProcessDocuments(documents, isARP, estimatedValue || undefined);
  }, [documents, isARP, estimatedValue]);

  const toggleARP = () => {
    const newState = !isARP;
    setIsARP(newState);
    if (onToggleARP) onToggleARP(newState);
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

        <div className="flex flex-col md:flex-row items-end md:items-center gap-4">
            {estimatedValue && (
                <div className="px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                    <DollarSign size={16} className="text-emerald-600" />
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Valor Estimado Identificado</span>
                        <span className="text-xs font-black text-emerald-800">{formatCurrency(estimatedValue)}</span>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Tipo de Processo:</span>
            <button
                onClick={() => { if (isARP) toggleARP(); }}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${!isARP ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Padrão
            </button>
            <button
                onClick={() => { if (!isARP) toggleARP(); }}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${isARP ? 'bg-white text-blue-600 shadow-sm ring-1 ring-blue-200' : 'text-slate-400 hover:text-slate-600'}`}
            >
                Adesão ARP / Carona
            </button>
            </div>
        </div>
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
