import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import { FileText, Wallet, LogOut, ArrowRight, TrendingUp, Wrench, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

const Dashboard: React.FC = () => {
    const navigate = useNavigate();

    const modules = [
        {
            title: 'Gestão de Contratações',
            description: 'Vínculo de processos SIPAC e monitoramento estratégico do PCA.',
            icon: <FileText size={26} />,
            route: '/pca',
            color: 'ifes-green',
            accent: 'bg-ifes-green',
            showCta: true
        },
        {
            title: 'Gestão Orçamentária',
            description: 'Controle de saldo, empenhos e execução financeira em tempo real.',
            icon: <Wallet size={26} />,
            route: '/gestao-orcamentaria',
            color: 'blue-600',
            accent: 'bg-blue-600',
            showCta: false
        },
        {
            title: 'Painel de Transparência',
            description: 'Visualização analítica de dados e controle social institucional.',
            icon: <TrendingUp size={26} />,
            route: '/transparencia',
            color: 'emerald-600',
            accent: 'bg-emerald-600',
            showCta: false
        },
        {
            title: 'Ecossistema de Ferramentas',
            description: 'Utilitários avançados, importação e inteligência de dados.',
            icon: <Wrench size={26} />,
            route: '/ferramentas',
            color: 'orange-600',
            accent: 'bg-orange-600',
            showCta: true
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
                            <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight tracking-tighter">Portal DAP</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                Barra de São Francisco
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 px-2 py-1 bg-slate-50 rounded-full border border-slate-100">
                        <ShieldCheck size={14} className="text-emerald-500" />
                        <div className="w-[1px] h-3 bg-slate-200 mx-1 hidden sm:block"></div>
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-2 text-slate-400 hover:text-red-600 transition-colors font-bold text-[10px] uppercase tracking-widest cursor-pointer"
                        >
                            <LogOut size={14} />
                            <span>Sair</span>
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
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Bem-vindo(a)!</h2>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {modules.map((module, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1 }}
                            onClick={() => navigate(module.route)}
                            className="group bg-white p-8 rounded-[2rem] border border-slate-200 shadow-premium hover:shadow-2xl hover:shadow-ifes-green/5 hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-64 relative overflow-hidden"
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 ${module.accent}/5 rounded-bl-full group-hover:scale-150 transition-transform duration-700`}></div>
                            
                            <div>
                                <div className={`${module.accent} w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-current/20 group-hover:scale-110 transition-transform`}>
                                    {module.icon}
                                </div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight group-hover:text-ifes-green transition-colors leading-tight">{module.title}</h3>
                                <p className="text-[11px] text-slate-400 font-bold uppercase mt-3 leading-relaxed tracking-wide">{module.description}</p>
                            </div>

                            {module.showCta && (
                                <div className={`flex items-center text-${module.color} text-[10px] font-black uppercase tracking-[0.2em] mt-6`}>
                                    <span>Acessar Módulo</span>
                                    <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            </main>

            <footer className="max-w-7xl mx-auto px-4 py-10 opacity-30">
                <div className="flex justify-center flex-col items-center gap-2">
                    <p className="text-[9px] text-slate-300 font-bold uppercase">Ifes Barra de São Francisco - 2026</p>
                </div>
            </footer>
        </div>
    );
};

export default Dashboard;
