import { db } from './db';
import { parseFile } from './parser';
import MiniSearch from 'minisearch';

const STOP_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'para', 'com', 'em', 'na', 'no', 'ou', 'e', 'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'por']);

const LOCAL_URLS = {
  catser: '/data/Lista_CATSER_CORRIGIDA.xlsx',
  catmat: '/data/Lista_CATMAT.xlsx'
};

let memIndexes: Record<string, MiniSearch | null> = {
  catser: null,
  catmat: null
};

let memCatalogs: Record<string, any[]> = {
  catser: [],
  catmat: []
};

let memCatalogsMap: Record<string, Map<string, any>> = {
  catser: new Map(),
  catmat: new Map()
};

const normalize = (text: string) => 
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const loadAndProcess = async (type: 'catser' | 'catmat') => {
  const url = LOCAL_URLS[type];
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao ler arquivo local (${response.status})`);

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const isMat = type === 'catmat';
    const data = parseFile(buffer, isMat);

    if (data && data.length > 0) {
      // Sort
      const sortedData = [...data].sort((a, b) => {
        const key = isMat ? 'codigoMaterial' : 'codigoServico';
        const valA = String(a[key] || '');
        const valB = String(b[key] || '');
        const numA = parseInt(valA, 10);
        const numB = parseInt(valB, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return valA.localeCompare(valB);
      });
      await db.saveCatalog(type, sortedData);
      return sortedData;
    }
    return [];
  } catch (err) {
    console.error(`Erro ao processar ${type}:`, err);
    return [];
  }
};

const initCatalog = async (type: 'catser' | 'catmat') => {
  if (memCatalogs[type].length > 0) return;

  let catalog = await db.getCatalog(type);
  if (!catalog || catalog.length === 0) {
    catalog = await loadAndProcess(type);
  }

  memCatalogs[type] = catalog || [];
  
  const idField = type === 'catmat' ? 'codigoMaterial' : 'codigoServico';
  const descField = type === 'catmat' ? 'descricaoMaterial' : 'descricaoServico';
  
  const map = new Map<string, any>();
  for (const item of memCatalogs[type]) {
    map.set(String(item[idField]), item);
  }
  memCatalogsMap[type] = map;

  const miniSearch = new MiniSearch({
    idField: idField,
    fields: [descField, 'classeDescricao', 'grupoDescricao'],
    storeFields: [idField, 'grupoDescricao'],
    searchOptions: {
      boost: { [descField]: 3, classeDescricao: 1, grupoDescricao: 1 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'OR'
    },
    tokenize: (string) => string.toLowerCase().split(/[\s\-]+/).filter(token => token.length > 2 && !STOP_WORDS.has(token)),
    processTerm: (term) => term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  });

  if (memCatalogs[type].length > 0) {
    miniSearch.addAll(memCatalogs[type]);
  }
  
  memIndexes[type] = miniSearch;
};

export const searchCatalog = async (query: string, type: 'CATMAT' | 'CATSER', topK: number = 30) => {
  const t = type.toLowerCase() as 'catmat' | 'catser';
  
  await initCatalog(t);
  
  const searchIndex = memIndexes[t];
  const map = memCatalogsMap[t];
  
  if (!searchIndex || !map) return [];

  // Similar logic as UI ranking
  const results = searchIndex.search({
    combineWith: 'OR',
    queries: [{
      queries: [query],
      boost: {
         [t === 'catmat' ? 'descricaoMaterial' : 'descricaoServico']: 15,
         classeDescricao: 5,
         grupoDescricao: 5
      }
    }]
  });

  const topResults = results.slice(0, topK);
  return topResults.map(res => map.get(String(res.id))).filter(Boolean);
};
