
import React from 'react';
import { ArrowUpDown, RefreshCw, Eye, PencilLine } from 'lucide-react';
import { ContractItem, SortConfig } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getProcessStatus, getStatusColor } from '../utils/processLogic';

interface ContractTableProps {
  data: ContractItem[];
  loading: boolean;
  onSort: (key: keyof ContractItem) => void;
  sortConfig: SortConfig;
  onEdit?: (item: ContractItem) => void;
  onViewDetails?: (item: ContractItem) => void;
  isPublic?: boolean;
}

const ContractTable: React.FC<ContractTableProps> = ({ data, loading, onSort, sortConfig, onEdit, onViewDetails, isPublic = false }) => {
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
            <TableHeader label="Descrição" sortKey="titulo" />
            <TableHeader label="Status" align="center" sortKey="computedStatus" />
            <TableHeader label="Previsto" sortKey="valor" align="right" />
            <TableHeader label="Processo SIPAC" align="right" sortKey="protocoloSIPAC" />
            {!isPublic && <TableHeader label="Ações" align="center" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={isPublic ? 4 : 5} className="p-24 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <RefreshCw className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={16} />
                  </div>
                  <p className="text-sm font-bold text-slate-500 animate-pulse">Carregando Dados...</p>
                </div>
              </td>
            </tr>
          ) : data.length > 0 ? (
            data.map((item) => {
              const computedStatus = getProcessStatus(item);
              const statusColor = getStatusColor(computedStatus);

              return (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 transition-all group cursor-pointer"
                  onClick={() => {
                    if (item.protocoloSIPAC && onViewDetails) {
                      onViewDetails(item);
                    } else if (!item.protocoloSIPAC && onEdit) {
                      onEdit(item);
                    }
                  }}
                >
                  <td className="p-4">
                    <div className="flex flex-col max-w-[400px]">
                      <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">
                        {item.titulo}
                        {item.isManual && <span className="ml-2 text-[8px] bg-amber-100 text-amber-700 px-1 rounded uppercase">Manual</span>}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{item.categoria} • {formatDate(item.inicio)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${statusColor} bg-opacity-10 border border-opacity-20`}>
                      {computedStatus}
                    </span>
                  </td>
                  <td className="p-4 text-right font-mono text-[11px] font-extrabold text-slate-700">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex flex-col items-end">
                      {item.protocoloSIPAC ? (
                        <span className="font-mono text-[10px] font-black text-blue-600 tabular-nums">{item.protocoloSIPAC}</span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-300 uppercase italic">Processo Não Aberto</span>
                      )}
                    </div>
                  </td>
                  {!isPublic && (
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => onEdit && onEdit(item)}
                          title="Vincular/Atualizar Processo SIPAC"
                          className="p-1.5 hover:bg-ifes-green/10 text-slate-400 hover:text-ifes-green rounded-lg transition-colors cursor-pointer"
                        >
                          <PencilLine size={16} />
                        </button>
                        {item.protocoloSIPAC && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewDetails && onViewDetails(item);
                            }}
                            title="Ver Detalhes SIPAC"
                            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-lg transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={isPublic ? 4 : 5} className="p-20 text-center text-slate-400 font-medium italic">
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
