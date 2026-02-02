import { ContractItem, SIPACProcess, SIPACMovement } from '../types';

// ==========================================
// 1. Lógica de Status do Processo
// ==========================================

export const getProcessStatus = (item: ContractItem): string => {
  // 1. Se não tem número de processo, não foi aberto.
  if (!item.protocoloSIPAC || item.protocoloSIPAC.length < 5) {
    return "Processo Não Aberto";
  }

  const sipac = item.dadosSIPAC;
  if (!sipac) {
    return "Processo Não Aberto"; // Ou "Aguardando Sincronização"
  }

  // 2. Se o status no SIPAC não for ATIVO, usamos o status oficial do sistema (Ex: ARQUIVADO, CANCELADO)
  const rawStatus = (sipac.status || '').toUpperCase();
  if (!rawStatus.includes('ATIVO') && !rawStatus.includes('CADASTRADO') && !rawStatus.includes('TRAMITAÇÃO')) {
    return sipac.status;
  }

  // 3. Lógica baseada em Gatilhos (Documentos)
  const docs = sipac.documentos || [];
  const docTitles = docs.map(d => (d.tipo + " " + (d.natureza || "")).toUpperCase());

  // Helper para verificar existência de documentos por palavras-chave
  const hasDoc = (keywords: string[]) => {
    return docTitles.some(t => keywords.some(k => t.includes(k.toUpperCase())));
  };

  // Ordem Inversa de Prioridade (do final para o começo do fluxo)

  // 7. Status: Encerrado/Arquivado
  if (hasDoc(['Termo de Recebimento Definitivo', 'Despacho de Arquivamento'])) {
    return "Encerrado/Arquivado";
  }

  // 6. Status: Contratado
  if (hasDoc(['Nota de Empenho', 'Contrato Assinado', 'Ordem de Serviço'])) {
    return "Contratado";
  }

  // 5. Status: Adjudicado/Homologado
  if (hasDoc(['Termo de Adjudicação', 'Termo de Homologação', 'Termo de Adjudicação/Homologação', 'Ata de Realização do Pregão'])) {
    return "Adjudicado/Homologado";
  }

  // 4. Status: Fase Externa
  if (hasDoc(['Edital', 'Aviso de Licitação'])) {
    return "Fase Externa";
  }

  // 3. Status: Análise de Legalidade
  if (hasDoc(['Parecer Jurídico', 'Minuta de Edital'])) {
    return "Análise de Legalidade";
  }

  // 2. Status: Composição de Preços
  if (hasDoc(['Pesquisa de Preços', 'Mapa Comparativo'])) {
    return "Composição de Preços";
  }

  // 1. Status: Planejamento (Default)
  return "Planejamento da Contratação";
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case "Processo Não Aberto": return "bg-slate-100 text-slate-500";
    case "Planejamento da Contratação": return "bg-blue-50 text-blue-600";
    case "Composição de Preços": return "bg-indigo-50 text-indigo-600";
    case "Análise de Legalidade": return "bg-purple-50 text-purple-600";
    case "Fase Externa": return "bg-amber-50 text-amber-600";
    case "Licitação Suspensa/Sob Análise": return "bg-red-50 text-red-600";
    case "Adjudicado/Homologado": return "bg-teal-50 text-teal-600";
    case "Contratado": return "bg-emerald-100 text-emerald-700";
    case "Encerrado/Arquivado": return "bg-slate-200 text-slate-700";
    default: return "bg-slate-100 text-slate-600";
  }
};

// ==========================================
// 2. Métricas de Gestão de Processos
// ==========================================

// Helper to parse DD/MM/YYYY HH:mm or DD/MM/YYYY
const parseDate = (dateStr: string, timeStr: string = '00:00'): Date => {
  if (!dateStr || typeof dateStr !== 'string') return new Date();

  // Clean string
  const cleanDate = dateStr.trim();
  const cleanTime = (timeStr || '00:00').trim();

  const [day, month, year] = cleanDate.split('/').map(Number);
  const [hour, minute] = cleanTime.split(':').map(Number);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date();

  return new Date(year, month - 1, day, hour || 0, minute || 0);
};

export interface ProcessMetrics {
  leadTime: number; // Dias
  reworkCount: number; // Inteiro
  bottlenecks: { unit: string; days: number }[];
  path: string[];
}

export const calculateProcessMetrics = (process: SIPACProcess | undefined | null): ProcessMetrics | null => {
  if (!process || !process.movimentacoes || process.movimentacoes.length === 0) {
    return null;
  }

  // 1. Sort Chronologically to ensure correct duration calculation
  const movs = [...process.movimentacoes].sort((a, b) => {
    const dateA = parseDate(a.data, a.horario).getTime();
    const dateB = parseDate(b.data, b.horario).getTime();
    return dateA - dateB;
  });

  // 1. Lead Time Total
  const startDate = parseDate(movs[0].data, movs[0].horario);
  const lastMov = movs[movs.length - 1];
  const endDate = parseDate(lastMov.data, lastMov.horario);

  // Diferença em dias (protegido contra negativo)
  const diffTime = Math.max(0, endDate.getTime() - startDate.getTime());
  const leadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // 2. Gargalos (Tempo por Unidade) & 3. Retrabalho (Loops)
  const unitStayTimes: Record<string, number> = {};
  const unitVisits: Record<string, number> = {};
  const path: string[] = [];

  for (let i = 0; i < movs.length; i++) {
    const currentMov = movs[i];
    const unit = currentMov.unidadeOrigem; // A unidade onde o processo ESTAVA antes de mover
    path.push(unit);

    // Contagem de visitas (Retrabalho)
    unitVisits[unit] = (unitVisits[unit] || 0) + 1;

    // Tempo de permanência
    // O tempo na unidadeOrigem é: (Data da movimentação atual) - (Data que CHEGOU na unidadeOrigem)
    // Para simplificar, assumimos que o tempo gasto na 'unidadeOrigem' termina quando ocorre essa movimentação (saída).
    // O início foi a data da movimentação ANTERIOR cujo destino foi essa unidade.

    // Se for a primeira movimentação (Autuação), o tempo conta desde a autuação até essa primeira saída?
    // Geralmente 'movimentacoes' registram a SAÍDA de A para B.
    // Então mov[i] é A -> B em t1.
    // mov[i+1] é B -> C em t2.
    // Tempo em A = ?? (Indefinido se A for a origem inicial, ou assumimos data de cadastro).
    // Tempo em B = t2 - t1.

    if (i < movs.length - 1) {
      const nextMov = movs[i + 1];
      const entryTime = parseDate(currentMov.data, currentMov.horario); // Saiu de A, Entrou em B
      const exitTime = parseDate(nextMov.data, nextMov.horario); // Saiu de B

      const destinationUnit = currentMov.unidadeDestino; // Unidade B

      const timeInUnit = Math.max(0, (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60 * 24));

      if (unitStayTimes[destinationUnit]) {
        unitStayTimes[destinationUnit] += timeInUnit;
      } else {
        unitStayTimes[destinationUnit] = timeInUnit;
      }
    }
  }

  // Loops Count (Retrabalho)
  // Se uma unidade aparece mais de 1 vez no path, houve retorno (exceto talvez sequências imediatas se houver erro de log, mas assumimos que A->A não gera mov).
  // Mas espera, se A manda pra B, e B manda pra C. Se C mandar pra A, A aparece 2x.
  // Rework = Sum(visits - 1) for all units where visits > 1.
  let reworkCount = 0;
  Object.values(unitVisits).forEach(v => {
    if (v > 1) reworkCount += (v - 1);
  });

  // Bottlenecks Array
  const bottlenecks = Object.entries(unitStayTimes)
    .map(([unit, days]) => ({ unit, days }))
    .sort((a, b) => b.days - a.days);

  return {
    leadTime,
    reworkCount,
    bottlenecks,
    path
  };
};

// ==========================================
// 3. Sankey Data Generator
// ==========================================

export interface SankeyNode {
  name: string;
}

export interface SankeyLink {
  source: number;
  target: number;
  value: number;
}

export const generateSankeyData = (items: ContractItem[]) => {
  const nodes: string[] = [];
  const linksMap: Record<string, number> = {};

  items.forEach(item => {
    if (!item.dadosSIPAC || !item.dadosSIPAC.movimentacoes) return;

    const movs = [...item.dadosSIPAC.movimentacoes].reverse(); // Chronological: Start -> End

    // Adiciona nós e links baseados no fluxo
    // A (Origem) -> B (Destino)

    // Para o primeiro movimento, temos Origem -> Destino.
    // Para os próximos, o Destino anterior vira Origem atual.

    // Vamos simplificar: Cada movimento é um link de Origem -> Destino.
    movs.forEach(m => {
      const source = m.unidadeOrigem;
      const target = m.unidadeDestino;

      if (!source || !target || source === target) return;

      if (!nodes.includes(source)) nodes.push(source);
      if (!nodes.includes(target)) nodes.push(target);

      const key = `${source}|${target}`;
      linksMap[key] = (linksMap[key] || 0) + 1;
    });
  });

  // Recharts Sankey requires numeric indices for source/target
  const sankeyNodes = nodes.map(name => ({ name }));
  const sankeyLinks = Object.entries(linksMap).map(([key, value]) => {
    const [sourceName, targetName] = key.split('|');
    return {
      source: nodes.indexOf(sourceName),
      target: nodes.indexOf(targetName),
      value
    };
  });

  return {
    nodes: sankeyNodes,
    links: sankeyLinks
  };
};

