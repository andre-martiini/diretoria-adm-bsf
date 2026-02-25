
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_SERVER_URL } from '../constants';
import { SIPACProcess } from '../types';
import { 
    Search, 
    Loader2, 
    FileCheck, 
    AlertCircle, 
    History, 
    FileText, 
    Info, 
    Users, 
    AlertTriangle, 
    LayoutDashboard,
    ArrowLeft,
    Building2,
    RefreshCw,
    ExternalLink,
    ChevronRight,
    Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import logoIfes from '../logo-ifes.png';
import { fetchSystemConfig } from '../services/configService';
import { SystemConfig } from '../types';

export const SIPACImporter: React.FC = () => {
    const navigate = useNavigate();
    const [protocol, setProtocol] = useState('');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<SIPACProcess | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const initConfig = async () => {
            const sysConfig = await fetchSystemConfig();
            setConfig(sysConfig);
        };
        initConfig();
    }, []);

    const handleFetch = async () => {
        if (!protocol.trim()) return;

        setLoading(true);
        setError(null);
        setData(null);

        try {
            const response = await fetch(`${API_SERVER_URL}/api/sipac/processo?protocolo=${protocol}`);

            if (!response.ok) {
                throw new Error('Processo não encontrado ou erro no servidor SIPAC.');
            }

            const result: SIPACProcess = await response.json();
            if (result?.scraping_last_error) {
                throw new Error(`Erro no SIPAC: ${result.scraping_last_error}`);
            }
            setData(result);
        } catch (err: any) {
            setError(err.message || 'Falha ao conectar com o serviço de extração.');
        } finally {
            setLoading(false);
        }
    };

    const formatProtocol = (val: string) => {
        const numbers = val.replace(/\D/g, '');
        let masked = numbers;
        if (numbers.length > 5) masked = numbers.slice(0, 5) + '.' + numbers.slice(5);
        if (numbers.length > 11) masked = masked.slice(0, 12) + '/' + masked.slice(12);
        if (numbers.length > 15) masked = masked.slice(0, 17) + '-' + masked.slice(17, 19);
        return masked.slice(0, 20);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setProtocol(formatProtocol(e.target.value));
    };

    const handleExportZip = async () => {
        if (!data) return;
        setIsExporting(true);
        try {
            const documentos = Array.isArray(data.documentos) ? data.documentos : [];
            const response = await fetch(`${API_SERVER_URL}/api/sipac/processo/exportar-gemini`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    protocolo: data.numeroProcesso,
                    documentos
                })
            });

            if (!response.ok) throw new Error('Falha na geração do dossiê.');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Dossie_${String(data.numeroProcesso || 'processo').replace(/[^\d]/g, '')}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Erro ao exportar: ' + err.message);
        } finally {
            setIsExporting(false);
        }
    };

    const interessados = Array.isArray(data?.interessados) ? data.interessados : [];
    const documentos = Array.isArray(data?.documentos) ? data.documentos : [];
    const movimentacoes = Array.isArray(data?.movimentacoes) ? data.movimentacoes : [];

    return (
        <div className="min-h-screen border-t-4 border-ifes-green bg-[#f8fafc] font-sans text-slate-800">
            {/* Standardized Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 h-24 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <img src={logoIfes} alt="Logo IFES" className="h-12 w-auto object-contain" />
                        <div className="flex flex-col border-l border-slate-100 pl-3">
                            <span className="text-lg font-black text-ifes-green uppercase leading-none tracking-tight">Importador SIPAC</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                {config?.unidadeGestora.nome || 'Campus Barra de São Francisco'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/ferramentas')}
                            className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-ifes-green/10 text-slate-600 hover:text-ifes-green rounded-xl transition-all font-bold text-sm border border-slate-100 hover:border-ifes-green/20 cursor-pointer"
                        >
                            <ArrowLeft size={18} />
                            <span className="hidden md:inline">Ferramentas</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-12 space-y-8">
                {/* Search Hero */}
                <section className="relative">
                    <div className="absolute inset-0 bg-ifes-green/5 rounded-[2.5rem] -rotate-1 scale-105 pointer-events-none"></div>
                    <div className="relative glass bg-white/70 p-10 rounded-[2.5rem] shadow-premium border border-white/40 backdrop-blur-xl">
                        <div className="max-w-3xl mx-auto text-center space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-ifes-green/10 text-ifes-green rounded-full">
                                <Search size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Extração de Inteligência</span>
                            </div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Consulte Processos SIPAC</h2>
                            <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed">
                                Insira o número do protocolo para sincronizar dados oficiais, histórico de movimentações e documentos anexos.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center gap-3 p-2 bg-slate-100/50 rounded-2xl border border-slate-200/50 max-w-xl mx-auto shadow-inner">
                                <div className="relative flex-1 w-full">
                                    <input
                                        type="text"
                                        placeholder="00000.000000/0000-00"
                                        className="w-full bg-transparent px-6 py-4 font-mono text-lg text-slate-800 focus:outline-none placeholder:text-slate-300"
                                        value={protocol}
                                        onChange={handleInputChange}
                                        onKeyPress={(e) => e.key === 'Enter' && handleFetch()}
                                    />
                                </div>
                                <button
                                    onClick={handleFetch}
                                    disabled={loading || !protocol.trim()}
                                    className="w-full sm:w-auto bg-ifes-green hover:bg-[#15803d] text-white px-8 py-4 rounded-xl font-black transition-all flex items-center justify-center gap-3 group shadow-lg shadow-ifes-green/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
                                >
                                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                                    <span>{loading ? 'Sincronizando...' : 'Localizar'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="max-w-xl mx-auto bg-red-50 border border-red-100 text-red-700 p-6 rounded-2xl flex items-center gap-4 shadow-sm"
                        >
                            <AlertCircle className="w-6 h-6 flex-shrink-0" />
                            <p className="font-bold text-sm tracking-tight">{error}</p>
                        </motion.div>
                    )}

                    {!data && !loading && !error && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center py-20 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-slate-200"
                        >
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Info className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Aguardando Entrada</p>
                            <p className="text-slate-400 text-sm mt-1">Nenhum processo consultado no momento.</p>
                        </motion.div>
                    )}

                    {data && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8"
                        >
                            {/* Process Info Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="col-span-2 bg-white rounded-3xl p-8 border border-slate-200 shadow-premium group hover:border-ifes-green/30 transition-all">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                        <FileCheck className="w-4 h-4 text-ifes-green" /> Identificação e Status
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1">Número do Processo</span>
                                            <span className="text-2xl font-black text-slate-900 tracking-tighter">{data.numeroProcesso}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1">Status Oficial</span>
                                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 uppercase tracking-widest border border-emerald-100">
                                                {data.status}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1">Data de Autuação</span>
                                            <span className="text-sm font-bold text-slate-700">{data.dataAutuacion} às {data.horarioAutuacion}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1">Natureza do Objeto</span>
                                            <span className="text-sm font-bold text-slate-700">{data.natureza}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-ifes-green text-white rounded-3xl p-8 shadow-lg shadow-ifes-green/20 flex flex-col justify-between">
                                    <h3 className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                        <Users className="w-4 h-4" /> Interessados
                                    </h3>
                                    <div className="space-y-4">
                                        {interessados.slice(0, 3).map((i, idx) => (
                                            <div key={idx} className="bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/5">
                                                <span className="block text-[9px] text-white/50 uppercase font-black tracking-widest">{i.tipo}</span>
                                                <span className="text-sm font-black tracking-tight">{i.nome}</span>
                                            </div>
                                        ))}
                                        {interessados.length > 3 && (
                                            <span className="block text-[10px] font-bold text-center text-white/40 uppercase">+ {interessados.length - 3} interessados</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Export Action */}
                            <div className="flex justify-end">
                                <button
                                    onClick={handleExportZip}
                                    disabled={isExporting}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-3 shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-xs"
                                >
                                    {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    <span>{isExporting ? 'Gerando Dossiê...' : 'Exportar Dossiê para o Gemini (.zip)'}</span>
                                </button>
                            </div>

                            {/* Classification */}
                            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-premium">
                                <div className="bg-slate-50/50 px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-ifes-green" />
                                        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.15em]">Assunto e Observações</h3>
                                    </div>
                                </div>
                                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-6">
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1 tracking-widest">Assunto Principal</span>
                                            <span className="text-lg font-black text-slate-800 leading-tight">{data.assuntoCodigo} — {data.assuntoDescricao}</span>
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-slate-400 uppercase font-black mb-1 tracking-widest">Detalhamento Técnico</span>
                                            <p className="text-slate-600 text-sm font-medium italic leading-relaxed">"{data.assuntoDetalhado || 'Sem detalhamento complementar registrado.'}"</p>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50/50 rounded-2xl p-6 border border-amber-100 flex flex-col justify-center gap-2">
                                        <div className="flex items-center gap-2 text-amber-600 mb-1">
                                            <AlertTriangle size={14} />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Nota de Rodapé do Processo</span>
                                        </div>
                                        <p className="text-slate-700 text-sm font-bold leading-relaxed">{data.observacao || 'Nenhuma observação operacional registrada.'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Documents Table */}
                            <div className="space-y-4">
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
                                    <FileText className="w-5 h-5 text-ifes-green" /> Acervo Digital
                                </h3>
                                <div className="bg-white rounded-3xl border border-slate-200 shadow-premium overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50/50">
                                            <tr>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Seq.</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipologia</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Registro</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidade de Origem</th>
                                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {documentos.map((doc, idx) => (
                                                <tr key={idx} className="hover:bg-ifes-green/5 transition-colors group">
                                                    <td className="px-8 py-5">
                                                        <span className="text-xs font-black text-slate-400">#{doc.ordem}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="text-sm font-black text-slate-700 leading-tight">{doc.tipo}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="text-xs font-bold text-slate-500">{doc.data}</span>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">{doc.unidadeOrigem}</span>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        {doc.url ? (
                                                            <a
                                                                href={doc.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-2 bg-ife-green/10 text-ifes-green hover:bg-ifes-green hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                            >
                                                                <ExternalLink size={12} />
                                                                Original
                                                            </a>
                                                        ) : (
                                                            <span className="text-slate-300 text-[10px] font-black uppercase italic tracking-widest">Restrito</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* History */}
                            <div className="space-y-6">
                                <h3 className="text-base font-black text-slate-800 flex items-center gap-2 uppercase tracking-tighter">
                                    <History className="w-5 h-5 text-ifes-green" /> Linha do Tempo de Movimentação
                                </h3>
                                <div className="space-y-4">
                                    {movimentacoes.map((mov, idx) => (
                                        <div key={idx} className="relative pl-8 pb-4 border-l-2 border-slate-100 last:pb-0">
                                            <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm ${idx === 0 ? 'bg-ifes-green animate-pulse' : 'bg-slate-300'}`} />
                                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-premium flex flex-col sm:grid sm:grid-cols-4 gap-6 hover:shadow-lg transition-all">
                                                <div className="col-span-1 space-y-1">
                                                    <span className="text-[10px] font-black text-ifes-green uppercase tracking-widest decoration-dotted underline underline-offset-4">
                                                        {mov.data} às {mov.horario}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {mov.urgente && mov.urgente.toLowerCase().includes('sim') && (
                                                            <span className="text-[8px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded tracking-tighter animate-bounce">URGENTE</span>
                                                        )}
                                                        <span className="text-[10px] font-bold text-slate-400 line-clamp-1">{mov.usuarioRemetente}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="col-span-3 flex items-center justify-between gap-6">
                                                    <div className="flex-1 flex items-center gap-4">
                                                        <div className="flex-1">
                                                            <span className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">Origem</span>
                                                            <span className="text-xs font-black text-slate-600 uppercase tracking-tighter leading-tight">{mov.unidadeOrigem}</span>
                                                        </div>
                                                        <ChevronRight className="text-slate-200 flex-shrink-0" />
                                                        <div className="flex-1">
                                                            <span className="block text-[8px] font-black text-ifes-green uppercase mb-0.5 tracking-widest">Destino Atual</span>
                                                            <span className="text-xs font-black text-ifes-green uppercase tracking-tighter leading-tight">{mov.unidadeDestino}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {mov.usuarioRecebedor && (
                                                        <div className="hidden lg:block bg-slate-50 px-4 py-2 rounded-xl text-[10px] font-bold text-slate-500 text-right whitespace-nowrap">
                                                            <span className="block text-[8px] text-slate-400 uppercase font-black tracking-tighter">Recebido por</span>
                                                            {mov.usuarioRecebedor}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Premium Progress Bar */}
            {loading && (
                <div className="fixed bottom-0 left-0 w-full h-1.5 bg-slate-100 z-50">
                    <motion.div 
                        className="h-full bg-ifes-green"
                        initial={{ width: "0%" }}
                        animate={{ width: "95%" }}
                        transition={{ duration: 10, ease: "linear" }}
                    />
                </div>
            )}
        </div>
    );
};

