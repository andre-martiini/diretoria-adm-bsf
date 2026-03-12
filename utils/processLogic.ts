import { ContractItem, SIPACProcess } from '../types';

export const getProcessStatus = (item: ContractItem): string => {
  if (!item.protocoloSIPAC || item.protocoloSIPAC.length < 5) {
    return 'Processo Nao Aberto';
  }

  const sipac = item.dadosSIPAC;
  if (!sipac) {
    if (item.govProcessMatch) {
      return 'Aguardando Sincronizacao SIPAC';
    }
    return 'Processo Nao Aberto';
  }

  if (sipac.summaryOnly) {
    return 'Sincronizacao Parcial';
  }

  const rawStatus = (sipac.status || '').toUpperCase();
  if (!rawStatus.includes('ATIVO') && !rawStatus.includes('CADASTRADO') && !rawStatus.includes('TRAMIT')) {
    return sipac.status;
  }

  const docs = sipac.documentos || [];
  const docTitles = docs.map((doc) => `${doc.tipo} ${doc.natureza || ''}`.toUpperCase());

  const hasDoc = (keywords: string[]) =>
    docTitles.some((title) => keywords.some((keyword) => title.includes(keyword.toUpperCase())));

  if (hasDoc(['Termo de Recebimento Definitivo', 'Despacho de Arquivamento'])) {
    return 'Encerrado/Arquivado';
  }

  if (hasDoc(['Nota de Empenho', 'Contrato Assinado', 'Ordem de Servico'])) {
    return 'Contratado';
  }

  if (hasDoc(['Termo de Adjudicacao', 'Termo de Homologacao', 'Termo de Adjudicacao/Homologacao', 'Ata de Realizacao do Pregao'])) {
    return 'Adjudicado/Homologado';
  }

  if (hasDoc(['Edital', 'Aviso de Licitacao'])) {
    return 'Fase Externa';
  }

  if (hasDoc(['Parecer Juridico', 'Minuta de Edital'])) {
    return 'Analise de Legalidade';
  }

  if (hasDoc(['Pesquisa de Precos', 'Mapa Comparativo'])) {
    return 'Composicao de Precos';
  }

  return 'Planejamento da Contratacao';
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Processo Nao Aberto':
      return 'bg-slate-100 text-slate-500';
    case 'Aguardando Sincronizacao SIPAC':
      return 'bg-sky-50 text-sky-700';
    case 'Sincronizacao Parcial':
      return 'bg-cyan-50 text-cyan-700';
    case 'Planejamento da Contratacao':
      return 'bg-blue-50 text-blue-600';
    case 'Composicao de Precos':
      return 'bg-indigo-50 text-indigo-600';
    case 'Analise de Legalidade':
      return 'bg-purple-50 text-purple-600';
    case 'Fase Externa':
      return 'bg-amber-50 text-amber-600';
    case 'Licitacao Suspensa/Sob Analise':
      return 'bg-red-50 text-red-600';
    case 'Adjudicado/Homologado':
      return 'bg-teal-50 text-teal-600';
    case 'Contratado':
      return 'bg-emerald-100 text-emerald-700';
    case 'Encerrado/Arquivado':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const parseDate = (dateStr: string, timeStr: string = '00:00'): Date => {
  if (!dateStr || typeof dateStr !== 'string') return new Date();

  const cleanDate = dateStr.trim();
  const cleanTime = (timeStr || '00:00').trim();

  const [day, month, year] = cleanDate.split('/').map(Number);
  const [hour, minute] = cleanTime.split(':').map(Number);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date();

  return new Date(year, month - 1, day, hour || 0, minute || 0);
};

export interface ProcessMetrics {
  leadTime: number;
  reworkCount: number;
  bottlenecks: { unit: string; days: number }[];
  path: string[];
}

export const calculateProcessMetrics = (process: SIPACProcess | undefined | null): ProcessMetrics | null => {
  if (!process || !process.movimentacoes || process.movimentacoes.length === 0) {
    return null;
  }

  const movs = [...process.movimentacoes].sort((a, b) => {
    const dateA = parseDate(a.data, a.horario).getTime();
    const dateB = parseDate(b.data, b.horario).getTime();
    return dateA - dateB;
  });

  const startDate = parseDate(movs[0].data, movs[0].horario);
  const lastMov = movs[movs.length - 1];
  const endDate = parseDate(lastMov.data, lastMov.horario);
  const diffTime = Math.max(0, endDate.getTime() - startDate.getTime());
  const leadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const unitStayTimes: Record<string, number> = {};
  const unitVisits: Record<string, number> = {};
  const path: string[] = [];

  for (let i = 0; i < movs.length; i += 1) {
    const currentMov = movs[i];
    const unit = currentMov.unidadeOrigem;
    path.push(unit);
    unitVisits[unit] = (unitVisits[unit] || 0) + 1;

    if (i < movs.length - 1) {
      const nextMov = movs[i + 1];
      const entryTime = parseDate(currentMov.data, currentMov.horario);
      const exitTime = parseDate(nextMov.data, nextMov.horario);
      const destinationUnit = currentMov.unidadeDestino;
      const timeInUnit = Math.max(0, (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60 * 24));

      if (unitStayTimes[destinationUnit]) {
        unitStayTimes[destinationUnit] += timeInUnit;
      } else {
        unitStayTimes[destinationUnit] = timeInUnit;
      }
    }
  }

  let reworkCount = 0;
  Object.values(unitVisits).forEach((visits) => {
    if (visits > 1) reworkCount += visits - 1;
  });

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

  items.forEach((item) => {
    if (!item.dadosSIPAC || !item.dadosSIPAC.movimentacoes) return;

    const movs = [...item.dadosSIPAC.movimentacoes].reverse();
    movs.forEach((movement) => {
      const source = movement.unidadeOrigem;
      const target = movement.unidadeDestino;

      if (!source || !target || source === target) return;

      if (!nodes.includes(source)) nodes.push(source);
      if (!nodes.includes(target)) nodes.push(target);

      const key = `${source}|${target}`;
      linksMap[key] = (linksMap[key] || 0) + 1;
    });
  });

  const sankeyNodes = nodes.map((name) => ({ name }));
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
