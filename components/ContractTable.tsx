
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
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onToggleAll?: () => void;
}

const ContractTable: React.FC<ContractTableProps> = ({
  data, loading, onSort, sortConfig, onEdit, onViewDetails, isPublic = false,
  selectedIds = [], onToggleSelection, onToggleAll
}) => {
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
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-50/50">
            {!isPublic && (
              <th className="p-4 border-b border-slate-100 text-center w-10">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-ifes-green focus:ring-ifes-green"
                  onChange={() => onToggleAll && onToggleAll()}
                  checked={data.length > 0 && selectedIds.length === data.length}
                />
              </th>
            )}
            <TableHeader label="Descrição" sortKey="titulo" />
            <TableHeader label="Status" align="center" />
            <TableHeader label="Previsto" sortKey="valor" align="right" />
            <TableHeader label="Processo SIPAC" align="right" />
            {!isPublic && <TableHeader label="Ações" align="center" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr>
              <td colSpan={isPublic ? 4 : 6} className="p-20 text-center">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="animate-spin text-ifes-green" size={24} />
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Carregando Planejamento...</span>
                </div>
              </td>
            </tr>
          ) : data.length > 0 ? (
            data.map((item) => {
              const computedStatus = item.computedStatus || getProcessStatus(item);
              const statusColor = getStatusColor(computedStatus);

              let isSelected = false;
              if (item.isGroup && item.childItems) {
                isSelected = item.childItems.every(c => selectedIds.includes(String(c.id)));
              } else {
                isSelected = selectedIds.includes(String(item.id));
              }

              return (
                <tr
                  key={item.id}
                  className={`transition-all group cursor-pointer ${isSelected ? 'bg-ifes-green/5' : 'hover:bg-slate-50/80'}`}
                  onClick={() => {
                    if (item.protocoloSIPAC && onViewDetails) {
                      onViewDetails(item);
                    } else if (!item.protocoloSIPAC && onEdit) {
                      onEdit(item);
                    }
                  }}
                >
                  {!isPublic && (
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-ifes-green focus:ring-ifes-green"
                        checked={isSelected}
                        onChange={() => onToggleSelection && onToggleSelection(String(item.id))}
                      />
                    </td>
                  )}
                  <td className="p-4">
                    <div className="flex flex-col max-w-[400px]">
                      <span className="text-xs font-bold text-slate-800 line-clamp-2 leading-tight mb-1">
                        {item.titulo}
                        {item.isManual && <span className="ml-2 text-[8px] bg-amber-100 text-amber-700 px-1 rounded uppercase">Manual</span>}
                        {item.isGroup && (
                          <span className="ml-2 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">
                            {item.itemCount} itens
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {item.categoria} • {formatDate(item.inicio)}
                        {item.identificadorFuturaContratacao && (
                          <span className="ml-2 px-1 bg-slate-100 text-slate-500 rounded font-mono text-[9px] lowercase">
                            ifc: {item.identificadorFuturaContratacao}
                          </span>
                        )}
                      </span>
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
                          onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
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
              <td colSpan={isPublic ? 4 : 6} className="p-20 text-center text-slate-400 font-medium italic">
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
