
import React from 'react';
import { ArrowUpDown, RefreshCw, Eye, PencilLine, Sparkles } from 'lucide-react';
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
  onViewSummary?: (item: ContractItem) => void;
  isPublic?: boolean;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onToggleAll?: () => void;
  viewMode?: 'planning' | 'status';
}

const ContractTable: React.FC<ContractTableProps> = ({
  data, loading, onSort, sortConfig, onEdit, onViewDetails, onViewSummary, isPublic = false,
  selectedIds = [], onToggleSelection, onToggleAll, viewMode = 'planning'
}) => {
  const TableHeader = ({ label, sortKey, align = 'left' }: { label: string; sortKey?: keyof ContractItem; align?: 'left' | 'center' | 'right' }) => (
    <th
      className={`p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b ${viewMode === 'planning' ? 'border-slate-200 hover:bg-slate-50' : 'border-violet-100 hover:bg-violet-50'} ${sortKey ? 'cursor-pointer' : ''} transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        {label}
        {sortKey && (
          <ArrowUpDown size={12} className={`transition-opacity ${sortConfig.key === sortKey ? (viewMode === 'planning' ? 'opacity-100 text-blue-600' : 'opacity-100 text-violet-600') : 'opacity-20'}`} />
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={`${viewMode === 'planning' ? 'bg-slate-50/30' : 'bg-violet-50/30'}`}>
            {!isPublic && (
              <th className="p-6 border-b border-[#E5E5E5] text-center w-10">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-ifes-green focus:ring-ifes-green"
                  onChange={() => onToggleAll && onToggleAll()}
                  checked={data.length > 0 && selectedIds.length === data.length}
                />
              </th>
            )}
            <TableHeader label="Descrição do Item" sortKey="titulo" />
            <TableHeader label="Status do Processo" align="center" />
            <TableHeader label="Valor Previsto" sortKey="valor" align="right" />
            <TableHeader label="Protocolo SIPAC" align="right" />
            {!isPublic && <TableHeader label="Configurar" align="center" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
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
                    <td className="p-6 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-ifes-green focus:ring-ifes-green"
                        checked={isSelected}
                        onChange={() => onToggleSelection && onToggleSelection(String(item.id))}
                      />
                    </td>
                  )}
                  <td className="p-6">
                    <div className="flex flex-col max-w-[500px]">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <span className="text-sm font-bold text-slate-800 leading-tight">
                          {item.titulo}
                        </span>
                        {item.isManual && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-sm uppercase font-black tracking-widest leading-none">Extra-PCA</span>}
                        <div className="flex items-center gap-2">
                          {item.isGroup && (
                            <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-md font-black uppercase tracking-tighter leading-none">
                              {item.childItems?.length || 0} itens do PCA
                            </span>
                          )}

                          {item.protocoloSIPAC && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewSummary && onViewSummary(item);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1 rounded-md border transition-all active:scale-95 ${item.dadosSIPAC?.resumoIA_Flash
                                ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                }`}
                            >
                              <Sparkles size={12} className={item.dadosSIPAC?.resumoIA_Flash ? 'text-blue-500' : 'text-slate-400'} />
                              <span className="text-[10px] font-black uppercase tracking-tight">
                                {item.dadosSIPAC?.resumoIA_Flash ? 'Entenda o Processo' : 'Análise Indisp.'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`text-[10px] font-black px-3 py-1 rounded-md uppercase ${statusColor} bg-opacity-10 border border-opacity-20 tracking-widest`}>
                      {computedStatus}
                    </span>
                  </td>
                  <td className="p-6 text-right text-sm font-bold text-slate-800 tabular-nums">
                    {formatCurrency(item.valor)}
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex flex-col items-end">
                      {item.protocoloSIPAC ? (
                        <span className="text-sm font-bold text-blue-600 tabular-nums tracking-tighter">{item.protocoloSIPAC}</span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 uppercase italic tracking-tighter">Aguard. Abertura</span>
                      )}
                    </div>
                  </td>
                  {!isPublic && (
                    <td className="p-6 text-center">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
                          title="Vincular/Atualizar Processo SIPAC"
                          className="p-2 hover:bg-ifes-blue/10 text-slate-400 hover:text-ifes-blue rounded-md transition-all cursor-pointer"
                        >
                          <PencilLine size={20} />
                        </button>
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
