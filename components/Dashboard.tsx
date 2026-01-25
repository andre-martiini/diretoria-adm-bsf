import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import { FileText, Wallet, LogOut, ArrowRight } from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50/30 border-t-4 border-ifes-green">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm font-sans">
        <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logoIfes} alt="Logo IFES" className="h-16 w-auto object-contain" />
              <div className="flex flex-col border-l border-slate-100 pl-4">
                <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Portal Administrativo</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Campus Barra de São Francisco</span>
              </div>
            </div>

            <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors font-bold text-sm cursor-pointer"
            >
                <LogOut size={16} />
                <span>Sair</span>
            </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-black text-slate-800 mb-8">Módulos Disponíveis</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: PCA */}
            <div
                onClick={() => navigate('/pca')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-ifes-green transition-all cursor-pointer group flex flex-col justify-between h-48"
            >
                <div>
                    <div className="bg-ifes-green/10 w-12 h-12 rounded-xl flex items-center justify-center text-ifes-green mb-4 group-hover:bg-ifes-green group-hover:text-white transition-colors">
                        <FileText size={24} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800 group-hover:text-ifes-green transition-colors">Plano de Contratação Anual</h3>
                    <p className="text-xs text-slate-400 font-medium mt-1">Gestão de demandas e monitoramento do PCA.</p>
                </div>
                <div className="flex items-center text-ifes-green text-sm font-bold mt-4">
                    <span>Acessar</span>
                    <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </div>
            </div>

            {/* Card 2: Gestão Orçamentária */}
            <div
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-not-allowed group flex flex-col justify-between h-48 relative overflow-hidden opacity-75"
            >
                <div className="absolute top-3 right-3 bg-slate-100 text-slate-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    Em Breve
                </div>
                <div>
                    <div className="bg-blue-50 w-12 h-12 rounded-xl flex items-center justify-center text-blue-500 mb-4">
                        <Wallet size={24} />
                    </div>
                    <h3 className="text-lg font-black text-slate-800">Gestão Orçamentária</h3>
                    <p className="text-xs text-slate-400 font-medium mt-1">Controle de saldo, empenhos e execução financeira.</p>
                </div>

                 <div className="flex items-center text-slate-300 text-sm font-bold mt-4">
                    <span>Indisponível</span>
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
