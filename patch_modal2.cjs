const fs = require('fs');

const file = 'components/AnnualHiringPlan.tsx';
let content = fs.readFileSync(file, 'utf-8');

const validationString = `    if (['Dispensa de Licitação', 'Suprimento de Fundos'].includes(newItem.modalidade || '') && !newItem.codigoPdm) {
      setToast({ message: 'PDM/CATSER é obrigatório para Dispensa e Suprimento de Fundos.', type: 'error' });
      return;
    }`;

const targetString = `  const handleAddManualItem = async () => {
    setSaving(true);
    try {`;

if (content.includes(targetString) && !content.includes("PDM/CATSER é obrigatório")) {
  content = content.replace(targetString, `  const handleAddManualItem = async () => {
${validationString}
    setSaving(true);
    try {`);
  fs.writeFileSync(file, content);
}
