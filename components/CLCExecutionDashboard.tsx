import React from 'react';
import { ArrowLeft, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import AnnualHiringPlan from './AnnualHiringPlan';

const CLCExecutionDashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain shrink-0" />
            <div className="flex flex-col border-l border-slate-100 pl-3 min-w-0">
              <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Execucao CLC</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">
                Processos SIPAC e acompanhamento da execucao
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
          >
            <ArrowLeft size={18} />
            Voltar
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <section className="bg-white border-l-4 border-ifes-green p-6 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-ifes-green">
            <Workflow size={16} />
            <span className="text-[11px] font-black uppercase tracking-widest">Execucao CLC</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Painel de Execucao de Processos</h1>
          <p className="text-sm text-slate-500 font-medium">
            Painel rapido de consulta com processos indexados. A sincronizacao pesada do SIPAC fica no modulo Extrator SIPAC.
          </p>
        </section>

        <AnnualHiringPlan
          embedded
          initialDashboardView="status"
          lockedDashboardView="status"
        />
      </main>
    </div>
  );
};

export default CLCExecutionDashboard;
