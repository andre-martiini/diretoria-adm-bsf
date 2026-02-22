import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ArrowRight, Settings, Wand2, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import logoIfes from '../logo-ifes.png';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';

const Tools: React.FC = () => {
    const navigate = useNavigate();
    const [config, setConfig] = useState<SystemConfig | null>(null);

    useEffect(() => {
        const initConfig = async () => {
            const sysConfig = await fetchSystemConfig();
            setConfig(sysConfig);
        };
        initConfig();
    }, []);

    const tools = [
        {
            title: 'Busca Inteligente SIASG',
            description: 'Pesquisa semântica avançada com IA para catálogos do Governo (CATMAT/CATSER).',
            icon: <Settings size={22} />,
            route: '/catmat',
            color: 'emerald-600',
            accent: 'bg-emerald-600'
        },
        {
            title: 'IA Engine de DFD',
            description: 'Automação via IA para rascunho de Documentos de Formalização da Demanda.',
            icon: <Wand2 size={22} />,
            route: '/dfd',
            color: 'indigo-600',
            accent: 'bg-indigo-600'
        },
        {
            title: 'Criador de Mapa de Preços',
            description: 'Elaboração e cálculo de mapa de preços para os processos.',
            icon: <FileText size={22} />,
            route: '/mapa-precos',
            color: 'orange-600',
            accent: 'bg-orange-600'
        }
    ];

    return (
        <div className="min-h-screen border-t-4 border-ifes-green bg-[#f8fafc] font-sans text-slate-800">
            {/* Standardized Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain" />
                        <div className="flex flex-col border-l border-slate-100 pl-3">
                            <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Ecossistema DAP</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                {config?.unidadeGestora.nome || 'Campus Barra de São Francisco'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
                        >
                            <ArrowLeft size={18} />
                            <span className="hidden md:inline">Voltar ao Dashboard</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-16">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 space-y-2"
                >
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Ferramentas</h2>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {tools.map((tool, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1 }}
                            onClick={() => navigate(tool.route)}
                            className="group bg-white p-8 rounded-[2rem] border border-slate-200 shadow-premium hover:shadow-2xl hover:border-ifes-green/20 hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-[18rem]"
                        >
                            <div>
                                <div className={`${tool.accent} w-12 h-12 rounded-xl flex items-center justify-center text-white mb-6 shadow-lg shadow-current/10 group-hover:scale-110 transition-transform`}>
                                    {tool.icon}
                                </div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight group-hover:text-ifes-green transition-colors leading-tight">{tool.title}</h3>
                                <p className="text-[11px] text-slate-400 font-bold uppercase mt-3 leading-relaxed tracking-wide">{tool.description}</p>
                            </div>

                            <div className={`flex items-center text-ifes-green text-[10px] font-black uppercase tracking-[0.2em] mt-6`}>
                                <span>Iniciar Execução</span>
                                <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </motion.div>
                    ))}
                    
                    {/* Placeholder for future tools */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        className="bg-slate-50/50 p-8 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center h-[18rem]"
                    >
                         <div className="bg-slate-100 w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 mb-4">
                            <Settings size={22} className="animate-spin-slow" />
                        </div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center px-4">Novos utilitários em desenvolvimento</p>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};

export default Tools;


