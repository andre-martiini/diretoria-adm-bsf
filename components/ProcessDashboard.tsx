import React, { useMemo } from 'react';
import {
    Activity,
    BarChart3,
    Layers,
    Clock,
    TrendingUp
} from 'lucide-react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';
import { ContractItem } from '../types';
import { formatCurrency } from '../utils/formatters';

interface ProcessDashboardProps {
    data: ContractItem[];
}

const ProcessDashboard: React.FC<ProcessDashboardProps> = ({ data }) => {
    // Filtra apenas itens que possuem um processo SIPAC (ou seja, estão em execução)
    const processItems = useMemo(() =>
        data.filter(item => item.protocoloSIPAC && item.protocoloSIPAC.length > 5),
        [data]
    );

    const stats = useMemo(() => {
        const totalValue = processItems.reduce((acc, item) => acc + item.valor, 0);
        // Consideramos em andamento o que não está contratado nem encerrado
        const inProgress = processItems.filter(item =>
            !['Contratado', 'Encerrado/Arquivado', 'Adjudicado/Homologado'].includes(item.computedStatus || '')
        ).length;

        // Processos Estagnados (Baseado no Health Score dinâmico)
        const stalled = processItems.filter(item => {
            const score = (item.dadosSIPAC as any)?.health_score || 100;
            return score < 70; // Score abaixo de 70 indica estagnação ou muitos dias parado
        }).length;

        return {
            totalCount: processItems.length,
            totalValue,
            inProgress,
            stalled
        };
    }, [processItems]);

    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        processItems.forEach(item => {
            const status = item.computedStatus || 'Indefinido';
            counts[status] = (counts[status] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [processItems]);

    const movementData = useMemo(() => {
        return processItems
            .map(item => ({
                name: item.titulo.substring(0, 20) + '...',
                fullTitle: item.titulo,
                value: item.dadosSIPAC?.movimentacoes?.length || 0,
                incidentes: item.dadosSIPAC?.incidentes?.length || 0,
                health: (item.dadosSIPAC as any)?.health_score || 100
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);
    }, [processItems]);

    const STATUS_COLORS: Record<string, string> = {
        'Planejamento da Contratação': '#3b82f6',
        'Composição de Preços': '#6366f1',
        'Análise de Legalidade': '#f59e0b',
        'Fase Externa': '#10b981',
        'Licitação Suspensa/Sob Análise': '#ef4444',
        'Adjudicado/Homologado': '#8b5cf6',
        'Contratado': '#047857',
        'Encerrado/Arquivado': '#64748b'
    };

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Linha 1: KPIs Rápidos */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-2 rounded-xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                            <Activity size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Processos Ativos</p>
                    <h3 className="text-2xl font-black text-slate-900">{stats.totalCount}</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">{stats.inProgress} em trâmite atual</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-emerald-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor sob Gestão</p>
                    <h3 className="text-2xl font-black text-slate-900">{formatCurrency(stats.totalValue)}</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">Volume financeiro em processos</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group hover:border-amber-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-amber-50 p-2 rounded-xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-all">
                            <Clock size={20} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Engajamento (Saúde)</p>
                    <h3 className="text-2xl font-black text-slate-900">{stats.stalled} alertas</h3>
                    <p className="text-[9px] font-bold text-slate-400 mt-2 italic">Processos com score de saúde crítico</p>
                </div>
            </div>

            {/* Linha 2: Gráficos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Distribuição por Status */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                        <BarChart3 size={16} className="text-blue-500" />
                        Volume por Fase do Processo
                    </h3>
                    <div className="h-[280px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#cbd5e1'} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number, name: string) => [
                                        `${value} processos`,
                                        name
                                    ]}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend
                                    layout="horizontal"
                                    verticalAlign="bottom"
                                    align="center"
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '10px', fontWeight: 700, color: '#64748b', paddingTop: '10px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none pb-6">
                            <span className="text-3xl font-black text-slate-800 leading-none">{stats.totalCount}</span>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Total</span>
                        </div>
                    </div>
                </div>

                {/* Análise de Retrabalho e Complexidade */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
                    <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
                        <Layers size={16} className="text-emerald-500" />
                        Nível de Complexidade (Trâmites)
                    </h3>
                    <div className="h-[200px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={movementData} layout="vertical" margin={{ left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    width={100}
                                    tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    formatter={(value: number, name: string, props: any) => [
                                        `${value} movimentações`,
                                        `Incidentes: ${props.payload.incidentes}`
                                    ]}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                        <div className="absolute top-2 right-2 flex flex-col items-end pointer-events-none">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Processos Mais Movimentados</span>
                        </div>
                    </div>

                    <div className="mt-auto space-y-2">
                        {movementData.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${item.health < 60 ? 'bg-red-500' : item.health < 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[150px]" title={item.fullTitle}>{item.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {item.incidentes > 0 && (
                                        <span className="text-[9px] font-black text-red-500 bg-red-50 px-1.5 rounded-full">{item.incidentes} !</span>
                                    )}
                                    <span className="text-[10px] font-black text-slate-400">{item.value} trâm.</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProcessDashboard;
