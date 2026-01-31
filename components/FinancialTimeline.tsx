import React from 'react';
import { ProcessFinancials } from '../types';
import { formatCurrency } from '../utils/formatters';
import { TrendingUp, CheckCircle, AlertCircle, DollarSign, Clock } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface Props {
    financials: ProcessFinancials;
    loading?: boolean;
}

const FinancialTimeline: React.FC<Props> = ({ financials, loading }) => {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
                    Analisando documentos financeiros...
                </p>
            </div>
        );
    }

    if (!financials || !financials.events || financials.events.length === 0) {
        return (
            <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <p className="text-sm text-slate-500 font-medium">Nenhum dado financeiro encontrado neste processo.</p>
                <p className="text-xs text-slate-400 mt-1">Certifique-se que existem Notas de Empenho ou Faturas anexadas.</p>
            </div>
        );
    }

    // Prepare chart data (cumulative)
    const chartData = financials.events.map(event => ({
        date: event.date.split('-').reverse().slice(0, 2).join('/'), // DD/MM
        fullDate: event.date,
        type: event.type,
        value: event.value,
        title: event.documentTitle
    }));

    // Calculate percentages
    const executionRate = financials.totalEmpenhado > 0
        ? Math.min(100, (financials.totalLiquidado / financials.totalEmpenhado) * 100)
        : 0;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cards Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10"><DollarSign size={40} /></div>
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Total Empenhado</span>
                    <span className="text-xl font-black text-blue-700">{formatCurrency(financials.totalEmpenhado)}</span>
                    <span className="text-[9px] font-bold text-blue-400 mt-2">Valor reservado para gasto</span>
                </div>

                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10"><CheckCircle size={40} /></div>
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">Total Executado</span>
                    <span className="text-xl font-black text-emerald-700">{formatCurrency(financials.totalLiquidado)}</span>
                    <span className="text-[9px] font-bold text-emerald-400 mt-2">Serviço/Bem entregue (Liquidação)</span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col relative overflow-hidden shadow-sm">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Execução</span>
                    <div className="flex items-end gap-2">
                        <span className={`text-3xl font-black ${executionRate < 50 ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {executionRate.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-1000 ${executionRate < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${executionRate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Timeline Events */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Clock size={14} className="text-ifes-blue" />
                    Linha do Tempo Financeira
                </h4>

                <div className="relative pl-6 border-l-2 border-slate-100 space-y-8">
                    {financials.events.map((event, idx) => (
                        <div key={idx} className="relative">
                            {/* Dot */}
                            <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm ${
                                event.type === 'EMPENHO' ? 'bg-blue-500' :
                                event.type === 'LIQUIDACAO' ? 'bg-emerald-500' :
                                event.type === 'PAGAMENTO' ? 'bg-violet-500' : 'bg-red-500'
                            }`} />

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 p-3 rounded-lg border border-slate-100/50 hover:bg-slate-50 transition-colors">
                                <div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${
                                        event.type === 'EMPENHO' ? 'bg-blue-100 text-blue-700' :
                                        event.type === 'LIQUIDACAO' ? 'bg-emerald-100 text-emerald-700' :
                                        event.type === 'PAGAMENTO' ? 'bg-violet-100 text-violet-700' : 'bg-red-100 text-red-700'
                                    }`}>
                                        {event.type}
                                    </span>
                                    <h5 className="text-xs font-bold text-slate-700 mt-2">{event.documentTitle}</h5>
                                    <p className="text-[10px] text-slate-400 mt-1">{event.date.split('-').reverse().join('/')}</p>
                                </div>
                                <div className="text-right">
                                    <span className="block text-sm font-black text-slate-800 tabular-nums">
                                        {formatCurrency(event.value)}
                                    </span>
                                    {event.documentUrl && (
                                        <a
                                            href={event.documentUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[9px] font-bold text-blue-400 hover:text-blue-600 uppercase tracking-wide"
                                        >
                                            Ver Documento
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FinancialTimeline;
