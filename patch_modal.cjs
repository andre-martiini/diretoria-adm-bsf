const fs = require('fs');

const file = 'components/AnnualHiringPlan.tsx';
let content = fs.readFileSync(file, 'utf-8');

// Adicionar import para o FractionationControlService
if (!content.includes("FractionationControlService")) {
  content = content.replace("import { fetchSystemConfig }", "import { FractionationControlService } from '../services/fractionationControlService';\nimport { fetchSystemConfig }");
}

const hookString = `
  const fractionationAlert = useMemo(() => {
    if (!isManualModalOpen) return null;
    const isRestricted = newItem.modalidade === 'Dispensa de Licitação' || newItem.modalidade === 'Suprimento de Fundos';
    if (!isRestricted || !newItem.codigoPdm || !newItem.valor) return null;

    const isObras = newItem.categoria === Category.Obras;
    return FractionationControlService.calculateFractionation(
      data,
      newItem.codigoPdm,
      isObras,
      newItem.valor,
      newItem.modalidade
    );
  }, [isManualModalOpen, newItem.valor, newItem.categoria, newItem.modalidade, newItem.codigoPdm, data]);
`;

// Inserir hook logo antes de addManualItem
if (!content.includes("const fractionationAlert = useMemo")) {
  content = content.replace("  const handleAddManualItem = async () => {", hookString + "\n  const handleAddManualItem = async () => {");
}

const divToAdd = `
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Modalidade</label>
                  <div className="relative">
                    <select
                      className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-black outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all appearance-none cursor-pointer"
                      value={newItem.modalidade || ''}
                      onChange={(e) => setNewItem({ ...newItem, modalidade: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      <option value="Pregão Eletrônico">Pregão Eletrônico</option>
                      <option value="Dispensa de Licitação">Dispensa de Licitação</option>
                      <option value="Suprimento de Fundos">Suprimento de Fundos</option>
                      <option value="Inexigibilidade">Inexigibilidade</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Código PDM/CATSER</label>
                  <input
                    type="text"
                    placeholder="Ex: 12345"
                    className="w-full px-6 py-4 bg-white border border-slate-200 rounded-[24px] text-sm font-bold outline-none focus:ring-4 focus:ring-ifes-blue/10 focus:border-ifes-blue transition-all"
                    value={newItem.codigoPdm || ''}
                    onChange={(e) => setNewItem({ ...newItem, codigoPdm: e.target.value })}
                  />
                </div>
              </div>
`;

// Substituir na interface (logo antes de Categoria de Compra)
const targetString = `              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Categoria de Compra</label>`;

if (content.includes(targetString) && !content.includes('<label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Modalidade</label>')) {
  content = content.replace(targetString, divToAdd + "\n" + targetString);
}


// Add warning message
const warningDiv = `
                    {fractionationAlert && fractionationAlert.exceeded && (
                      <div className="absolute top-[100%] left-0 w-full mt-2 text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-red-100 z-10">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span>Atenção: Limite de fracionamento para este ramo excedido. Consumido: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fractionationAlert.used)}.</span>
                      </div>
                    )}
`;

const targetValorString = `                      value={newItem.valor}
                      onChange={(e) => setNewItem({ ...newItem, valor: Number(e.target.value) })}
                    />`;

if (content.includes(targetValorString) && !content.includes("fractionationAlert.exceeded")) {
  content = content.replace(targetValorString, targetValorString + "\n" + warningDiv);
}

fs.writeFileSync(file, content);
