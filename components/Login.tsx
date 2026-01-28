import React from 'react';
import { useNavigate } from 'react-router-dom';
import logoIfes from '../logo-ifes.png';
import { LogIn } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-100 text-center">
        <img src={logoIfes} alt="Ifes Logo" className="h-20 mx-auto mb-6 object-contain" />

        <h1 className="text-2xl font-black text-slate-800 mb-2">Portal DAP</h1>
        <p className="text-slate-400 font-medium mb-8 text-sm leading-relaxed">
          Diretoria de Administração e Planejamento
          <br />Campus Barra de São Francisco
        </p>

        <button
          onClick={handleLogin}
          className="w-full bg-ifes-green hover:bg-emerald-600 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-ifes-green/20 cursor-pointer"
        >
          <span>Acessar Sistema</span>
          <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
        </button>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-300 font-bold uppercase tracking-widest">Acesso Restrito</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
