import React from 'react';
import { ArrowLeft, FileText, Scale, ScrollText } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import AnnualHiringPlan from './AnnualHiringPlan';
import GovContractsDashboard from './GovContractsDashboard';
import GovContractInstrumentsDashboard from './GovContractInstrumentsDashboard';

type HiringManagementTab = 'pca' | 'contratacoes' | 'contratos-empenhos';

const TAB_CONFIG: Array<{
  id: HiringManagementTab;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'pca',
    label: 'PCA',
    description: 'Plano Anual de Contratacoes e monitoramento do planejamento.',
    icon: <FileText size={16} />
  },
  {
    id: 'contratacoes',
    label: 'Contratacoes',
    description: 'Pregao, dispensa, inexigibilidade e concorrencia.',
    icon: <Scale size={16} />
  },
  {
    id: 'contratos-empenhos',
    label: 'Contratos e Empenhos',
    description: 'Instrumentos vigentes e historico por ano.',
    icon: <ScrollText size={16} />
  }
];

const isValidTab = (value: string | undefined): value is HiringManagementTab =>
  TAB_CONFIG.some((tab) => tab.id === value);

const HiringManagementModule: React.FC = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const activeTab: HiringManagementTab = isValidTab(tab) ? tab : 'pca';
  const activeConfig = TAB_CONFIG.find((item) => item.id === activeTab) || TAB_CONFIG[0];

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain shrink-0" />
            <div className="flex flex-col border-l border-slate-100 pl-3 min-w-0">
              <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Gestao de Contratacoes</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter truncate">
                PCA, contratacoes governamentais e contratos/empenhos
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
            {activeConfig.icon}
            <span className="text-[11px] font-black uppercase tracking-widest">{activeConfig.label}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Modulo de Gestao de Contratacoes</h1>
          <p className="text-sm text-slate-500 font-medium">{activeConfig.description}</p>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {TAB_CONFIG.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/gestao-contratacoes/${item.id}`)}
                className={`px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wide transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-ifes-green text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          {activeTab === 'pca' && <AnnualHiringPlan embedded />}
          {activeTab === 'contratacoes' && <GovContractsDashboard embedded />}
          {activeTab === 'contratos-empenhos' && <GovContractInstrumentsDashboard embedded />}
        </section>
      </main>
    </div>
  );
};

export default HiringManagementModule;
