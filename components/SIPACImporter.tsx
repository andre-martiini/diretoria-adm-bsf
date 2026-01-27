
import React, { useState } from 'react';
import { SIPACProcess } from '../types';
import { Search, Loader2, FileCheck, AlertCircle, History, FileText, Info, Users, AlertTriangle } from 'lucide-react';

export const SIPACImporter: React.FC = () => {
    const [protocol, setProtocol] = useState('');

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SIPACProcess | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFetch = async () => {
        if (!protocol.trim()) return;

        setLoading(true);
        setError(null);
        setData(null);

        try {
            // For now, this will call our backend which will eventually have the scraper
            const response = await fetch(`http://localhost:3002/api/sipac/processo/${protocol.replace(/[^0-9]/g, '')}`);

            if (!response.ok) {
                throw new Error('Processo não encontrado ou erro no servidor SIPAC.');
            }

            const result = await response.json();
            setData(result);
        } catch (err: any) {
            setError(err.message || 'Falha ao conectar com o serviço de extração.');
        } finally {
            setLoading(false);
        }
    };

    const formatProtocol = (val: string) => {
        // Remove everything but numbers
        const numbers = val.replace(/\D/g, '');

        let masked = numbers;
        if (numbers.length > 5) masked = numbers.slice(0, 5) + '.' + numbers.slice(5);
        if (numbers.length > 11) masked = masked.slice(0, 12) + '/' + masked.slice(12);
        if (numbers.length > 15) masked = masked.slice(0, 17) + '-' + masked.slice(17, 19);

        return masked.slice(0, 20); // Max length
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProtocol(formatProtocol(e.target.value));
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                            <Search className="w-8 h-8 text-blue-600" />
                            Importador SIPAC
                        </h1>
                        <p className="text-slate-500 mt-1">Extração automática de parâmetros de contratação via protocolo</p>
                    </div>

                    <div className="flex gap-2">
                        <div className="relative group">
                            <div className="absolute inset-0 px-4 py-2 text-sm font-mono text-slate-200 pointer-events-none flex items-center">
                                {protocol.split('').map((char, i) => (
                                    <span key={i} className="opacity-0">{char}</span>
                                ))}
                                <span>{"00000.000000/0000-00".slice(protocol.length)}</span>
                            </div>
                            <input
                                type="text"
                                className="relative bg-transparent px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none w-64 font-mono text-sm text-slate-700 transition-all"
                                value={protocol}
                                onChange={handleInputChange}
                                onKeyPress={(e) => e.key === 'Enter' && handleFetch()}
                            />
                        </div>

                        <button
                            onClick={handleFetch}
                            disabled={loading}
                            className={`bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                            {loading ? 'Extraindo (pode levar 1-2 min)...' : 'Consultar'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {!data && !loading && !error && (
                    <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-2xl">
                        <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Info className="w-8 h-8 text-slate-300" />
                        </div>
                        <p className="text-slate-400">Insira um número de protocolo válido para iniciar a extração.</p>
                    </div>
                )}

                {data && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {/* Cabeçalho */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="col-span-2 bg-slate-50 rounded-xl p-6 border border-slate-100">
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4" /> Identificação e Status
                                </h3>
                                <div className="grid grid-cols-2 gap-y-4">
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Número do Processo</span>
                                        <span className="text-lg font-bold text-slate-800">{data.numeroProcesso}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Status</span>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                            {data.status}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Autuado em</span>
                                        <span className="text-slate-800">{data.dataAutuacion} às {data.horarioAutuacion}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Natureza</span>
                                        <span className="text-slate-800">{data.natureza}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                                <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Interessados
                                </h3>
                                <div className="space-y-3">
                                    {data.interessados.map((i, idx) => (
                                        <div key={idx} className="bg-white p-2 rounded-lg text-sm border border-blue-100">
                                            <span className="block text-[10px] text-blue-400 uppercase font-bold">{i.tipo}</span>
                                            <span className="text-slate-700 font-medium">{i.nome}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Classificação e Obs */}
                        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-500" />
                                <h3 className="text-sm font-bold text-slate-700 uppercase">Classificação e Observações</h3>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Assunto Principal</span>
                                        <span className="text-slate-800 font-semibold">{data.assuntoCodigo} - {data.assuntoDescricao}</span>
                                    </div>
                                    <div>
                                        <span className="block text-xs text-slate-400 uppercase">Assunto Detalhado</span>
                                        <p className="text-slate-600 text-sm italic">"{data.assuntoDetalhado || 'Sem detalhamento'}"</p>
                                    </div>
                                </div>
                                <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                                    <span className="block text-xs text-amber-600 uppercase font-bold mb-1">Observação do Processo</span>
                                    <p className="text-slate-700 text-sm leading-relaxed">{data.observacao || 'Nenhuma observação registrada.'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Cronograma de Documentos */}
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-500" /> Documentos do Processo
                            </h3>
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Ordem</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Tipo</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Data</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase">Origem</th>
                                            <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {data.documentos.map((doc, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">#{doc.ordem}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{doc.tipo}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{doc.data}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{doc.unidadeOrigem}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    {doc.url ? (
                                                        <a
                                                            href={doc.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-full font-bold text-xs transition-colors inline-block"
                                                        >
                                                            Visualizar
                                                        </a>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs italic">Indisponível</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Movimentações */}
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <History className="w-5 h-5 text-indigo-500" /> Histórico de Movimentações
                            </h3>
                            <div className="space-y-4">
                                {data.movimentacoes.map((mov, idx) => (
                                    <div key={idx} className="relative pl-8 pb-4 border-l-2 border-indigo-100 last:pb-0">
                                        <div className="absolute left-[-9px] top-0 w-4 h-4 bg-indigo-500 rounded-full border-2 border-white" />
                                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded">
                                                        {mov.data} às {mov.horario}
                                                    </span>
                                                    {mov.urgente && mov.urgente.toLowerCase().includes('sim') && (
                                                        <span className="text-[10px] font-bold text-red-600 px-1.5 py-0.5 bg-red-50 rounded border border-red-100 animate-pulse">
                                                            URGENTE
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-400">Enviado por: {mov.usuarioRemetente}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="block text-[10px] text-slate-400 uppercase">Origem</span>
                                                    <span className="font-medium text-slate-700">{mov.unidadeOrigem}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-slate-400 uppercase">Destino</span>
                                                    <span className="font-medium text-slate-700 text-blue-600">{mov.unidadeDestino}</span>
                                                </div>
                                            </div>
                                            {mov.usuarioRecebedor && (
                                                <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-2 text-[11px] text-slate-500">
                                                    <span className="font-bold">RECEBIDO:</span>
                                                    {mov.dataRecebimento} às {mov.horarioRecebimento} por {mov.usuarioRecebedor}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Incidentes / Cancelamentos */}
                        {data.incidentes && data.incidentes.length > 0 && (
                            <div>
                                <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5" /> Documentos Cancelados / Incidentes
                                </h3>
                                <div className="overflow-hidden rounded-xl border border-red-100">
                                    <table className="min-w-full divide-y divide-red-100">
                                        <thead className="bg-red-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-red-600 uppercase">Documento</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-red-600 uppercase">Solicitante</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-red-600 uppercase">Data</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold text-red-600 uppercase">Justificativa</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-red-50">
                                            {data.incidentes.map((inc, idx) => (
                                                <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <span className="block text-sm font-bold text-slate-800">{inc.numeroDocumento}</span>
                                                        <span className="block text-[10px] text-slate-400 uppercase">{inc.tipoDocumento}</span>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">{inc.usuarioSolicitacao}</td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600">{inc.dataSolicitacao}</td>
                                                    <td className="px-4 py-4 text-sm text-slate-500 italic max-w-xs truncate" title={inc.justificativa}>
                                                        {inc.justificativa}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

