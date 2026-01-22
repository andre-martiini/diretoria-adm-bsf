
import React from 'react';
import { ArrowUpDown, Calendar, ChevronRight, RefreshCw, Eye } from 'lucide-react';
import { ContractItem, SortConfig } from '../types';
import { formatCurrency, formatDate, getCategoryColor } from '../utils/formatters';

interface ContractTableProps {
  data: ContractItem[];
  loading: boolean;
  onSort: (key: keyof ContractItem) => void;
  sortConfig: SortConfig;
}

const ContractTable: React.FC<ContractTableProps> = ({ data, loading, onSort, sortConfig }) => {
  const TableHeader = ({ label, sortKey, align = 'left' }: { label: string; sortKey?: keyof ContractItem; align?: 'left' | 'center' | 'right' }) => (
    <th
      className={`p-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 ${sortKey ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors whitespace-nowrap`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        {label}
        {sortKey && (
          <ArrowUpDown size={12} className={`transition-opacity ${sortConfig.key === sortKey ? 'opacity-100 text-ifes-green' : 'opacity-20'}`} />
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50/50">
            <TableHeader label="ABC" sortKey="abcClass" align="center" />
            <TableHeader label="Descrição" sortKey="titulo" />
            <TableHeader label="Investimento" sortKey="valor" align="right" />
            <TableHeader label="Prazo Planejado" sortKey="inicio" align="center" />
            <TableHeader label="Ações" align="center" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={5} className="p-24 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={16} />
                  </div>
                  <p className="text-sm font-bold text-slate-500 animate-pulse">Consultando PNCP Base...</p>
                </div>
              </td>
            </tr>
          ) : data.length > 0 ? (
            data.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/80 transition-all group">
                <td className="p-4 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${item.abcClass === 'A' ? 'text-slate-700 border-slate-300 bg-slate-50' :
                      'text-slate-400 border-transparent bg-transparent'
                    }`}>
                    {item.abcClass}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-col max-w-[400px]">
                    <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">
                      {item.titulo}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.categoria}</span>
                  </div>
                </td>
                <td className="p-4 text-right font-mono text-[11px] font-extrabold text-slate-700">
                  {formatCurrency(item.valor)}
                </td>
                <td className="p-4 text-center">
                  <span className="text-[11px] font-bold text-slate-600">{formatDate(item.inicio)}</span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button title="Ver Detalhes" className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-lg transition-colors">
                      <Eye size={16} />
                    </button>
                    <button title="Sincronizar" className="p-1.5 hover:bg-ifes-green/10 text-slate-400 hover:text-ifes-green rounded-lg transition-colors">
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="p-20 text-center text-slate-400 font-medium italic">
                Nenhum registro encontrado para os filtros selecionados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ContractTable;
