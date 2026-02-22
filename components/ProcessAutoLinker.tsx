import React, { useState } from 'react';
import { ContractItem } from '../types';
import { findMatchingPCAItems, DFDData } from '../utils/dfdMatcher';
import { linkItemsToProcess } from '../services/acquisitionService';
import { API_SERVER_URL } from '../constants';
import { formatCurrency } from '../utils/formatters';
import { Search, Loader2, CheckCircle, AlertCircle, FileText, ArrowRight } from 'lucide-react';

interface ProcessAutoLinkerProps {
    pcaItems: ContractItem[];
    onSuccess?: () => void;
    onClose: () => void;
}

const ProcessAutoLinker: React.FC<ProcessAutoLinkerProps> = ({ pcaItems, onSuccess, onClose }) => {
    const [protocol, setProtocol] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dfdResult, setDfdResult] = useState<{ data: DFDData, docUrl: string } | null>(null);
    const [matchedItems, setMatchedItems] = useState<ContractItem[]>([]);
    const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
    const [isLinking, setIsLinking] = useState(false);

    const handleAnalyze = async () => {
        if (!protocol) return;
        setIsLoading(true);
        setError(null);
        setDfdResult(null);
        setMatchedItems([]);

        try {
            const response = await fetch(`${API_SERVER_URL}/api/sipac/analyze-dfd`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ processId: protocol })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Erro na análise do processo');
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Falha na análise do DFD');
            }

            const dfdData = result.extractedData as DFDData;
            setDfdResult({
                data: dfdData,
                docUrl: result.dfdDoc?.url || ''
            });

            // Find Matches locally
            const matches = findMatchingPCAItems(dfdData, pcaItems);
            setMatchedItems(matches);

            // Auto-select all matches initially
            const initialSelection = new Set(matches.map(m => String(m.id)));
            setSelectedMatches(initialSelection);

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Erro desconhecido');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLink = async () => {
        if (selectedMatches.size === 0 || !protocol || !dfdResult) return;
        setIsLinking(true);
        try {
            // Re-fetch basic process data to confirm status (or use what we have)
            // Ideally we pass the full SIPAC object, but let's re-fetch to be safe and get the latest status
            // Actually, analyze-dfd returns processData too! We should use that to save bandwidth.
            // But strict typing might be an issue if I didn't save it.
            // Let's assume we need to re-fetch OR store processData in state.
            // Storing in state is better.

            // Re-fetch for now to ensure we have the exact object expected by linkItemsToProcess
            const response = await fetch(`${API_SERVER_URL}/api/sipac/processo?protocolo=${protocol}`);
            const sipacData = await response.json();

            if (sipacData.scraping_last_error) {
                throw new Error(sipacData.scraping_last_error);
            }

            const itemIds = Array.from(selectedMatches);
            // Get year from first item
            const firstItem = matchedItems.find(i => String(i.id) === itemIds[0]);
            const year = firstItem?.ano || new Date().getFullYear().toString();

            await linkItemsToProcess(protocol, itemIds, sipacData, year);

            if (onSuccess) onSuccess();
            onClose();

        } catch (err: any) {
            alert('Erro ao vincular: ' + err.message);
        } finally {
            setIsLinking(false);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedMatches);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedMatches(newSet);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <Search size={18} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800">Vínculo Inteligente via DFD</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Análise automática de documentos SIPAC
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
                        <span className="sr-only">Fechar</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">

                    {/* Step 1: Input */}
                    <div className="flex gap-2 mb-6">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Número do Processo (Ex: 23068.000000/2024-00)"
                                className="w-full pl-4 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                value={protocol}
                                onChange={(e) => setProtocol(e.target.value)}
                                disabled={isLoading || !!dfdResult}
                            />
                        </div>
                        {!dfdResult && (
                            <button
                                onClick={handleAnalyze}
                                disabled={!protocol || isLoading}
                                className="px-6 py-3 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
                            >
                                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Analisar'}
                            </button>
                        )}
                        {dfdResult && (
                             <button
                                onClick={() => { setDfdResult(null); setMatchedItems([]); setError(null); }}
                                className="px-4 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all"
                             >
                                Reiniciar
                             </button>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2 mb-4 border border-red-100">
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {/* Results */}
                    {dfdResult && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">

                            {/* DFD Data Card */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <FileText size={12} /> Dados Extraídos do DFD
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">Quantidade</label>
                                        <p className="text-sm font-black text-slate-800">{dfdResult.data.quantidade ?? '-'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">Valor Estimado</label>
                                        <p className="text-sm font-black text-slate-800">{dfdResult.data.valor ? formatCurrency(dfdResult.data.valor) : '-'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">Categoria</label>
                                        <p className="text-sm font-black text-slate-800">{dfdResult.data.categoria ?? '-'}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-slate-400 uppercase">Grupo</label>
                                        <p className="text-xs font-bold text-slate-600 truncate" title={dfdResult.data.grupo || ''}>{dfdResult.data.grupo ?? '-'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Matching Items */}
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <CheckCircle size={12} className="text-emerald-500" /> Itens do PCA Correspondentes ({matchedItems.length})
                                </h4>

                                {matchedItems.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                                        <p className="text-xs font-bold text-slate-400">Nenhum item do PCA coincide com os dados do DFD.</p>
                                        <p className="text-[10px] text-slate-300 mt-1">Tente ajustar a busca manual ou verificar os dados do processo.</p>
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                    <th className="px-4 py-3 w-10 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={matchedItems.every(i => selectedMatches.has(String(i.id)))}
                                                            onChange={() => {
                                                                if (matchedItems.every(i => selectedMatches.has(String(i.id)))) {
                                                                    setSelectedMatches(new Set());
                                                                } else {
                                                                    setSelectedMatches(new Set(matchedItems.map(i => String(i.id))));
                                                                }
                                                            }}
                                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                    </th>
                                                    <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase">Item</th>
                                                    <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase">Descrição</th>
                                                    <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase text-right">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {matchedItems.map(item => (
                                                    <tr key={item.id} className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${selectedMatches.has(String(item.id)) ? 'bg-blue-50/50' : ''}`} onClick={() => toggleSelection(String(item.id))}>
                                                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMatches.has(String(item.id))}
                                                                onChange={() => toggleSelection(String(item.id))}
                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-black text-slate-600">{item.numeroItem}</td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-xs font-bold text-slate-800 line-clamp-2" title={item.titulo}>{item.titulo}</p>
                                                            <p className="text-[10px] text-slate-400">{item.grupoContratacao}</p>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-black text-blue-600 text-right tabular-nums">
                                                            {formatCurrency(item.valor)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-100 transition-all"
                    >
                        Cancelar
                    </button>
                    {dfdResult && matchedItems.length > 0 && (
                        <button
                            onClick={handleLink}
                            disabled={selectedMatches.size === 0 || isLinking}
                            className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
                        >
                            {isLinking ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle size={16} /> Confirmar Vínculo ({selectedMatches.size})</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProcessAutoLinker;
