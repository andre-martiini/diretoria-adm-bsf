import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Search, FileText, ArrowRight, Settings, Wand2 } from 'lucide-react';
import logoIfes from '../logo-ifes.png';

const Tools: React.FC = () => {
    const navigate = useNavigate();

    const tools = [
        {
            title: 'Importador SIPAC',
            description: 'Extração automática de parâmetros de contratação via protocolo SIPAC.',
            icon: <Search size={24} />,
            route: '/sipac',
            color: 'blue'
        },
        {
            title: 'Busca Inteligente SIASG',
            description: 'Pesquisa semântica avançada com IA para catálogos do Governo (CATMAT/CATSER).',
            icon: <Settings size={24} />,
            route: '/catmat',
            color: 'emerald'
        },
        {
            title: 'Criação de DFD',
            description: 'Automação via IA para rascunho de Documentos de Formalização da Demanda.',
            icon: <Wand2 size={24} />,
            route: '/dfd',
            color: 'orange'
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50/30 border-t-4 border-orange-500">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm font-sans">
                <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img src={logoIfes} alt="Logo IFES" className="h-16 w-auto object-contain" />
                        <div className="flex flex-col border-l border-slate-100 pl-4">
                            <span className="text-lg font-black text-orange-500 uppercase leading-none tracking-tight">Ferramentas</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Portal DAP - Barra de São Francisco</span>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-2 text-slate-400 hover:text-orange-500 transition-colors font-bold text-sm cursor-pointer"
                    >
                        <LayoutDashboard size={16} />
                        <span>Voltar ao Dashboard</span>
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-12">
                <h2 className="text-2xl font-black text-slate-800 mb-8">Utilitários Disponíveis</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tools.map((tool, index) => (
                        <div
                            key={index}
                            onClick={() => navigate(tool.route)}
                            className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-${tool.color}-500 transition-all cursor-pointer group flex flex-col justify-between h-48`}
                        >
                            <div>
                                <div className={`bg-${tool.color}-50 w-12 h-12 rounded-xl flex items-center justify-center text-${tool.color}-500 mb-4 group-hover:bg-${tool.color}-500 group-hover:text-white transition-colors`}>
                                    {tool.icon}
                                </div>
                                <h3 className={`text-lg font-black text-slate-800 group-hover:text-${tool.color}-500 transition-colors`}>{tool.title}</h3>
                                <p className="text-xs text-slate-400 font-medium mt-1">{tool.description}</p>
                            </div>

                            <div className={`flex items-center text-${tool.color}-500 text-sm font-bold mt-4`}>
                                <span>Acessar Tool</span>
                                <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    ))}
                    
                    {/* Placeholder for future tools */}
                    <div className="bg-slate-50/50 p-6 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center h-48 opacity-60">
                         <div className="bg-slate-100 w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 mb-4">
                            <Settings size={24} />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Novas Ferramentas em breve</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Tools;
