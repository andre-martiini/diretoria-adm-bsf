
import React from 'react';
import { ArrowUpDown, RefreshCw, Eye, PencilLine, Sparkles, Info } from 'lucide-react';
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
      className={`p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-white hover:bg-slate-50 ${sortKey ? 'cursor-pointer hover:text-ifes-green' : ''} transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
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
          <tr className="bg-slate-50/50 border-b border-slate-100">
            {viewMode === 'planning' ? (
              <>
                <TableHeader label="ITEM PCA" sortKey="numeroItem" align="center" />
                <TableHeader label="Tipo" sortKey="categoria" align="center" />
                <TableHeader label="Descrição do Item / Classe / Grupo" sortKey="titulo" />
                <th
                  className="p-6 text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-white hover:bg-slate-50 hover:text-ifes-green cursor-pointer transition-colors whitespace-nowrap group"
                  onClick={() => onSort('ifc')}
                  title="IFC: Identificador de Futura Contratação"
                >
                  <div className="flex items-center gap-1 justify-end">
                    <span className="flex items-center gap-1">
                      IFC
                      <Info size={10} className="text-slate-300 group-hover:text-ifes-green transition-colors" />
                    </span>
                    <ArrowUpDown size={12} className={`transition-opacity ${sortConfig.key === 'ifc' ? 'opacity-100 text-ifes-green' : 'opacity-20'}`} />
                  </div>
                </th>
                <TableHeader label="Valor total estimado" sortKey="valor" align="right" />
                <TableHeader label="Data desejada" sortKey="dataDesejada" align="center" />
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
              <td colSpan={5} className="p-20 text-center">
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
                  className={`transition-all group cursor-pointer ${isSelected ? 'bg-ifes-green/5' : 'hover:bg-ifes-green/[0.02]'}`}
                  onClick={() => {
                    if (viewMode === 'status') {
                      onViewDetails?.(item);
                    } else {
                      onViewPcaDetails?.(item);
                    }
                  }}
                >

                  {viewMode === 'planning' ? (
                    <>
                      {/* PCA Item ID Column */}
                      <td className="p-6 text-center">
                        <span className="text-xs font-bold text-blue-600 font-mono">
                          {item.numeroItem || '-'}
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
                            {item.titulo}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                            {item.classificacaoSuperiorCodigo ? `${item.classificacaoSuperiorCodigo} - ${item.classificacaoSuperiorNome}` : (item.grupoContratacao || 'N/A')}
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
                          {(() => {
                            if (!item.isGroup || !item.childItems || item.childItems.length <= 1) return item.ifc || 'N/D';
                            const firstIfc = item.childItems[0].ifc;
                            const allSame = item.childItems.every(c => c.ifc === firstIfc);
                            return allSame ? (firstIfc || 'N/D') : 'Múltiplos';
                          })()}
                        </span>
                      </td>

                      {/* Valor Column */}
                      <td className="p-6 text-right text-xs font-bold text-slate-700 tabular-nums">
                        {formatCurrency(item.valor)}
                      </td>

                      {/* Data Column */}
                      <td className="p-6 text-center">
                        <span className="text-xs font-bold text-slate-700 uppercase">
                          {item.dataDesejada ? formatDate(item.dataDesejada) : formatDate(item.inicio)}
                        </span>
                      </td>

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
