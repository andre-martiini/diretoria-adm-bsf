import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Sankey, TooltipProps, Cell, Legend
} from 'recharts';
import { Clock, RefreshCw, AlertTriangle, Activity, ArrowRight, GitMerge } from 'lucide-react';
import { ContractItem } from '../types';
import { calculateProcessMetrics, generateSankeyData, ProcessMetrics } from '../utils/processLogic';

interface ProcessDashboardProps {
  data: ContractItem[];
}

const ProcessDashboard: React.FC<ProcessDashboardProps> = ({ data }) => {
  // 1. Filter items that have SIPAC data
  const validItems = useMemo(() => data.filter(item => item.dadosSIPAC && item.dadosSIPAC.numeroProcesso), [data]);

  // 2. Calculate Aggregated Metrics
  const metrics = useMemo(() => {
    const calculated = validItems.map(item => ({
      item,
      metrics: calculateProcessMetrics(item.dadosSIPAC)
    })).filter(r => r.metrics !== null) as { item: ContractItem, metrics: ProcessMetrics }[];

    if (calculated.length === 0) return null;

    // Avg Lead Time
    const totalLeadTime = calculated.reduce((acc, curr) => acc + curr.metrics.leadTime, 0);
    const avgLeadTime = Math.round(totalLeadTime / calculated.length);

    // Rework (Total Loops)
    const totalRework = calculated.reduce((acc, curr) => acc + curr.metrics.reworkCount, 0);
    const reworkRate = (totalRework / calculated.length).toFixed(1);

    // Bottlenecks Aggregation
    const unitBottlenecks: Record<string, { totalDays: number, count: number }> = {};
    calculated.forEach(c => {
      c.metrics.bottlenecks.forEach(b => {
        if (!unitBottlenecks[b.unit]) unitBottlenecks[b.unit] = { totalDays: 0, count: 0 };
        unitBottlenecks[b.unit].totalDays += b.days;
        unitBottlenecks[b.unit].count += 1;
      });
    });

    const avgBottlenecks = Object.entries(unitBottlenecks)
      .map(([unit, data]) => ({
        unit,
        avgDays: Math.round(data.totalDays / data.count),
        count: data.count
      }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 10); // Top 10 slowest

    // Lead Time Distribution
    // Buckets: <30, 30-60, 60-90, 90-120, >120
    const buckets = {
      '< 30 dias': 0,
      '30-60 dias': 0,
      '60-90 dias': 0,
      '90-120 dias': 0,
      '> 120 dias': 0
    };

    calculated.forEach(c => {
      const lt = c.metrics.leadTime;
      if (lt < 30) buckets['< 30 dias']++;
      else if (lt < 60) buckets['30-60 dias']++;
      else if (lt < 90) buckets['60-90 dias']++;
      else if (lt < 120) buckets['90-120 dias']++;
      else buckets['> 120 dias']++;
    });

    const leadTimeData = Object.entries(buckets).map(([name, value]) => ({ name, value }));

    // Rework Data (Top Processes with Loops)
    const topReworks = calculated
      .sort((a, b) => b.metrics.reworkCount - a.metrics.reworkCount)
      .slice(0, 5)
      .map(c => ({
        name: c.item.titulo.substring(0, 30) + '...',
        loops: c.metrics.reworkCount,
        process: c.item.dadosSIPAC?.numeroProcesso
      }));

    return {
      totalProcesses: calculated.length,
      avgLeadTime,
      reworkRate,
      avgBottlenecks,
      leadTimeData,
      topReworks,
      slowestUnit: avgBottlenecks.length > 0 ? avgBottlenecks[0].unit : 'N/A'
    };
  }, [validItems]);

  const sankeyData = useMemo(() => {
    if (validItems.length === 0) return { nodes: [], links: [] };
    return generateSankeyData(validItems);
  }, [validItems]);

  if (!metrics || metrics.totalProcesses === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <div className="bg-slate-100 p-6 rounded-full mb-4">
          <Activity size={48} className="text-slate-300" />
        </div>
        <h3 className="text-lg font-black text-slate-700">Dados Insuficientes</h3>
        <p className="text-sm text-slate-400 mt-2 text-center max-w-md">
          Não há dados de movimentação suficientes nos processos vinculados para gerar os indicadores de performance.
          Vincule processos do SIPAC que possuam histórico de tramitação.
        </p>
      </div>
    );
  }

  // Custom Tooltip for Sankey
  const SankeyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      // Check if it's a node or link
      const isLink = data.source && data.target;
      return (
        <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-xl text-xs z-50">
          {isLink ? (
            <>
              <p className="font-bold text-slate-700">{data.source.name} <span className="text-slate-400 mx-1">→</span> {data.target.name}</p>
              <p className="font-black text-blue-600 mt-1">{data.value} Trâmites</p>
            </>
          ) : (
            <p className="font-bold text-slate-700">{data.name}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 font-sans">

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-300 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lead Time Médio</p>
              <h3 className="text-3xl font-black text-slate-800 mt-2">{metrics.avgLeadTime} <span className="text-sm text-slate-400 font-bold">dias</span></h3>
            </div>
            <div className="bg-blue-50 p-3 rounded-2xl text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Clock size={24} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-4 bg-slate-50 inline-block px-2 py-1 rounded-lg self-start">
            Base: {metrics.totalProcesses} processos
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-amber-300 transition-all min-h-[180px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gargalo Principal</p>
              <h3 className="text-[11px] font-black text-slate-800 mt-2 leading-tight uppercase break-words">
                {metrics.slowestUnit}
              </h3>
            </div>
            <div className="bg-amber-50 p-3 rounded-2xl text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
              <AlertTriangle size={24} />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-50">
            <p className="text-[10px] font-bold text-slate-400">Tempo Médio na Unidade</p>
            <p className="text-xl font-black text-amber-600">{Math.max(0, metrics.avgBottlenecks[0]?.avgDays || 0)} dias</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-purple-300 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa de Retrabalho</p>
              <h3 className="text-3xl font-black text-slate-800 mt-2">{metrics.reworkRate} <span className="text-sm text-slate-400 font-bold">loops/proc</span></h3>
            </div>
            <div className="bg-purple-50 p-3 rounded-2xl text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <RefreshCw size={24} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-4 leading-tight">
            Média de retornos de processo para a mesma unidade.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-emerald-300 transition-all">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fluxo do Processo</p>
              <h3 className="text-3xl font-black text-slate-800 mt-2">{sankeyData.links.length} <span className="text-sm text-slate-400 font-bold">conexões</span></h3>
            </div>
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <GitMerge size={24} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-4 leading-tight">
            Mapeamento de trâmites entre setores distintos.
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Lead Time Histogram */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
            <Clock size={18} className="text-blue-500" />
            Lead Time Total (Tempo de Vida)
          </h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.leadTimeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                <RechartsTooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bottlenecks Chart */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Top Gargalos (Tempo Médio por Unidade)
          </h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={metrics.avgBottlenecks} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} unit="d" />
                <YAxis dataKey="unit" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                <RechartsTooltip
                  cursor={{ fill: '#f8fafc' }}
                  formatter={(value: number) => [`${value} dias`, 'Tempo Médio']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="avgDays" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sankey Chart - Flow Map */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <GitMerge size={18} className="text-emerald-500" />
            Mapa de Fluxo (Diagrama de Sankey)
          </h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full">
            {sankeyData.nodes.length} Unidades • {sankeyData.links.length} Conexões
          </span>
        </div>

        <div className="flex-1 w-full min-h-0 bg-slate-50/50 rounded-2xl border border-slate-100 p-4 overflow-hidden relative">
          {sankeyData.nodes.length > 1 && sankeyData.links.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <Sankey
                data={sankeyData}
                nodePadding={20}
                nodeWidth={10}
                iterations={1}
                link={{ stroke: '#10b981', strokeOpacity: 0.2 }}
                node={{
                  fill: '#3b82f6',
                  stroke: '#2563eb',
                  strokeWidth: 1
                }}
              >
                <RechartsTooltip />
              </Sankey>
            </ResponsiveContainer>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
              Dados de fluxo insuficientes para visualização
            </div>
          )}
        </div>
        <p className="text-[10px] font-medium text-slate-400 mt-4 text-center">
          Espessura das linhas representa o volume de processos tramitando entre as unidades.
        </p>
      </div>

      {/* Rework Analysis List */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2">
          <RefreshCw size={18} className="text-purple-500" />
          Análise de Retrabalho (Top 5 Processos com mais Loops)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest rounded-l-xl">Processo</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right rounded-r-xl">Ciclos de Retorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {metrics.topReworks.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-xs font-black text-slate-700 font-mono">{item.process}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-600">{item.name}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="bg-purple-100 text-purple-700 font-black px-3 py-1 rounded-full text-xs">
                      {item.loops} loops
                    </span>
                  </td>
                </tr>
              ))}
              {metrics.topReworks.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-xs font-bold text-slate-400 italic">
                    Nenhum retrabalho significativo detectado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default ProcessDashboard;
