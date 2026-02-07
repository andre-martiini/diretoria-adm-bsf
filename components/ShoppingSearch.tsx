
import React, { useState, useEffect, useCallback } from 'react';
import {
    Search,
    ShoppingCart,
    Plus,
    X,
    Trash2,
    Send,
    Info,
    DollarSign,
    Tag,
    TrendingUp,
    CheckCircle2,
    ShoppingCart as CartIcon,
    Package,
    AlertCircle
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { API_SERVER_URL } from '../constants';
import axios from 'axios';
import Toast, { ToastType } from './Toast';

interface CatalogItem {
    id: string;
    codigo_catmat_completo: string;
    familia_id: string;
    tipo_item: string;
    descricao_busca: string;
    descricao_tecnica: string;
    unidade_padrao: string;
    valor_referencia: number;
    frequencia_uso: number;
    uasg_origem_exemplo: string;
    stats?: {
        min_price: number;
        max_price: number;
        price_count: number;
        sources: string[];
    };
    _score?: number;
}

interface CartItem {
    id: string;
    item_detalhes: {
        descricao: string;
        unidade: string;
        valor_referencia: number;
        catmat: string;
    };
    quantidade: number;
    valor_total_estimado: number;
    justificativa_usuario: string;
    prioridade: string;
}

export const ShoppingSearch: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: ToastType } | null>(null);

    // Modal state for adding to cart
    const [quantity, setQuantity] = useState(1);
    const [justification, setJustification] = useState('');
    const [priority, setPriority] = useState('MEDIA');

    const handleSearch = useCallback(async (value: string) => {
        if (value.length < 2) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const response = await axios.get(`${API_SERVER_URL}/api/catalog/search?q=${encodeURIComponent(value)}`);
            setResults(response.data);
        } catch (error) {
            console.error("Search error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchCart = useCallback(async () => {
        try {
            const response = await axios.get(`${API_SERVER_URL}/api/cart`);
            setCart(response.data);
        } catch (error) {
            console.error("Cart error:", error);
        }
    }, []);

    useEffect(() => {
        fetchCart();
    }, [fetchCart]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            handleSearch(searchTerm);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, handleSearch]);

    const addToCart = async () => {
        if (!selectedItem || !justification) return;

        try {
            await axios.post(`${API_SERVER_URL}/api/cart/add`, {
                itemId: selectedItem.id,
                quantidade: quantity,
                justificativa: justification,
                prioridade: priority
            });
            setToast({ message: "Item adicionado ao carrinho!", type: 'success' });
            setSelectedItem(null);
            setJustification('');
            setQuantity(1);
            fetchCart();
        } catch (error) {
            setToast({ message: "Erro ao adicionar ao carrinho.", type: 'error' });
        }
    };

    const removeItem = async (id: string) => {
        try {
            await axios.delete(`${API_SERVER_URL}/api/cart/${id}`);
            fetchCart();
            setToast({ message: "Item removido.", type: 'success' });
        } catch (error) {
            setToast({ message: "Erro ao remover item.", type: 'error' });
        }
    };

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* Hero Search Section */}
            <div className="bg-white p-12 rounded-[40px] border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-ifes-green/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

                <div className="relative z-10 w-full max-w-2xl">
                    <div className="p-3 bg-ifes-green/10 w-fit rounded-2xl text-ifes-green mx-auto mb-6">
                        <TrendingUp size={32} strokeWidth={2.5} />
                    </div>
                    <h2 className="text-4xl font-black text-slate-800 tracking-tight mb-4">Google de Compras <span className="text-ifes-green">IFES</span></h2>
                    <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mb-10">O banco de dados inteligente para o seu pedido de compra</p>

                    <div className="relative group">
                        <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                            <Search className="text-slate-300 group-focus-within:text-ifes-green transition-colors" size={24} />
                        </div>
                        <input
                            type="text"
                            placeholder="O que você precisa hoje? (Ex: Caneta, Notebook, Ar Condicionado...)"
                            className="w-full pl-16 pr-6 py-6 bg-slate-50 border-2 border-slate-100 rounded-[30px] text-lg font-bold outline-none focus:bg-white focus:border-ifes-green focus:ring-8 focus:ring-ifes-green/5 transition-all shadow-inner"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {loading && (
                            <div className="absolute right-6 top-1/2 -translate-y-1/2">
                                <RefreshCw className="animate-spin text-ifes-green" size={20} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Tag size={14} /> Resultados Recomendados
                        </h3>
                        {results.length > 0 && (
                            <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-500 uppercase tracking-tighter">
                                {results.length} sugestões encontradas
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {loading && (
                            <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center text-center animate-pulse">
                                <div className="p-4 bg-slate-50 text-ifes-green rounded-full mb-4">
                                    <RefreshCw className="animate-spin" size={40} />
                                </div>
                                <h4 className="text-lg font-black text-slate-600">Buscando itens...</h4>
                                <p className="text-sm text-slate-400 mt-1">Estamos consultando o catálogo inteligente.</p>
                            </div>
                        )}

                        {!loading && results.length === 0 && searchTerm.length >= 2 && (
                            <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 flex flex-col items-center text-center">
                                <div className="p-4 bg-slate-50 text-slate-300 rounded-full mb-4">
                                    <Search size={40} />
                                </div>
                                <h4 className="text-lg font-black text-slate-600">Nenhum item encontrado</h4>
                                <p className="text-sm text-slate-400 mt-1">Tente termos mais genéricos ou verifique a ortografia.</p>
                            </div>
                        )}

                        {!loading && results.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-ifes-green hover:shadow-xl hover:shadow-ifes-green/5 transition-all cursor-pointer group flex items-center justify-between gap-6"
                            >
                                <div className="flex items-center gap-5 min-w-0">
                                    <div className="bg-slate-100 w-16 h-16 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-ifes-green group-hover:text-white transition-all shrink-0">
                                        {item.tipo_item === 'MATERIAL' ? <Package size={28} /> : <TrendingUp size={28} />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-500 rounded uppercase tracking-tighter">{item.tipo_item}</span>
                                            <span className="text-[9px] font-black px-2 py-0.5 bg-blue-50 text-blue-600 rounded uppercase tracking-tighter">CATMAT {item.codigo_catmat_completo}</span>
                                        </div>
                                        <h4 className="text-lg font-black text-slate-800 truncate group-hover:text-ifes-green transition-colors">{item.descricao_busca}</h4>
                                        <p className="text-xs text-slate-400 font-bold line-clamp-1">{item.descricao_tecnica}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end shrink-0 pl-6 border-l border-slate-100 min-w-[120px]">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor Estimado</span>
                                    <span className="text-xl font-black text-slate-900 tracking-tighter">{formatCurrency(item.valor_referencia)}</span>

                                    {item.stats && item.stats.min_price !== item.stats.max_price && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                                {formatCurrency(item.stats.min_price)} a {formatCurrency(item.stats.max_price)}
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-1 mt-2">
                                        < TrendingUp size={10} className="text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase">
                                            Relevância {Math.round(item.frequencia_uso * 10) / 10}
                                        </span>
                                    </div>
                                    {item.stats && (
                                        <span className="text-[8px] font-bold text-slate-300 mt-1 uppercase tracking-tight">
                                            Base: {item.stats.price_count} fontes
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sidebar Summary/Help */}
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <CartIcon size={120} />
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <TrendingUp size={16} className="text-ifes-green" /> Seu Carrinho de Demandas
                        </h4>

                        <div className="space-y-4">
                            {cart.length === 0 ? (
                                <div className="py-8 text-center flex flex-col items-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-4">
                                        <CartIcon size={32} />
                                    </div>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Carrinho Vazio</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {cart.map(item => (
                                        <div key={item.id} className="p-4 bg-slate-50 rounded-2xl flex items-center justify-between group">
                                            <div className="min-w-0">
                                                <h5 className="text-[11px] font-black text-slate-700 truncate">{item.item_detalhes.descricao}</h5>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-bold text-slate-400">{item.quantidade}x</span>
                                                    <span className="text-[9px] font-bold text-ifes-green">{formatCurrency(item.valor_total_estimado)}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}

                                    <div className="pt-6 border-t border-slate-200 mt-6">
                                        <div className="flex justify-between items-center mb-6">
                                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Estimado</span>
                                            <span className="text-xl font-black text-slate-900">{formatCurrency(cart.reduce((acc, i) => acc + i.valor_total_estimado, 0))}</span>
                                        </div>
                                        <button className="w-full py-4 bg-ifes-green text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-ifes-green-dark transition-all shadow-lg shadow-ifes-green/20 flex items-center justify-center gap-2">
                                            <Send size={16} /> Finalizar e Enviar para o Gestor
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* DETAIL MODAL */}
            {selectedItem && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[40px] w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
                        <header className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="p-3 bg-ifes-green/10 rounded-2xl text-ifes-green">
                                    <Package size={28} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">{selectedItem.descricao_busca}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Código CATMAT: {selectedItem.codigo_catmat_completo} • Família: {selectedItem.familia_id}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="p-3 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all text-slate-400">
                                <X size={28} />
                            </button>
                        </header>

                        <div className="p-10 overflow-y-auto space-y-10">
                            {/* Descrição Técnica Info Box */}
                            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <FileText size={14} /> Descrição Técnica (Catálogo Mestre)
                                </h4>
                                <p className="text-sm font-medium text-slate-600 leading-relaxed italic">
                                    {selectedItem.descricao_tecnica}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-8">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidade de Fornecimento</label>
                                        <div className="px-6 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-500 font-black text-sm flex items-center justify-between">
                                            <span>{selectedItem.unidade_padrao}</span>
                                            <span className="text-[8px] px-2 py-0.5 bg-slate-200 rounded uppercase">Bloqueada</span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quantidade Desejada</label>
                                        <div className="flex items-center gap-4">
                                            <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 font-bold transition-all">-</button>
                                            <input
                                                type="number"
                                                className="flex-1 px-6 py-3 bg-white border border-slate-200 rounded-xl text-center font-black text-lg outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green"
                                                value={quantity}
                                                onChange={(e) => setQuantity(Number(e.target.value))}
                                            />
                                            <button onClick={() => setQuantity(quantity + 1)} className="w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 font-bold transition-all">+</button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Prioridade</label>
                                        <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                            {['BAIXA', 'MEDIA', 'ALTA'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => setPriority(p)}
                                                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all
                                                        ${priority === p ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Justificativa da Necessidade *</label>
                                        <textarea
                                            rows={8}
                                            className="w-full px-6 py-4 bg-white border border-slate-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all"
                                            placeholder="Descreva por que você precisa deste item... Ex: Reposição de insumos para aulas práticas do curso de ADM."
                                            value={justification}
                                            onChange={(e) => setJustification(e.target.value)}
                                        />
                                    </div>

                                    {/* Real-time Calculator */}
                                    <div className="bg-ifes-green/5 p-8 rounded-3xl border-2 border-dashed border-ifes-green/20">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] font-black text-ifes-green uppercase tracking-widest">Resumo do Pedido</span>
                                            <span className="text-[9px] font-bold text-slate-400">{quantity} x {formatCurrency(selectedItem.valor_referencia)}</span>
                                        </div>
                                        <div className="text-3xl font-black text-ifes-green tracking-tighter">
                                            {formatCurrency(quantity * selectedItem.valor_referencia)}
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 mt-2 italic uppercase">Valor total estimado com base no histórico</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <footer className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button
                                onClick={() => setSelectedItem(null)}
                                className="px-10 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl text-xs font-black uppercase hover:bg-slate-100 hover:text-slate-600 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={addToCart}
                                disabled={!justification}
                                className="flex-1 px-10 py-4 bg-ifes-green text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-ifes-green-dark transition-all shadow-xl shadow-ifes-green/20 flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                                <CartIcon size={18} /> Adicionar ao Meu Pedido
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

// Internal icons needed
const FileText = ({ size, className }: any) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>;
const RefreshCw = ({ size, className }: any) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>;
