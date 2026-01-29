import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calculator,
  Users,
  Plus,
  Trash2,
  RefreshCw,
  DollarSign,
  Wallet,
  TrendingUp,
  AlertCircle,
  Save,
  PieChart
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

interface AidItem {
  id: string;
  name: string;
  value: number; // Value per student per month (or year? User didn't specify, assuming Monthly usually, but budget is annual. Let's make it flexible or assume Annual for simplicity, or allow monthly toggle).
  // Context: "Custo médio anual do aluno". Usually aids are monthly.
  // Let's assume input is Monthly Value, and we calculate Annual Cost = Value * Count * 12 (or custom months).
  // Actually, for simplicity and flexibility, let's allow "Months per Year" per aid.
  months: number;
  count: number; // Number of students receiving it
}

interface ScenarioSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  initialBudget: number;
}

const DEFAULT_AIDS: AidItem[] = [
  { id: '1', name: 'Auxílio Alimentação', value: 300, count: 0, months: 12 },
  { id: '2', name: 'Auxílio Transporte', value: 150, count: 0, months: 10 },
  { id: '3', name: 'Auxílio Moradia', value: 400, count: 0, months: 12 },
  { id: '4', name: 'Auxílio Material Didático', value: 100, count: 0, months: 1 },
];

const ScenarioSimulator: React.FC<ScenarioSimulatorProps> = ({ isOpen, onClose, initialBudget }) => {
  const [budget, setBudget] = useState<number>(0);
  const [totalStudents, setTotalStudents] = useState<number>(1000); // Default placeholder
  const [aids, setAids] = useState<AidItem[]>([]);

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      setBudget(initialBudget);
      setAids(DEFAULT_AIDS.map(a => ({...a, id: Math.random().toString(36).substr(2, 9)})));
    }
  }, [isOpen, initialBudget]);

  const stats = useMemo(() => {
    const totalExpenses = aids.reduce((acc, aid) => {
      return acc + (aid.value * aid.count * aid.months);
    }, 0);

    const balance = budget - totalExpenses;
    const balancePercent = budget > 0 ? (balance / budget) * 100 : 0;

    // Average cost per student (considering the total student population vs total spent)
    const avgCostPerStudent = totalStudents > 0 ? totalExpenses / totalStudents : 0;

    // Students impacted (Unique students? Hard to know without individual data.
    // We can show sum of benefits granted or just rely on the user input for Total Students for the average).
    const totalBenefitsGranted = aids.reduce((acc, aid) => acc + aid.count, 0);

    return {
      totalExpenses,
      balance,
      balancePercent,
      avgCostPerStudent,
      totalBenefitsGranted
    };
  }, [budget, aids, totalStudents]);

  const handleAddAid = () => {
    setAids([...aids, {
      id: Math.random().toString(36).substr(2, 9),
      name: 'Novo Auxílio',
      value: 0,
      count: 0,
      months: 12
    }]);
  };

  const handleRemoveAid = (id: string) => {
    setAids(aids.filter(a => a.id !== id));
  };

  const updateAid = (id: string, field: keyof AidItem, value: any) => {
    setAids(aids.map(a => {
      if (a.id === id) {
        return { ...a, [field]: value };
      }
      return a;
    }));
  };

  const handleReset = () => {
    setBudget(initialBudget);
    setTotalStudents(1000);
    setAids(DEFAULT_AIDS.map(a => ({...a, id: Math.random().toString(36).substr(2, 9)})));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-[32px] w-full max-w-6xl h-[90vh] shadow-2xl border border-white flex flex-col overflow-hidden">

        {/* Header */}
        <header className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-ifes-green p-3 rounded-xl text-white shadow-lg shadow-green-100">
              <Calculator size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Simulador de Cenários</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Assistência Estudantil &bull; Planejamento Estratégico</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-xs font-black text-slate-400 hover:text-ifes-green hover:bg-ifes-green/10 rounded-xl transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Resetar
            </button>
            <button
              onClick={onClose}
              className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400"
            >
              <X size={24} />
            </button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          {/* Left Panel: Inputs & Aids List */}
          <div className="flex-1 overflow-y-auto p-8 border-r border-slate-100 bg-white">

            <section className="mb-8">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Wallet size={14} /> Parâmetros Globais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Orçamento Anual Disponível</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold group-focus-within:text-ifes-green transition-colors">R$</span>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value))}
                      className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black text-slate-700 outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Total de Alunos (Campus)</label>
                  <div className="relative group">
                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input
                      type="number"
                      value={totalStudents}
                      onChange={(e) => setTotalStudents(Number(e.target.value))}
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <DollarSign size={14} /> Configuração de Auxílios
                </h3>
                <button
                  onClick={handleAddAid}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase transition-all"
                >
                  <Plus size={12} /> Adicionar
                </button>
              </div>

              <div className="space-y-4">
                {aids.map((aid) => (
                  <div key={aid.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={aid.name}
                          onChange={(e) => updateAid(aid.id, 'name', e.target.value)}
                          className="w-full text-sm font-black text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-ifes-green outline-none transition-all placeholder:text-slate-300"
                          placeholder="Nome do Auxílio"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveAid(aid.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Valor Mensal</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">R$</span>
                          <input
                            type="number"
                            value={aid.value}
                            onChange={(e) => updateAid(aid.id, 'value', Number(e.target.value))}
                            className="w-full pl-6 pr-2 py-2 bg-slate-50 rounded-lg text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Qtd. Alunos</label>
                        <input
                          type="number"
                          value={aid.count}
                          onChange={(e) => updateAid(aid.id, 'count', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Meses/Ano</label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={aid.months}
                          onChange={(e) => updateAid(aid.id, 'months', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-50 rounded-lg text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Impacto Anual</span>
                       <span className="text-xs font-black text-slate-800">
                         {formatCurrency(aid.value * aid.count * aid.months)}
                       </span>
                    </div>
                  </div>
                ))}

                {aids.length === 0 && (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs font-bold text-slate-400">Nenhum auxílio cadastrado para este cenário.</p>
                    <button onClick={handleAddAid} className="mt-2 text-ifes-green font-black text-xs hover:underline">Adicionar Auxílio</button>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Panel: Live Results */}
          <div className="w-[400px] bg-slate-50/50 p-8 flex flex-col gap-6 border-l border-slate-100 backdrop-blur-sm">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={14} /> Resultado da Simulação
             </h3>

             {/* Result Card: Balance */}
             <div className={`p-6 rounded-3xl border shadow-sm transition-all ${
               stats.balance >= 0
                 ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                 : 'bg-red-50 border-red-100 text-red-900'
             }`}>
                <p className="text-[10px] font-black opacity-60 uppercase tracking-widest mb-1">Saldo Final Estimado</p>
                <h4 className="text-3xl font-black tracking-tight">{formatCurrency(stats.balance)}</h4>
                <div className="mt-4 w-full bg-white/50 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${stats.balance >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(Math.abs(stats.balancePercent), 100)}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold mt-2 opacity-70">
                  {stats.balance >= 0 ? 'Dentro do orçamento' : 'Orçamento excedido!'}
                </p>
             </div>

             {/* Result Card: Total Spent */}
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Despesas (Ano)</p>
                <h4 className="text-2xl font-black text-slate-800">{formatCurrency(stats.totalExpenses)}</h4>
             </div>

             {/* Result Card: Avg Cost */}
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Médio / Aluno (Ano)</p>
                <h4 className="text-2xl font-black text-blue-600">{formatCurrency(stats.avgCostPerStudent)}</h4>
                <p className="text-[10px] font-medium text-slate-400 mt-1">
                   Baseado em {totalStudents} alunos matriculados
                </p>
             </div>

             {/* Result Card: Benefits Impact */}
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Distribuição de Recursos</p>
                <div className="space-y-3 overflow-y-auto max-h-[200px] pr-2 custom-scrollbar">
                  {aids.map(aid => {
                    const total = aid.value * aid.count * aid.months;
                    const percent = stats.totalExpenses > 0 ? (total / stats.totalExpenses) * 100 : 0;
                    if (total === 0) return null;

                    return (
                      <div key={aid.id}>
                        <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                          <span className="truncate max-w-[120px]">{aid.name}</span>
                          <span>{Math.round(percent)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {stats.totalExpenses === 0 && (
                    <p className="text-[10px] italic text-slate-400 text-center">Nenhuma despesa para exibir.</p>
                  )}
                </div>
             </div>

             <div className="mt-auto bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3 items-start">
               <AlertCircle className="text-amber-500 shrink-0" size={16} />
               <p className="text-[10px] font-medium text-amber-800 leading-relaxed">
                 Este é um ambiente de simulação. As alterações feitas aqui não afetam os dados oficiais do orçamento até que sejam efetivadas nos módulos respectivos.
               </p>
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ScenarioSimulator;
