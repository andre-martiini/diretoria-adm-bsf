import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import { LogIn, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

const Login: React.FC = () => {
    const navigate = useNavigate();

    const handleLogin = () => {
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] relative flex items-center justify-center p-4 overflow-hidden font-sans">
            {/* Background Decorative Elements */}
            <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-ifes-green/5 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-ifes-green/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md"
            >
                <div className="glass bg-white/80 p-10 rounded-[2.5rem] shadow-premium border border-white/40 text-center backdrop-blur-xl">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        <img src={logoIfes} alt="Ifes Logo" className="h-24 mx-auto mb-8 object-contain drop-shadow-sm" />
                    </motion.div>

                    <div className="space-y-2 mb-10">
                        <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
                            Portal <span className="text-ifes-green">DAP</span>
                        </h1>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Diretoria de Adm. e Planejamento</span>
                            <span className="text-sm font-bold text-slate-500 tracking-tight">Campus Barra de São Francisco</span>
                        </div>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleLogin}
                        className="w-full bg-ifes-green hover:bg-[#15803d] text-white font-black py-4 px-8 rounded-2xl transition-all flex items-center justify-center gap-3 group shadow-lg shadow-ifes-green/20 cursor-pointer text-sm uppercase tracking-widest"
                    >
                        <span>Acessar Ecossistema</span>
                        <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />
                    </motion.button>

                    <div className="mt-10 pt-8 border-t border-slate-100/50 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-100">
                            <ShieldCheck size={12} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acesso Autenticado</span>
                        </div>
                        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-tighter">
                            Instituto Federal do Espírito Santo © 2026
                        </p>
                    </div>
                </div>

                {/* Decorative Bottom Tag */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="mt-6 flex justify-center"
                >
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">Powering Institutional Efficiency</span>
                </motion.div>
            </motion.div>
        </div>
    );
};

export default Login;
