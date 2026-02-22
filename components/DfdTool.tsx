import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wand2, FileText, Calendar, AlertCircle, CheckCircle2, Loader2, FileDown, Copy, Download } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface GeneratedResult {
  succinctDescription: string;
  priorityClassification: 'Baixa' | 'Média' | 'Alta';
  needJustification: string;
  priorityJustification: string;
  expectedDate: string;
}

const DfdTool: React.FC = () => {
  const navigate = useNavigate();

  const [expectedDate, setExpectedDate] = useState('');
  const [objectDescription, setObjectDescription] = useState('');
  const [needInput, setNeedInput] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgencyReason, setUrgencyReason] = useState('');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expectedDate || !objectDescription || !needInput) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    if (isUrgent && !urgencyReason) {
      setError('Por favor, descreva o motivo da urgência.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!rawApiKey) {
        throw new Error('Chave de API do Gemini não encontrada no arquivo .env.local');
      }

      const apiKey = rawApiKey.trim();
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Tentativa 1: Modelo solicitado (2.5 Flash Lite)
      let modelName = 'gemini-2.5-flash-lite';
      let model = genAI.getGenerativeModel({ model: modelName });

      const prompt = `
Contexto Institucional: Ifes - Campus Barra de São Francisco.
Tarefa: Gerar uma Justificativa da Necessidade formal e técnica baseada no input simplificado do usuário para um Documento de Formalização da Demanda (DFD).

Lógica de Prioridade:
Se o usuário marcou como Urgente, a prioridade é "Alta" e você deve gerar a justificativa da prioridade baseada no motivo da urgência.
Se não é Urgente, arbitre entre "Baixa" ou "Média" conforme a natureza do objeto e a data de entrega desejada, e crie a justificativa dessa prioridade.

ESTRITAMENTE FORMAL E TÉCNICO (REGRAS DE OURO):
- O texto DEVE seguir rigorosamente o Manual de Redação da Presidência da República.
- ELIMINE QUALQUER INFORMALIDADE: Transforme gírias, coloquialismos ou reclamações em termos técnicos. 
- Exemplo: Se o usuário disser "o pessoal tá reclamando que tá ruim", escreva "foi identificada a necessidade de atualização para garantir a continuidade operacional e o bem-estar da comunidade acadêmica".
- Use voz passiva e terceira pessoa do singular (ex: "faz-se necessário", "observa-se").
- Priorize termos como "infraestrutura", "fomento", "otimização", "atendimento à legislação vigente".
- O resultado deve ser pronto para um documento oficial, sem NENHUM traço de informalidade do input original.

Inputs do Usuário:
Data Desejada para Conclusão/Entrega: ${expectedDate}
Descrição do Objeto: ${objectDescription}
Explicação do Usuário (Por que comprar): ${needInput}
Indicador de Urgência: ${isUrgent ? 'Sim' : 'Não'}
Motivo da Urgência (se houver): ${urgencyReason}

Retorne EXATAMENTE e APENAS um objeto JSON válido (sem marcadores de markdown como \`\`\`json) com a seguinte estrutura:
{
  "succinctDescription": "Descrição sucinta do objeto (máximo 200 caracteres)",
  "priorityClassification": "Baixa", // Ou "Média" ou "Alta"
  "needJustification": "Texto formal e técnico da Justificativa da Necessidade, focado no contexto do Ifes - Campus Barra de São Francisco.",
  "priorityJustification": "Texto fundamentando o grau de urgência/prioridade definido."
}
      `;

      let aiResponse;
      try {
        aiResponse = await model.generateContent(prompt);
      } catch (firstTryErr: any) {
        console.warn(`[Gemini] Erro no modelo ${modelName}:`, firstTryErr.message);
        // Fallback para 1.5 se o 2.5-lite falhar (pode ser restrição da chave)
        modelName = 'gemini-1.5-flash';
        model = genAI.getGenerativeModel({ model: modelName });
        aiResponse = await model.generateContent(prompt);
      }

      const responseText = aiResponse.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
      const parsedResult = JSON.parse(responseText);

      setResult({
        ...parsedResult,
        expectedDate
      });
    } catch (err: any) {
      console.error('Erro detalhado do Gemini:', err);
      if (err.message?.includes('API key not valid')) {
        setError('A chave de API do Gemini ainda é reportada como inválida. Certifique-se de que a chave em VITE_GEMINI_API_KEY no .env.local é uma chave do "Google AI Studio" e não do Firebase.');
      } else {
        setError(`Erro: ${err.message}. Tente reiniciar o servidor.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 border-t-4 border-emerald-500 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/ferramentas')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                <FileText size={24} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-black text-slate-800 leading-tight">Módulo de Criação de DFD</h1>
                <span className="text-xs font-bold text-slate-400">Automatização de Justificativas com IA</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 print:p-0 print:max-w-none">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:block">
          
          {/* Formulário */}
          <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm print:hidden">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">1</div>
              <h2 className="text-lg font-bold text-slate-800">Dados da Contratação</h2>
            </div>

            <form onSubmit={handleGenerate} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Data Desejada da Entrega/Conclusão *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar size={18} className="text-slate-400" />
                  </div>
                  <input
                    type="date"
                    required
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Descrição do Objeto *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ex: Lápis preto nº 2"
                  value={objectDescription}
                  onChange={(e) => setObjectDescription(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Por que precisamos dessa compra? (Necessidade) *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explique brevemente com suas palavras..."
                  value={needInput}
                  onChange={(e) => setNeedInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                />
              </div>

              <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    className="w-5 h-5 text-emerald-500 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-bold text-slate-800">Esta contratação é Urgente?</span>
                </label>
                
                {isUrgent && (
                  <div className="mt-4 pl-8">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Motivo da Urgência *</label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Descreva por que há urgência..."
                      value={urgencyReason}
                      onChange={(e) => setUrgencyReason(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none resize-none"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm font-medium">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-xl font-bold transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Gerando Documento...</span>
                  </>
                ) : (
                  <>
                    <Wand2 size={20} />
                    <span>Gerar DFD com Inteligência Artificial</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Resultado */}
          <div>
            <div className="sticky top-28 bg-slate-800 rounded-2xl p-6 md:p-8 shadow-xl text-white print:static print:bg-white print:text-slate-900 print:shadow-none print:p-0 print:border-0">
              
              {/* Header do Relatório com Melhor Contraste */}
              <div className="flex items-center justify-between mb-8 print:mb-12">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white ring-4 ring-slate-800/50 print:hidden font-black">2</div>
                   <div className="flex flex-col">
                      <h2 className="text-xl font-black text-white print:text-slate-900">Relatório Consolidado</h2>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest print:hidden">Documento Tecnico Digital</span>
                   </div>
                </div>
                {result && (
                   <button 
                    onClick={handleExportPDF}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all print:hidden shadow-lg shadow-emerald-900/20"
                   >
                     <FileDown size={18} />
                     <span>PDF</span>
                   </button>
                )}
              </div>

              {/* Versão PDF Header (Oculta na Web) */}
              <div className="hidden print:flex items-center justify-between border-b-2 border-slate-200 pb-6 mb-8 text-slate-500 italic text-xs">
                <div className="flex items-center gap-4">
                   <img src="/logo-ifes.png" alt="Ifes Logo" className="h-12" />
                   <div>
                     <p className="font-bold text-slate-900 not-italic text-sm">Instituto Federal do Espírito Santo</p>
                     <p>Campus Barra de São Francisco</p>
                   </div>
                </div>
                <div className="text-right">
                  <p>Documento de Formalização da Demanda (DFD)</p>
                  <p>Emitido via Portal PCA Intelligence</p>
                </div>
              </div>

              {result ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                      <div className="flex justify-between items-start mb-1">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Conclusão</span>
                        <button onClick={() => handleCopy(new Date(result.expectedDate).toLocaleDateString('pt-BR'))} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={12} />
                        </button>
                      </div>
                      <div className="text-lg font-bold print:text-slate-900">{new Date(result.expectedDate).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                      <div className="flex justify-between items-start mb-1">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Prioridade</span>
                        <button onClick={() => handleCopy(result.priorityClassification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold
                            ${result.priorityClassification === 'Alta' ? 'bg-red-500/20 text-red-300 print:bg-red-50 print:text-red-700' : 
                              result.priorityClassification === 'Média' ? 'bg-amber-500/20 text-amber-300 print:bg-amber-50 print:text-amber-700' :
                              'bg-emerald-500/20 text-emerald-300 print:bg-emerald-50 print:text-emerald-700'}`}>
                           {result.priorityClassification}
                         </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Descrição Sucinta</span>
                       <button onClick={() => handleCopy(result.succinctDescription)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={14} />
                       </button>
                    </div>
                    <p className="text-sm font-bold leading-relaxed print:text-slate-900">{result.succinctDescription}</p>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200 print:mt-4">
                    <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Justificativa da Necessidade</span>
                       <div className="flex gap-2 print:hidden">
                          <button onClick={() => handleCopy(result.needJustification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy size={14} />
                          </button>
                       </div>
                    </div>
                    <p className="text-sm/relaxed text-slate-200 whitespace-pre-wrap print:text-slate-800">{result.needJustification}</p>
                  </div>

                  <div className="bg-slate-700/50 p-4 rounded-xl relative group print:bg-slate-50 print:border print:border-slate-200 print:mt-4">
                     <div className="flex justify-between items-start mb-2">
                       <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-tight print:text-slate-500">Justificativa de Prioridade</span>
                       <button onClick={() => handleCopy(result.priorityJustification)} className="text-emerald-400 hover:text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                          <Copy size={14} />
                       </button>
                    </div>
                    <p className="text-sm/relaxed text-slate-200 whitespace-pre-wrap print:text-slate-800">{result.priorityJustification}</p>
                  </div>
                  
                  <div className="mt-8 flex items-center justify-center gap-2 text-emerald-400 font-bold bg-emerald-900/40 p-3 rounded-lg border border-emerald-500/30 print:hidden">
                     <CheckCircle2 size={18} />
                     <span>Pronto para submissão oficial</span>
                  </div>

                  <div className="hidden print:block mt-20 text-[10px] text-slate-400 border-t border-slate-100 pt-4 text-center">
                    Documento gerado eletronicamente em {new Date().toLocaleString('pt-BR')} via Portal PCA Intelligence. 
                    Este é um draft técnico para composição do Documento de Formalização da Demanda.
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 space-y-4">
                  <Wand2 size={48} className="opacity-20" />
                  <p className="text-center text-sm font-medium">Preencha os dados e clique em gerar<br/>para receber a documentação formal.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default DfdTool;
