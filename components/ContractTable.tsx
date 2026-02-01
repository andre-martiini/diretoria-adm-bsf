
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
  onViewPcaDetails?: (item: ContractItem) => void;
  onViewSummary?: (item: ContractItem) => void;
  isPublic?: boolean;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onToggleAll?: () => void;
  viewMode?: 'planning' | 'status';
}

const ContractTable: React.FC<ContractTableProps> = ({
  data, loading, onSort, sortConfig, onEdit, onViewDetails, onViewPcaDetails, onViewSummary, isPublic = false,
  selectedIds = [], onToggleSelection, onToggleAll, viewMode = 'planning'
}) => {
  const TableHeader = ({ label, sortKey, align = 'left' }: { label: string; sortKey?: keyof ContractItem; align?: 'left' | 'center' | 'right' }) => (
    <th
      className={`p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b ${viewMode === 'planning' ? 'border-slate-200 hover:bg-slate-50' : 'border-blue-100 hover:bg-blue-50'} ${sortKey ? 'cursor-pointer' : ''} transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
        {label}
        {sortKey && (
          <ArrowUpDown size={12} className={`transition-opacity ${sortConfig.key === sortKey ? (viewMode === 'planning' ? 'opacity-100 text-blue-600' : 'opacity-100 text-blue-800') : 'opacity-20'}`} />
        )}
      </div>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={`${viewMode === 'planning' ? 'bg-slate-50/30' : 'bg-blue-50/30'}`}>
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
            {viewMode === 'planning' ? (
              <>
                <TableHeader label="ID" sortKey="numeroItem" align="center" />
                <TableHeader label="Tipo" sortKey="categoria" align="center" />
                <TableHeader label="Descrição do Item / Classe / Grupo" sortKey="titulo" />
                <TableHeader label="IFC" sortKey="identificadorFuturaContratacao" align="right" />
                <TableHeader label="Valor total estimado" sortKey="valor" align="right" />
                <TableHeader label="Data desejada" sortKey="inicio" align="center" />
                {!isPublic && <TableHeader label="Vincular" align="center" />}
              </>
            ) : (
              <>
                <TableHeader label="Número de processo no SIPAC" sortKey="protocoloSIPAC" />
                <TableHeader label="Objeto" sortKey="titulo" />
                <TableHeader label="Data de Criação" sortKey="inicio" align="center" />
                <TableHeader label="Local Atual" />
                <TableHeader label="Status do processo no SIPAC" align="center" />
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E5E5]">
          {loading ? (
            <tr>
              <td colSpan={isPublic ? 5 : 7} className="p-20 text-center">
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
                    if (viewMode === 'status') {
                      onViewDetails?.(item);
                    } else {
                      onViewPcaDetails?.(item);
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
                  {viewMode === 'planning' ? (
                    <>
                      {/* ID Column */}
                      <td className="p-6 text-center">
                        <span className="text-xs font-bold text-slate-700 font-mono">
                          #{item.numeroItem || '-'}
                        </span>
                      </td>

                      {/* Tipo Column */}
                      <td className="p-6 text-center">
                        <span className={`text-[10px] font-black px-2 py-1 rounded border uppercase tracking-wider ${item.categoria === 'Bens' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          item.categoria === 'TIC' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                            'bg-amber-50 text-amber-600 border-amber-100'
                          }`}>
                          {item.categoria}
                        </span>
                      </td>

                      {/* Descrição / Classe Column */}
                      <td className="p-6" onClick={(e) => {
                        e.stopPropagation();
                        if (onViewPcaDetails) onViewPcaDetails(item);
                      }}>
                        <div className="flex flex-col max-w-[500px]">
                          <span className="text-xs font-black text-slate-800 uppercase leading-none mb-1">
                            {item.grupoContratacao || 'Sem Classe/Grupo'}
                          </span>
                          <span className="text-xs font-bold text-slate-700 leading-tight">
                            {item.titulo}
                          </span>
                          <div className="flex items-center gap-2 mt-2">
                            {item.isManual && <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-sm uppercase font-black tracking-widest leading-none">Extra-PCA</span>}
                            {item.isGroup && (
                              <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-md font-black uppercase tracking-tighter leading-none">
                                {item.childItems?.length || 0} itens do PCA
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* IFC Column */}
                      <td className="p-6 text-right">
                        <span className="text-xs font-bold text-slate-700 font-mono tracking-widest bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
                          {item.identificadorFuturaContratacao || 'N/D'}
                        </span>
                      </td>

                      {/* Valor Column */}
                      <td className="p-6 text-right text-xs font-bold text-slate-700 tabular-nums">
                        {formatCurrency(item.valor)}
                      </td>

                      {/* Data Column */}
                      <td className="p-6 text-center">
                        <span className="text-xs font-bold text-slate-700 uppercase">
                          {formatDate(item.inicio)}
                        </span>
                      </td>

                      {!isPublic && (
                        <td className="p-6 text-center">
                          <div className="flex items-center justify-center">
                            {item.protocoloSIPAC ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onViewDetails) onViewDetails(item);
                                }}
                                title="Visualizar Processo no SIPAC"
                                className="text-[11px] font-black text-ifes-blue bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg hover:bg-ifes-blue hover:text-white transition-all shadow-sm"
                              >
                                {item.protocoloSIPAC}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); onEdit && onEdit(item); }}
                                title="Vincular Novo Processo SIPAC"
                                className="p-2.5 bg-slate-50 border border-slate-100 text-slate-400 hover:text-ifes-blue hover:bg-blue-50 hover:border-blue-100 rounded-xl transition-all cursor-pointer shadow-sm"
                              >
                                <PencilLine size={18} strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Número de processo no SIPAC + Assunto */}
                      <td className="p-6">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-black text-blue-700 tracking-tight">
                            {item.protocoloSIPAC}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 leading-tight mt-1 max-w-[350px]">
                            {item.dadosSIPAC?.assuntoDescricao ? `${item.dadosSIPAC.assuntoCodigo || ''} ${item.dadosSIPAC.assuntoDescricao}` : 'SEM ASSUNTO'}
                          </span>
                        </div>
                      </td>

                      {/* Objeto */}
                      <td className="p-6">
                        <span className="text-sm font-bold text-slate-700 leading-tight block max-w-[400px]">
                          {item.titulo}
                        </span>
                      </td>

                      {/* Data de Criação */}
                      <td className="p-6 text-center">
                        <span className="text-[11px] font-bold text-slate-500">
                          {item.dadosSIPAC?.dataAutuacion || '---'}
                        </span>
                      </td>

                      {/* Local Atual */}
                      <td className="p-6">
                        <span className="text-[11px] font-bold text-slate-600 block max-w-[250px] leading-snug" title={item.dadosSIPAC?.unidadeAtual}>
                          {item.dadosSIPAC?.unidadeAtual || 'N/D'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-6 text-center">
                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border uppercase tracking-tighter ${statusColor}`}>
                          {computedStatus}
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={isPublic ? 5 : 7} className="p-20 text-center text-slate-400 font-medium italic">
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
