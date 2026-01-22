
import React from 'react';
import { formatCurrency } from '../utils/formatters';

interface KPICardProps {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ReactNode;
  variant?: 'primary' | 'emerald' | 'blue' | 'amber' | 'ifes';
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, icon, variant = 'primary' }) => {
  const styles = {
    primary: {
      border: 'border-l-indigo-600',
      bg: 'bg-indigo-600',
      shadow: 'shadow-indigo-50',
      text: 'text-indigo-600'
    },
    emerald: {
      border: 'border-l-emerald-600',
      bg: 'bg-emerald-600',
      shadow: 'shadow-emerald-50',
      text: 'text-emerald-600'
    },
    blue: {
      border: 'border-l-blue-600',
      bg: 'bg-blue-600',
      shadow: 'shadow-blue-50',
      text: 'text-blue-600'
    },
    amber: {
      border: 'border-l-amber-600',
      bg: 'bg-amber-600',
      shadow: 'shadow-amber-50',
      text: 'text-amber-600'
    },
    ifes: {
      border: 'border-l-ifes-green',
      bg: 'bg-ifes-green',
      shadow: 'shadow-ifes-green/20',
      text: 'text-ifes-green'
    }
  };

  const active = styles[variant];

  return (
    <div className={`bg-white p-6 rounded-2xl border-l-[6px] border border-slate-200 ${active.border} shadow-sm ${active.shadow} hover:shadow-lg transition-all`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</p>
          <h3 className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(value)}</h3>
        </div>
        <div className={`p-2.5 rounded-xl bg-slate-50 ${active.text}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${active.bg}`}></span>
        <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
};

export default KPICard;
