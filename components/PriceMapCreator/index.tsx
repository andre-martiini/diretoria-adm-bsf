import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Calculator, 
  TrendingUp, 
  AlertTriangle, 
  ChevronRight, 
  Search,
  ArrowLeft,
  Download,
  Copy,
  LayoutDashboard,
  Package,
  History,
  Pencil,
  Table,
  Check,
  AlertCircle,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Process, Item, Quote, Stats } from './types';
import { calculateStats, formatCurrency, formatDate, isQuoteExpired } from './utils';
import { storage } from './storage';

// --- Components ---

const Card = ({ children, className = "", ...props }: { children: React.ReactNode, className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={`glass bg-white/70 rounded-[2rem] border border-white/40 shadow-premium overflow-hidden ${className}`}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className = "",
  disabled = false,
  type = 'button',
  ...props
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost',
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const variants = {
    primary: 'bg-ifes-green text-white hover:bg-[#15803d] shadow-lg shadow-ifes-green/20 font-black uppercase tracking-widest text-xs',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 font-black uppercase tracking-widest text-xs',
    danger: 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 font-black uppercase tracking-widest text-xs',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 font-black uppercase tracking-widest text-xs'
  };

  return (
    <button 
      type={type}
      disabled={disabled}
      onClick={onClick}
      {...props}
      className={`px-6 py-3 rounded-2xl transition-all inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <input
        id={id}
        {...props}
        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all"
      />
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'process' | 'export' | 'history'>('dashboard');
  const [processes, setProcesses] = useState<Process[]>([]);
  const [historyItems, setHistoryItems] = useState<(Item & { process_number: string, object: string })[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [quotes, setQuotes] = useState<Record<number, Quote[]>>({});
  const [loading, setLoading] = useState(true);

  // Form states
  const [editingProcess, setEditingProcess] = useState<Process | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [newProcess, setNewProcess] = useState({ process_number: '', object: '' });
  
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showItemModal, setShowItemModal] = useState(false);
  const [newItem, setNewItem] = useState({ item_number: 1, specification: '', unit: 'UN', quantity: 1, pricing_strategy: 'sanitized' as 'sanitized' | 'mean' | 'median' });

  const [showBatchItemModal, setShowBatchItemModal] = useState(false);
  const [batchItemText, setBatchItemText] = useState('');

  const [showBatchQuoteModal, setShowBatchQuoteModal] = useState<number | null>(null);
  const [batchQuoteText, setBatchQuoteText] = useState('');
  
  const [editingQuote, setEditingQuote] = useState<{ quote: Quote, itemId: number } | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState<number | null>(null);
  const [newQuote, setNewQuote] = useState({ source: '', quote_date: new Date().toISOString().split('T')[0], unit_price: 0, quote_type: 'private' as 'private' | 'public' });
  
  const [showBancoPrecosModal, setShowBancoPrecosModal] = useState(false);
  const [bancoPrecosText, setBancoPrecosText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const [analysisText, setAnalysisText] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'process' | 'item' | 'quote', id: number } | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  useEffect(() => {
    fetchProcesses();
  }, []);

  const fetchProcesses = async () => {
    try {
      const data = await storage.getProcesses();
      setProcesses(data);
    } catch (e) {
      console.error("Fetch processes failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const data = await storage.getHistory();
      setHistoryItems(data);
      setView('history');
    } catch (e) {
      console.error("Fetch history failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Deseja realmente apagar este item do mapa de processos? A remoção será permanente.')) {
      await storage.deleteItem(id);
      fetchHistory();
    }
  };

  const fetchProcessDetails = async (process: Process) => {
    setLoading(true);
    try {
      const itemsData = await storage.getItems(process.id);
      setItems(itemsData);
      
      const quotesMap: Record<number, Quote[]> = {};
      for (const item of itemsData) {
        const itemQuotes = await storage.getQuotes(item.id);
        quotesMap[item.id] = itemQuotes;
      }
      setQuotes(quotesMap);
      setSelectedProcess(process);
      setView('process');
    } catch (e) {
      console.error("Fetch process details failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProcess) {
        await storage.updateProcess(editingProcess.id, newProcess);
      } else {
        await storage.createProcess(newProcess);
      }
      fetchProcesses();
      setShowProcessModal(false);
      setEditingProcess(null);
      setNewProcess({ process_number: '', object: '' });
    } catch (e) { console.error(e); }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess) return;
    try {
      if (editingItem) {
        await storage.updateItem(editingItem.id, newItem);
      } else {
        await storage.createItem(selectedProcess.id, newItem);
      }
      fetchProcessDetails(selectedProcess);
      setShowItemModal(false);
      setEditingItem(null);
      setNewItem({ item_number: items.length + 2, specification: '', unit: 'UN', quantity: 1, pricing_strategy: 'sanitized' });
    } catch (e) { console.error(e); }
  };

  const handleBatchCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess) return;

    const lines = batchItemText.split('\n').filter(line => line.trim());
    const newItems = lines.map((line, index) => {
      // Try different separators: Tab, Semicolon, Comma
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split(';');
      if (parts.length < 2) parts = line.split(',');

      const [spec, unit, qty] = parts;

      return {
        item_number: items.length + index + 1,
        specification: spec?.trim() || '',
        unit: unit?.trim() || 'UN',
        quantity: parseFloat(qty?.trim().replace(/\./g, '').replace(',', '.') || '0') || 0,
        pricing_strategy: 'sanitized' as const
      };
    }).filter(it => it.specification);

    if (newItems.length === 0) {
      alert('Nenhum dado válido encontrado. Verifique o formato das colunas.');
      return;
    }

    try {
      await storage.batchCreateItems(selectedProcess.id, newItems);
      await fetchProcessDetails(selectedProcess);
      setShowBatchItemModal(false);
      setBatchItemText('');
    } catch (e) { 
      console.error(e);
      alert('Erro ao salvar itens. Tente novamente.');
    }
  };

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((showQuoteModal === null && !editingQuote) || !selectedProcess) return;
    try {
      if (editingQuote) {
        await storage.updateQuote(editingQuote.quote.id, newQuote);
      } else {
        await storage.createQuote(showQuoteModal!, newQuote);
      }
      fetchProcessDetails(selectedProcess);
      setShowQuoteModal(null);
      setEditingQuote(null);
      setNewQuote({ source: '', quote_date: new Date().toISOString().split('T')[0], unit_price: 0, quote_type: 'private' });
    } catch (e) { console.error(e); }
  };

  const handleBatchCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showBatchQuoteModal === null || !selectedProcess) return;

    const lines = batchQuoteText.split('\n').filter(line => line.trim());
    const newQuotes = lines.map(line => {
      // Try different separators: Tab, Semicolon, Comma
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split(';');
      if (parts.length < 2) parts = line.split(',');

      const [source, date, type, price] = parts;

      const isPublic = type?.toLowerCase().includes('pub') || type?.toLowerCase().includes('púb');

      let formattedDate = date?.trim() || '';
      // Normalizar formatos como "10 de Dezembro de 2025" ou "10/12/2025"
      if (formattedDate.includes(' de ') || formattedDate.includes('/')) {
        const months: { [key: string]: string } = {
          janeiro: '01', fevereiro: '02', 'março': '03', abril: '04', maio: '05', junho: '06',
          julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
        };
        
        let d, m, y;
        if (formattedDate.includes('/')) {
          [d, m, y] = formattedDate.split('/');
        } else {
          const parts = formattedDate.toLowerCase().replace(/ de /g, ' ').split(' ');
          if (parts.length === 3) {
            d = parts[0];
            m = months[parts[1]] || '01';
            y = parts[2];
          }
        }

        if (d && m && y) {
          formattedDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
      }

      return {
        source: source?.trim() || '',
        quote_date: formattedDate || new Date().toISOString().split('T')[0],
        quote_type: isPublic ? 'public' as const : 'private' as const,
        unit_price: parseFloat(price?.trim().replace('R$', '').replace(/\./g, '').replace(',', '.') || '0') || 0
      };
    }).filter(q => q.source && q.unit_price > 0);

    if (newQuotes.length === 0) {
      alert('Nenhum dado válido encontrado. Verifique o formato das colunas.');
      return;
    }

    try {
      await storage.batchCreateQuotes(showBatchQuoteModal, newQuotes);
      await fetchProcessDetails(selectedProcess);
      setShowBatchQuoteModal(null);
      setBatchQuoteText('');
    } catch (e) { 
      console.error(e);
      alert('Erro ao salvar cotações. Tente novamente.');
    }
  };

  const handleImportBancoPrecos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProcess || !bancoPrecosText) return;

    setIsImporting(true);
    try {
      const lines = bancoPrecosText.split('\n');
      const results: { spec: string, quotes: any[] }[] = [];
      let currentItem: any = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const itemMatch = line.match(/^(\d+)\t([^\t]+)\t\t/);
        if (itemMatch && !line.includes('ComprasNet')) {
          currentItem = { spec: itemMatch[2].trim(), quotes: [] };
          results.push(currentItem);
          continue;
        }

        const parts = line.split('\t');
        if (currentItem && parts.length >= 9 && /^\d+$/.test(parts[0])) {
          const source = parts[1]?.trim();
          const dateStr = parts[7]?.trim();
          const priceStr = parts[8]?.trim();

          if (source && dateStr && priceStr) {
            let isoDate = "";
            if (dateStr.includes('/')) {
              const [d, m, y] = dateStr.split('/');
              isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }

            const price = parseFloat(priceStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());

            if (isoDate && !isNaN(price)) {
              currentItem.quotes.push({
                source,
                quote_date: isoDate,
                quote_type: 'public',
                unit_price: price
              });
            }
          }
        }
      }

      let importedCount = 0;
      for (const res of results) {
        if (res.quotes.length === 0) continue;

        const targetItem = items.find(it => 
          it.specification.toLowerCase().includes(res.spec.toLowerCase().substring(0, 20)) ||
          res.spec.toLowerCase().includes(it.specification.toLowerCase().substring(0, 20))
        );

        if (targetItem) {
          await storage.batchCreateQuotes(targetItem.id, res.quotes);
          importedCount += res.quotes.length;
        }
      }

      await fetchProcessDetails(selectedProcess);
      setShowBancoPrecosModal(false);
      setBancoPrecosText('');
      alert(`${importedCount} cotações importadas com sucesso.`);
    } catch (e) {
      console.error(e);
      alert('Erro ao processar dados.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteProcess = async (id: number) => {
    if (deleteConfirmation?.type === 'process' && deleteConfirmation.id === id) {
      await storage.deleteProcess(id);
      fetchProcesses();
      setDeleteConfirmation(null);
    } else {
      setDeleteConfirmation({ type: 'process', id });
      setTimeout(() => setDeleteConfirmation(null), 3000);
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (deleteConfirmation?.type === 'item' && deleteConfirmation.id === id) {
      await storage.deleteItem(id);
      if (selectedProcess) fetchProcessDetails(selectedProcess);
      setDeleteConfirmation(null);
    } else {
      setDeleteConfirmation({ type: 'item', id });
      setTimeout(() => setDeleteConfirmation(null), 3000);
    }
  };

  const handleDeleteQuote = async (id: number) => {
    if (deleteConfirmation?.type === 'quote' && deleteConfirmation.id === id) {
      await storage.deleteQuote(id);
      if (selectedProcess) fetchProcessDetails(selectedProcess);
      setDeleteConfirmation(null);
    } else {
      setDeleteConfirmation({ type: 'quote', id });
      setTimeout(() => setDeleteConfirmation(null), 3000);
    }
  };

  if (view === 'export' && selectedProcess) {
    return (
      <div className="min-h-screen bg-white p-4 max-w-[1600px] mx-auto overflow-x-auto">
        <div className="flex justify-between items-center mb-8 print:hidden">
          <Button variant="secondary" onClick={() => setView('process')}>
            <ArrowLeft size={18} /> Voltar
          </Button>
          <div className="flex gap-4 items-center">
            <span className="text-sm font-bold text-slate-500">Metodologia Global:</span>
            <select 
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#326131]"
              onChange={(e) => {
                const strategy = e.target.value as any;
                if (!strategy) return;
                setItems(items.map(it => ({ ...it, pricing_strategy: strategy })));
                // Clear analysis text to force regeneration with new methodology
                setAnalysisText("");
              }}
            >
              <option value="">Alterar todos para...</option>
              <option value="sanitized">Média Saneada</option>
              <option value="mean">Média Comum</option>
              <option value="median">Mediana</option>
            </select>
            <Button onClick={() => window.print()}>
              <Download size={18} /> Imprimir PDF
            </Button>
          </div>
        </div>

        {/* Script to sync total value to analysis text */}
        {(() => {
          const total = items.reduce((acc, item) => {
            const itemQuotes = quotes[item.id] || [];
            const stats = calculateStats(itemQuotes, item.quantity);
            let val = stats.sanitizedMean;
            if (item.pricing_strategy === 'mean') val = stats.mean;
            if (item.pricing_strategy === 'median') val = stats.median;
            return acc + (val * item.quantity);
          }, 0);
          
          const hasSanitized = items.some(it => it.pricing_strategy === 'sanitized');
          const hasCommonMean = items.some(it => it.pricing_strategy === 'mean');
          const hasMedian = items.some(it => it.pricing_strategy === 'median');

          let methodology = "Média Saneada";
          if (hasMedian && !hasSanitized) methodology = "Mediana";
          if (hasCommonMean && !hasSanitized && !hasMedian) methodology = "Média Comum";
          
          const conclusionText = `Deste modo, a metologia aplicada foi a “${methodology}” sobre os valores encontrados que obteve o valor máximo estimado da cesta de produtos o total de ${formatCurrency(total)}`;
          
          const defaultText = `Observações:\n1. Planilha elaborada com base na Instrução Normativa ME/SEGES nº 73, de 05 de agosto de 2020.\n2. Informações contidas na planilha com base em pesquisas de preços comprovadas pelos orçamentos anexos.\n\nANÁLISE CRÍTICA: A estimativa apurada foi calçada em atendimento ao art. 5º da IN ME/SEGES Nº 73, de 05 de agosto de 2020. Consultou-se os potenciais concessionários e também o sistema denominado Banco de Preços (Preços Públicos) para obtenção dos valores estimados. Dentre os valores coletados, os valores que estão em disparate aos demais, foram desconsiderados.`;
          
          if (!analysisText) setAnalysisText(defaultText);
          return null;
        })()}

        <div className="flex justify-between items-center mb-12 border-b-4 border-[#326131] pb-6 relative">
          <div className="absolute left-0 top-0">
            <img src="https://proen.ifes.edu.br/images/stories/ifes-horizontal-cor.png" alt="IFES" className="h-16 object-contain" />
          </div>
          <div className="w-full text-center">
            <h1 className="text-3xl font-extrabold uppercase tracking-tight text-[#326131] mb-1">Mapa Comparativo de Preços</h1>
            <p className="text-slate-500 font-mono text-sm">Processo nº {selectedProcess.process_number}</p>
            <p className="mt-2 text-lg text-slate-700 font-medium">Objeto: {selectedProcess.object}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-[#326131] text-white uppercase font-bold text-center">
                <th className="border border-white/20 p-2 w-8" rowSpan={2}>Item</th>
                <th className="border border-white/20 p-2 w-48" rowSpan={2}>Especificação Sucinta</th>
                <th className="border border-white/20 p-2 w-12" rowSpan={2}>UNID</th>
                <th className="border border-white/20 p-2 w-12" rowSpan={2}>Quant</th>
                <th className="border border-white/20 p-2" colSpan={3}>Preços Base</th>
                
                {/* Conditional Columns based on strategy */}
                {(items.some(it => it.pricing_strategy === 'median' || it.pricing_strategy === 'sanitized')) && (
                  <th className="border border-white/20 p-2" rowSpan={2}>Menor Valor Unitário</th>
                )}
                
                <th className="border border-white/20 p-2" rowSpan={2}>Média (Unitário)</th>
                
                {(items.some(it => it.pricing_strategy === 'median' || it.pricing_strategy === 'sanitized')) && (
                  <th className="border border-white/20 p-2" rowSpan={2}>Mediana (Unitário)</th>
                )}
  
                {(items.some(it => it.pricing_strategy === 'sanitized')) && (
                  <>
                    <th className="border border-white/20 p-2" rowSpan={2}>Desvio Padrão</th>
                    <th className="border border-white/20 p-2" rowSpan={2}>CV (%)</th>
                    <th className="border border-white/20 p-2" rowSpan={2}>Limite Inferior</th>
                    <th className="border border-white/20 p-2" rowSpan={2}>Limite Superior</th>
                    <th className="border border-white/20 p-2" rowSpan={2}>Média Saneada</th>
                  </>
                )}
                
                <th className="border border-white/20 p-2 bg-[#1e3a1d]" rowSpan={2}>Total Estimado</th>
              </tr>
              <tr className="bg-[#326131] text-white uppercase font-bold text-center">
                <th className="border border-white/20 p-2 min-w-[120px]">Fornecedor</th>
                <th className="border border-white/20 p-2">Data</th>
                <th className="border border-white/20 p-2">Vlr. Unit.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, itemIdx) => {
                const itemQuotes = quotes[item.id] || [];
                const stats = calculateStats(itemQuotes, item.quantity);
                const rowCount = Math.max(1, itemQuotes.length);
                
                const isSanitized = item.pricing_strategy === 'sanitized';
                const isMedian = item.pricing_strategy === 'median';
                const isMean = item.pricing_strategy === 'mean';
  
                let finalUnitValue = stats.sanitizedMean;
                if (isMean) finalUnitValue = stats.mean;
                if (isMedian) finalUnitValue = stats.median;
                
                const finalTotal = finalUnitValue * item.quantity;
                const isEvenRow = itemIdx % 2 === 0;
  
                return (
                  <React.Fragment key={item.id}>
                    {Array.from({ length: rowCount }).map((_, idx) => (
                      <tr key={`${item.id}-${idx}`} className={`${isEvenRow ? 'bg-white' : 'bg-[#f0f9f0]'} hover:bg-emerald-50/50 transition-colors`}>
                        {idx === 0 && (
                          <>
                            <td className="border border-slate-200 p-2 text-center font-bold text-[#326131]" rowSpan={rowCount}>{item.item_number}</td>
                            <td className="border border-slate-200 p-2 align-top text-slate-700" rowSpan={rowCount}>{item.specification}</td>
                            <td className="border border-slate-200 p-2 text-center text-slate-600" rowSpan={rowCount}>{item.unit}</td>
                            <td className="border border-slate-200 p-2 text-center font-bold text-slate-700" rowSpan={rowCount}>{item.quantity}</td>
                          </>
                        )}
                        
                        {/* Quote Columns */}
                        <td className="border border-slate-200 p-2 min-w-[120px] text-slate-600">
                          {itemQuotes[idx]?.source || '-'}
                        </td>
                        <td className="border border-slate-200 p-2 text-center whitespace-nowrap text-slate-500">
                          {itemQuotes[idx] ? formatDate(itemQuotes[idx].quote_date) : '-'}
                        </td>
                        <td className={`border border-slate-200 p-2 text-right font-mono ${
                          isSanitized && itemQuotes[idx] && (itemQuotes[idx].unit_price < stats.lowerLimit || itemQuotes[idx].unit_price > stats.upperLimit)
                            ? 'text-slate-400 line-through'
                            : 'text-slate-600'
                        }`}>
                          {itemQuotes[idx] ? formatCurrency(itemQuotes[idx].unit_price) : '-'}
                        </td>
  
                        {idx === 0 && (
                          <>
                            {(items.some(it => it.pricing_strategy === 'median' || it.pricing_strategy === 'sanitized')) && (
                              <td className="border border-slate-200 p-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/30 text-xs" rowSpan={rowCount}>
                                {isMedian || isSanitized ? formatCurrency(stats.min) : '-'}
                              </td>
                            )}
                            
                            <td className="border border-slate-200 p-2 text-center font-mono text-slate-600 text-xs" rowSpan={rowCount}>
                              {formatCurrency(stats.mean)}
                            </td>
                            
                            {(items.some(it => it.pricing_strategy === 'median' || it.pricing_strategy === 'sanitized')) && (
                              <td className="border border-slate-200 p-2 text-center font-mono text-slate-600 text-xs" rowSpan={rowCount}>
                                {isMedian || isSanitized ? formatCurrency(stats.median) : '-'}
                              </td>
                            )}
  
                            {(items.some(it => it.pricing_strategy === 'sanitized')) && (
                              <>
                                <td className="border border-slate-200 p-2 text-center font-mono text-slate-500 text-xs" rowSpan={rowCount}>
                                  {isSanitized ? formatCurrency(stats.stdDev) : '-'}
                                </td>
                                <td className="border border-slate-200 p-2 text-center font-mono text-slate-500 text-xs" rowSpan={rowCount}>
                                  {isSanitized ? `${stats.cv.toFixed(1)}%` : '-'}
                                </td>
                                <td className="border border-slate-200 p-2 text-center font-mono text-slate-500 text-xs" rowSpan={rowCount}>
                                  {isSanitized ? formatCurrency(stats.lowerLimit) : '-'}
                                </td>
                                <td className="border border-slate-200 p-2 text-center font-mono text-slate-500 text-xs" rowSpan={rowCount}>
                                  {isSanitized ? formatCurrency(stats.upperLimit) : '-'}
                                </td>
                                <td className="border border-slate-200 p-2 text-center font-mono text-slate-600 text-xs" rowSpan={rowCount}>
                                  {isSanitized ? formatCurrency(stats.sanitizedMean) : '-'}
                                </td>
                              </>
                            )}
  
                            <td className="border border-slate-200 p-2 text-center font-mono font-black text-[#1e3a1d] bg-emerald-100/50 text-xs" rowSpan={rowCount}>
                                {formatCurrency(finalTotal)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-[#1e3a1d] text-white font-bold uppercase">
                <td colSpan={items.some(it => it.pricing_strategy === 'sanitized') ? 15 : (items.some(it => it.pricing_strategy === 'median') ? 10 : 8)} className="p-3 text-right text-xs">
                  Valor Total da Pesquisa de Preços:
                </td>
                <td className="p-3 text-right font-mono text-sm tracking-wider">
                  {formatCurrency(items.reduce((acc, item) => {
                    const itemQuotes = quotes[item.id] || [];
                    const stats = calculateStats(itemQuotes, item.quantity);
                    let val = stats.sanitizedMean;
                    if (item.pricing_strategy === 'mean') val = stats.mean;
                    if (item.pricing_strategy === 'median') val = stats.median;
                    return acc + (val * item.quantity);
                  }, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-8 mb-4 print:mb-0">
          <textarea 
            className="w-full min-h-[150px] p-4 text-xs text-slate-700 leading-relaxed border-none focus:ring-0 bg-transparent resize-none overflow-hidden print:p-0 print:min-h-0"
            value={analysisText}
            onChange={(e) => setAnalysisText(e.target.value)}
            style={{ height: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'inherit';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
          <div className="px-4 py-2 text-xs text-slate-700 leading-relaxed font-bold print:px-0">
            {(() => {
              const total = items.reduce((acc, item) => {
                const itemQuotes = quotes[item.id] || [];
                const stats = calculateStats(itemQuotes, item.quantity);
                let val = stats.sanitizedMean;
                if (item.pricing_strategy === 'mean') val = stats.mean;
                if (item.pricing_strategy === 'median') val = stats.median;
                return acc + (val * item.quantity);
              }, 0);

              const hasSanitized = items.some(it => it.pricing_strategy === 'sanitized');
              const hasCommonMean = items.some(it => it.pricing_strategy === 'mean');
              const hasMedian = items.some(it => it.pricing_strategy === 'median');
              let methodology = "Média Saneada";
              if (hasMedian && !hasSanitized) methodology = "Mediana";
              if (hasCommonMean && !hasSanitized && !hasMedian) methodology = "Média Comum";

              return `Deste modo, a metologia aplicada foi a “${methodology}” sobre os valores encontrados que obteve o valor máximo estimado da cesta de produtos o total de ${formatCurrency(total)}`;
            })()}
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-12 text-center print:mt-24">
          <div className="border-t border-slate-400 pt-4">
            <p className="font-bold">Responsável pela Pesquisa</p>
            <p className="text-sm text-slate-500">Nome e Assinatura</p>
          </div>
          <div className="border-t border-slate-400 pt-4">
            <p className="font-bold">Autoridade Competente</p>
            <p className="text-sm text-slate-500">Aprovação</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen border-t-4 border-ifes-green bg-slate-50/50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-ifes-green text-white z-20 hidden md:flex flex-col shadow-premium">
        <div className="bg-white/10 backdrop-blur-md p-8 mb-6 flex items-center justify-center border-b border-white/10">
           <img src="https://proen.ifes.edu.br/images/stories/ifes-horizontal-branco.png" onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="IFES" className="h-10 object-contain brightness-0 invert" />
        </div>

        <nav className="flex-1 px-4 space-y-2">
          <button 
            onClick={() => { setView('dashboard'); setSelectedProcess(null); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'dashboard' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <LayoutDashboard size={20} />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setShowAlerts(true)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative ${showAlerts ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <AlertCircle size={20} />
            <span className="font-medium">Avisos</span>
            {(() => {
              let alertCount = 0;
              if (selectedProcess) {
                items.forEach(it => {
                  const itQuotes = quotes[it.id] || [];
                  const stats = calculateStats(itQuotes, it.quantity);
                  
                  // Alerta: Menos de 3 cotações válidas (não outliers)
                  if (stats.validQuotes < 3) alertCount++;
                  
                  // Alerta: CV alto
                  if (stats.cv > 25) alertCount++;

                  // Alerta: Cotações vencidas
                  itQuotes.forEach(q => { if (isQuoteExpired(q)) alertCount++; });
                });
              }
              return alertCount > 0 ? (
                <span className="absolute right-4 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#0f172a]">
                  {alertCount}
                </span>
              ) : null;
            })()}
          </button>
          <button 
            onClick={fetchHistory}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'history' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            <History size={20} />
            <span className="font-medium">Histórico</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="md:ml-64 p-8">
        <AnimatePresence mode="wait">
          {view === 'dashboard' ? (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <header className="flex justify-between items-end mb-12">
                <div>
                  <h2 className="text-4xl font-bold tracking-tight mb-2">Criador de Mapa de Preços</h2>
                  <p className="text-slate-500">Gerencie seus processos de contratação e cotações para montar mapas de preço.</p>
                </div>
                <Button onClick={() => setShowProcessModal(true)} className="h-12 px-6">
                  <Plus size={20} /> Novo Processo
                </Button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {processes.map((p) => (
                  <Card
                    key={p.id}
                    className="group hover:border-slate-400 transition-all cursor-pointer"
                    onClick={() => fetchProcessDetails(p)}
                  >
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase tracking-widest">
                          {p.process_number}
                        </span>
                        <div className="flex gap-2">
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingProcess(p);
                              setNewProcess({ process_number: p.process_number, object: p.object });
                              setShowProcessModal(true);
                            }}
                            className="text-slate-300 hover:text-emerald-500 transition-colors p-1.5 rounded-lg hover:bg-emerald-50"
                            title="Editar processo"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteProcess(p.id); }}
                            className={`p-1.5 rounded-lg transition-all ${
                              deleteConfirmation?.type === 'process' && deleteConfirmation.id === p.id 
                                ? 'bg-red-500 text-white' 
                                : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title="Excluir processo"
                          >
                            {deleteConfirmation?.type === 'process' && deleteConfirmation.id === p.id ? <Check size={16} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </div>
                      <h3 className="text-lg font-bold mb-2 line-clamp-2 group-hover:text-emerald-600 transition-colors">{p.object}</h3>
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <History size={14} />
                        {formatDate(p.created_at)}
                      </div>
                    </div>
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500">Clique para gerenciar</span>
                      <ChevronRight size={16} className="text-slate-300" />
                    </div>
                  </Card>
                ))}

                {processes.length === 0 && !loading && (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="text-slate-400" size={32} />
                    </div>
                    <h3 className="text-xl font-bold mb-1">Nenhum processo encontrado</h3>
                    <p className="text-slate-500 mb-6">Comece criando sua primeira pesquisa de preços.</p>
                    <Button onClick={() => setShowProcessModal(true)} variant="secondary">
                      Criar agora
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : view === 'history' ? (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto"
            >
              <header className="mb-12">
                <h2 className="text-4xl font-bold tracking-tight mb-2">Histórico de Itens</h2>
                <p className="text-slate-500">Todos os itens cadastrados em todos os processos.</p>
              </header>

              <div className="space-y-4">
                {historyItems.map((item) => (
                  <Card key={item.id} className="p-4 hover:border-slate-400 transition-all cursor-pointer group" onClick={() => {
                    const proc = processes.find(p => p.id === item.process_id);
                    if (proc) fetchProcessDetails(proc);
                  }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase">
                            {item.process_number}
                          </span>
                          <span className="text-xs text-slate-400">Item {item.item_number}</span>
                        </div>
                        <h3 className="text-lg font-bold">{item.specification}</h3>
                        <p className="text-sm text-slate-500">{item.quantity} {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent text-slate-300 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Apagar Item"
                        >
                          <Trash2 size={18} />
                        </button>
                        <ChevronRight size={20} className="text-slate-300" />
                      </div>
                    </div>
                  </Card>
                ))}
                {historyItems.length === 0 && (
                  <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                    <p className="text-slate-500">Nenhum item no histórico.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="process"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" onClick={() => setView('dashboard')}>
                  <ArrowLeft size={20} /> Voltar
                </Button>
                <div className="h-8 w-px bg-slate-200 mx-2" />
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{selectedProcess?.process_number}</h2>
                  <p className="text-sm text-slate-500 truncate max-w-md">{selectedProcess?.object}</p>
                </div>
                <div className="ml-auto flex gap-3">
                  <Button variant="secondary" onClick={() => setShowBancoPrecosModal(true)}>
                    <Table size={18} /> Banco de Preços
                  </Button>
                  <Button variant="secondary" onClick={() => setView('export')}>
                    <FileText size={18} /> Ver Mapa Final
                  </Button>
                  <Button variant="secondary" onClick={() => setShowBatchItemModal(true)}>
                    <Table size={18} /> Inserção em Lote
                  </Button>
                  <Button onClick={() => setShowItemModal(true)}>
                    <Plus size={18} /> Adicionar Item
                  </Button>
                </div>
              </div>

              <div className="space-y-8">
                {items.map((item) => {
                  const itemQuotes = quotes[item.id] || [];
                  const stats = calculateStats(itemQuotes, item.quantity);
                  const hasHighCV = stats.cv > 25;

                  return (
                    <Card key={item.id} id={`item-card-${item.id}`} className="border-l-4 border-l-slate-900 transition-all">
                      <div className="p-6">
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-slate-600">
                              {item.item_number}
                            </div>
                            <div>
                              <h3 className="text-xl font-bold mb-1">{item.specification}</h3>
                              <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span className="flex items-center gap-1"><Package size={14} /> {item.quantity} {item.unit}</span>
                                <span className="flex items-center gap-1"><Calculator size={14} /> {itemQuotes.length} cotações</span>
                                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded font-semibold uppercase">
                                  {item.pricing_strategy === 'sanitized' ? 'Média Saneada' : item.pricing_strategy === 'mean' ? 'Média Comum' : 'Mediana'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" title="Editar Item" onClick={() => {
                              setEditingItem(item);
                              setNewItem({ 
                                item_number: item.item_number, 
                                specification: item.specification, 
                                unit: item.unit, 
                                quantity: item.quantity,
                                pricing_strategy: item.pricing_strategy
                              });
                              setShowItemModal(true);
                            }}>
                              <Pencil size={18} className="text-slate-400" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              onClick={() => handleDeleteItem(item.id)}
                              className={deleteConfirmation?.type === 'item' && deleteConfirmation.id === item.id ? 'bg-red-500 text-white hover:bg-red-600' : ''}
                            >
                              {deleteConfirmation?.type === 'item' && deleteConfirmation.id === item.id ? <Check size={18} /> : <Trash2 size={18} className="text-red-400" />}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          {/* Quotes List */}
                          <div className="lg:col-span-2 space-y-4">
                            <div className="flex justify-between items-center">
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cotações Coletadas</h4>
                              <div className="flex gap-4">
                                <button
                                  onClick={() => {
                                    setBatchQuoteText('');
                                    setShowBatchQuoteModal(item.id);
                                  }}
                                  className="text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1"
                                >
                                  <Table size={14} /> PREÇOS EM LOTE
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingQuote(null);
                                    setShowQuoteModal(item.id);
                                  }}
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                                >
                                  <Plus size={14} /> ADICIONAR PREÇO
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {itemQuotes.map((q) => {
                                const isOutlier = q.unit_price < stats.lowerLimit || q.unit_price > stats.upperLimit;
                                return (
                                  <div key={q.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                    <div className="flex items-center gap-4">
                                      <div className={`w-2 h-2 rounded-full ${isOutlier ? 'bg-red-400' : 'bg-emerald-400'}`} />
                                      <div className="cursor-pointer" onClick={() => {
                                        setEditingQuote({ quote: q, itemId: item.id });
                                        setNewQuote({
                                          source: q.source,
                                          quote_date: q.quote_date,
                                          unit_price: q.unit_price,
                                          quote_type: q.quote_type
                                        });
                                        setShowQuoteModal(item.id);
                                      }}>
                                        <p className="font-semibold text-sm hover:text-emerald-600 transition-colors">{q.source}</p>
                                        <div className="flex items-center gap-2">
                                          <p className="text-[10px] text-slate-400 uppercase">{formatDate(q.quote_date)}</p>
                                          <span className={`text-[8px] px-1 rounded font-bold uppercase ${q.quote_type === 'public' ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-600'}`}>
                                            {q.quote_type === 'public' ? 'Pública' : 'Privada'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div className="text-right">
                                        <p className={`font-mono font-bold ${isOutlier ? 'text-slate-400 line-through' : ''}`}>
                                          {formatCurrency(q.unit_price)}
                                        </p>
                                        {isOutlier && <p className="text-[10px] text-red-500 font-bold uppercase">Outlier</p>}
                                      </div>
                                      <button 
                                        onClick={() => handleDeleteQuote(q.id)}
                                        className={`transition-all ${
                                          deleteConfirmation?.type === 'quote' && deleteConfirmation.id === q.id 
                                            ? 'text-red-500 scale-125' 
                                            : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500'
                                        }`}
                                      >
                                        {deleteConfirmation?.type === 'quote' && deleteConfirmation.id === q.id ? <Check size={14} /> : <Trash2 size={14} />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              {itemQuotes.length === 0 && (
                                <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                  <p className="text-sm text-slate-400">Nenhuma cotação inserida.</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Stats Panel */}
                          <div className="bg-ifes-green text-white rounded-[2rem] p-6 flex flex-col justify-between shadow-premium border border-white/20">
                            <div>
                              <h4 className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-6">Análise Estatística</h4>
                              
                              <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                  <span className="text-xs text-slate-400">Média Saneada</span>
                                  <span className="font-mono font-bold">{formatCurrency(stats.sanitizedMean)}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                  <span className="text-xs text-slate-400">Coef. Variação</span>
                                  <span className={`font-mono font-bold ${hasHighCV ? 'text-orange-400' : 'text-emerald-400'}`}>
                                    {stats.cv.toFixed(2)}%
                                  </span>
                                </div>
                                <div className="flex justify-between items-end">
                                  <span className="text-xs text-slate-400">Amostras Válidas</span>
                                  <span className="font-mono font-bold">{stats.validQuotes} / {itemQuotes.length}</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-white/10">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Estimado</p>
                              <p className="text-3xl font-bold font-mono tracking-tighter">{formatCurrency(stats.totalEstimated)}</p>
                              
                              {hasHighCV && (
                                <div className="mt-4 flex items-center gap-2 text-orange-400 bg-orange-400/10 p-2 rounded-lg text-[10px] font-bold uppercase">
                                  <AlertTriangle size={14} /> CV Alto: Requer mais cotações
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}

                {items.length === 0 && (
                  <div className="py-24 text-center bg-white rounded-3xl border border-slate-200">
                    <Package className="mx-auto text-slate-200 mb-4" size={48} />
                    <h3 className="text-xl font-bold mb-1">Nenhum item cadastrado</h3>
                    <p className="text-slate-500 mb-6">Adicione os itens que compõem este processo.</p>
                    <Button onClick={() => setShowItemModal(true)} variant="secondary">
                      Adicionar Item
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showProcessModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-premium border border-slate-200"
            >
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">{editingProcess ? 'Editar Processo' : 'Novo Processo'}</h3>
              <form onSubmit={handleCreateProcess} className="space-y-6">
                <Input 
                  label="Número do Processo / UASG" 
                  placeholder="Ex: 001/2024" 
                  required
                  value={newProcess.process_number}
                  onChange={e => setNewProcess({...newProcess, process_number: e.target.value})}
                />
                <div className="space-y-1.5">
                  <label htmlFor="object-textarea" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Objeto da Contratação</label>
                  <textarea 
                    id="object-textarea"
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all min-h-[100px]"
                    placeholder="Descreva o que está sendo contratado..."
                    required
                    value={newProcess.object}
                    onChange={e => setNewProcess({...newProcess, object: e.target.value})}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowProcessModal(false); setEditingProcess(null); setNewProcess({ process_number: '', object: '' }); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">{editingProcess ? 'Salvar Alterações' : 'Criar Processo'}</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showBatchQuoteModal !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-premium border border-slate-200"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inserção de Preços em Lote</h3>
                  <p className="text-sm text-slate-500">Cole as linhas da sua planilha (Colunas: Fornecedor, Data, Tipo, Valor Unitário)</p>
                </div>
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <Table size={20} className="text-slate-400" />
                </div>
              </div>

              <form onSubmit={handleBatchCreateQuote} className="space-y-6">
                <textarea
                  className="w-full h-64 px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all font-mono text-sm"
                  placeholder="Exemplo:&#10;Fornecedor A	01/01/2024	Privado	150,00&#10;Fornecedor B	02/01/2024	Público	145,50"
                  value={batchQuoteText}
                  onChange={e => setBatchQuoteText(e.target.value)}
                  required
                />

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-xs text-blue-700">
                  <strong>Dica:</strong> Copie as quatro colunas da sua planilha e cole aqui. O sistema reconhece datas em formato DD/MM/AAAA e valores com vírgula. Tipos contendo "pub" serão marcados como Públicos.
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowBatchQuoteModal(null); setBatchQuoteText(''); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar {batchQuoteText.split('\n').filter(l => l.trim()).length} Cotações</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showBatchItemModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-premium border border-slate-200"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Inserção de Itens em Lote</h3>
                  <p className="text-sm text-slate-500">Cole as linhas da sua planilha (Colunas: Especificação, Unidade, Quantidade)</p>
                </div>
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <Table size={20} className="text-slate-400" />
                </div>
              </div>

              <form onSubmit={handleBatchCreateItem} className="space-y-6">
                <textarea
                  className="w-full h-64 px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all font-mono text-sm"
                  placeholder="Exemplo:&#10;Cadeira de Escritório	UN	10&#10;Mesa de Reunião	UN	2"
                  value={batchItemText}
                  onChange={e => setBatchItemText(e.target.value)}
                  required
                />

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-xs text-blue-700">
                  <strong>Dica:</strong> No Excel ou Google Sheets, selecione as três colunas e as linhas desejadas, copie (Ctrl+C) e cole aqui (Ctrl+V). O sistema identificará automaticamente as colunas.
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowBatchItemModal(false); setBatchItemText(''); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Processar e Salvar {batchItemText.split('\n').filter(l => l.trim()).length} itens</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showItemModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-premium border border-slate-200"
            >
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">{editingItem ? 'Editar Item' : 'Adicionar Item'}</h3>
              <form onSubmit={handleCreateItem} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Item nº" 
                    type="number"
                    required
                    value={newItem.item_number}
                    onChange={e => setNewItem({...newItem, item_number: parseInt(e.target.value)})}
                  />
                  <Input 
                    label="Unidade" 
                    placeholder="Ex: UN, M², Serv" 
                    required
                    value={newItem.unit}
                    onChange={e => setNewItem({...newItem, unit: e.target.value})}
                  />
                </div>
                <Input 
                  label="Especificação Sucinta" 
                  placeholder="Ex: Cadeira de escritório ergonômica" 
                  required
                  value={newItem.specification}
                  onChange={e => setNewItem({...newItem, specification: e.target.value})}
                />
                <Input 
                  label="Quantidade Estimada" 
                  type="number"
                  step="0.01"
                  required
                  value={newItem.quantity}
                  onChange={e => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
                />
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estratégia de Preço</label>
                  <select 
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all"
                    value={newItem.pricing_strategy}
                    onChange={e => setNewItem({...newItem, pricing_strategy: e.target.value as any})}
                  >
                    <option value="sanitized">Média Saneada</option>
                    <option value="mean">Média Comum</option>
                    <option value="median">Mediana</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowItemModal(false); setEditingItem(null); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar Item</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {(showQuoteModal !== null || editingQuote !== null) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-premium border border-slate-200"
            >
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-6">{editingQuote ? 'Editar Cotação' : 'Nova Cotação'}</h3>
              <form onSubmit={handleCreateQuote} className="space-y-6">
                <Input 
                  label="Fonte / Fornecedor (CNPJ/Nome)" 
                  placeholder="Ex: Empresa de Móveis Ltda" 
                  required
                  value={newQuote.source}
                  onChange={e => setNewQuote({...newQuote, source: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Data da Cotação" 
                    type="date"
                    required
                    value={newQuote.quote_date}
                    onChange={e => setNewQuote({...newQuote, quote_date: e.target.value})}
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo de Fonte</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all"
                      value={newQuote.quote_type}
                      onChange={e => setNewQuote({...newQuote, quote_type: e.target.value as any})}
                    >
                      <option value="private">Privada (180 dias)</option>
                      <option value="public">Pública (360 dias)</option>
                    </select>
                  </div>
                </div>
                <Input 
                  label="Valor Unitário (R$)" 
                  type="number"
                  step="0.01"
                  required
                  value={newQuote.unit_price}
                  onChange={e => setNewQuote({...newQuote, unit_price: parseFloat(e.target.value)})}
                />
                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowQuoteModal(null); setEditingQuote(null); }}>Cancelar</Button>
                  <Button type="submit" className="flex-1">Salvar Cotação</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { margin: 0 !important; padding: 0 !important; }
          aside { display: none !important; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
      {/* Modal de Avisos */}
      <AnimatePresence>
      {showAlerts && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-premium border border-slate-200 overflow-hidden">
            <div className="p-6 bg-ifes-green text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <AlertCircle size={24} />
                <h3 className="text-xl font-bold">Central de Avisos</h3>
              </div>
              <button onClick={() => setShowAlerts(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {(() => {
                const alerts: { type: 'error' | 'warning', msg: string, process: string, item?: string, itemId?: number }[] = [];
                
                // Logic to identify critical and optional alerts
                items.forEach(it => {
                  const itemQuotes = quotes[it.id] || [];
                  const stats = calculateStats(itemQuotes, it.quantity);
                  
                  // Alerta 1: Menos de 3 cotações VÁLIDAS (excluindo outliers)
                  if (stats.validQuotes < 3) {
                    alerts.push({
                      type: 'error',
                      msg: `O item possui apenas ${stats.validQuotes} cotação(ões) válida(s) (desconsiderando outliers). O ideal para conformidade são pelo menos 3.`,
                      process: selectedProcess?.process_number || '',
                      item: it.specification,
                      itemId: it.id
                    });
                  }

                  // Alerta 2: Coeficiente de Variação (CV) Alto
                  if (stats.cv > 25) {
                    alerts.push({
                      type: 'warning',
                      msg: `Coeficiente de Variação elevado (${stats.cv.toFixed(2)}%). Recomenda-se obter mais cotações para maior precisão da média.`,
                      process: selectedProcess?.process_number || '',
                      item: it.specification,
                      itemId: it.id
                    });
                  }

                  // Alerta 3: Cotações Vencidas
                  itemQuotes.forEach(q => {
                    if (isQuoteExpired(q)) {
                      alerts.push({
                        type: 'warning',
                        msg: `Cotação de "${q.source}" está com data vencida (>180/360 dias).`,
                        process: selectedProcess?.process_number || '',
                        item: it.specification,
                        itemId: it.id
                      });
                    }
                  });
                });

                if (alerts.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="bg-emerald-50 text-emerald-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check size={32} />
                      </div>
                      <p className="text-slate-600 font-medium">Tudo em ordem! Nenhum aviso pendente para este processo.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {alerts.map((alert, i) => (
                      <div 
                        key={i} 
                        onClick={() => {
                          if (alert.itemId) {
                            setShowAlerts(false);
                            // Scroll to the item element
                            setTimeout(() => {
                              const element = document.getElementById(`item-card-${alert.itemId}`);
                              if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('ring-2', 'ring-[#326131]', 'ring-offset-2');
                                setTimeout(() => element.classList.remove('ring-2', 'ring-[#326131]', 'ring-offset-2'), 3000);
                              }
                            }, 100);
                          }
                        }}
                        className={`p-4 rounded-2xl flex gap-4 transition-all cursor-pointer hover:shadow-md active:scale-[0.98] ${
                          alert.type === 'error' ? 'bg-red-50 border border-red-100 hover:bg-red-100/50' : 'bg-amber-50 border border-amber-100 hover:bg-amber-100/50'
                        }`}
                      >
                        <div className={`mt-0.5 ${alert.type === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                          {alert.type === 'error' ? <AlertCircle size={20} /> : <AlertTriangle size={20} />}
                        </div>
                        <div className="flex-1">
                          <p className={`font-bold text-sm ${alert.type === 'error' ? 'text-red-800' : 'text-amber-800'}`}>{alert.item || alert.process}</p>
                          <p className={`text-sm ${alert.type === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{alert.msg}</p>
                        </div>
                        <div className="flex items-center">
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <Button onClick={() => setShowAlerts(false)}>Fechar Central</Button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

        {showBancoPrecosModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-3xl shadow-premium border border-slate-200"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Importar do Banco de Preços</h3>
                  <p className="text-sm text-slate-500">Copie e cole aqui o conteúdo completo da planilha exportada pelo portal Banco de Preços.</p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Download size={24} className="text-emerald-600" />
                </div>
              </div>

              <form onSubmit={handleImportBancoPrecos} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Conteúdo da Planilha</label>
                  <textarea
                    className="w-full h-[350px] p-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-ifes-green/10 focus:border-ifes-green transition-all font-mono text-xs leading-relaxed shadow-inner"
                    placeholder="Cole aqui os dados copiados (incluindo as linhas de Itens e Cotações)..."
                    required
                    value={bancoPrecosText}
                    onChange={e => setBancoPrecosText(e.target.value)}
                  />
                </div>
                
                <div className="bg-emerald-50 p-4 rounded-2xl flex gap-4 items-center">
                  <div className="bg-emerald-500 p-2 rounded-lg text-white">
                    <AlertCircle size={20} />
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                    O sistema identificará automaticamente os itens pelo nome e vinculará as cotações públicas encontradas (Órgão, Data e Preço).
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="secondary" className="flex-1" onClick={() => { setShowBancoPrecosModal(false); setBancoPrecosText(''); }} disabled={isImporting}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isImporting}>
                    {isImporting ? 'Processando dados...' : 'Importar Cotações'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
