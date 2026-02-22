import { Process, Item, Quote } from './types';

const STORAGE_KEY = 'gestao_clc_mapa_precos_v1';

function getDB() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return { processes: [], items: [], quotes: [] };
  return JSON.parse(data);
}

function saveDB(data: any) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getNextId(collection: { id: number }[]): number {
  return collection.length > 0 ? Math.max(...collection.map(i => i.id)) + 1 : 1;
}

export const storage = {
  // Processes
  async getProcesses(): Promise<Process[]> {
    const db = getDB();
    const rows = [...db.processes].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return rows;
  },

  async getProcess(id: number): Promise<Process> {
    const db = getDB();
    const p = db.processes.find((x: any) => x.id === id);
    if (!p) throw new Error('Not found');
    return p;
  },

  async createProcess(process: { process_number: string, object: string }): Promise<{ id: number }> {
    const db = getDB();
    const newP = {
      id: getNextId(db.processes),
      process_number: process.process_number,
      object: process.object,
      created_at: new Date().toISOString()
    };
    db.processes.push(newP);
    saveDB(db);
    return { id: newP.id };
  },

  async updateProcess(id: number, process: { process_number: string, object: string }): Promise<void> {
    const db = getDB();
    const idx = db.processes.findIndex((p: any) => p.id === id);
    if (idx !== -1) {
      db.processes[idx] = { ...db.processes[idx], ...process };
      saveDB(db);
    }
  },

  async deleteProcess(id: number): Promise<void> {
    const db = getDB();
    db.processes = db.processes.filter((p: any) => p.id !== id);
    const itemIds = db.items.filter((i: any) => i.process_id === id).map((i: any) => i.id);
    db.items = db.items.filter((i: any) => i.process_id !== id);
    db.quotes = db.quotes.filter((q: any) => !itemIds.includes(q.item_id));
    saveDB(db);
  },

  // Items
  async getItems(processId: number): Promise<Item[]> {
    const db = getDB();
    return db.items
      .filter((i: any) => i.process_id === processId)
      .sort((a: any, b: any) => a.item_number - b.item_number);
  },

  async createItem(processId: number, item: Omit<Item, 'id' | 'process_id'>): Promise<{ id: number }> {
    const db = getDB();
    const newI = {
      id: getNextId(db.items),
      process_id: processId,
      ...item,
      pricing_strategy: item.pricing_strategy || 'sanitized'
    };
    db.items.push(newI);
    saveDB(db);
    return { id: newI.id as number };
  },

  async updateItem(id: number, item: Omit<Item, 'id' | 'process_id'>): Promise<void> {
    const db = getDB();
    const idx = db.items.findIndex((x: any) => x.id === id);
    if (idx !== -1) {
      db.items[idx] = { ...db.items[idx], ...item };
      saveDB(db);
    }
  },

  async deleteItem(id: number): Promise<void> {
    const db = getDB();
    db.items = db.items.filter((x: any) => x.id !== id);
    db.quotes = db.quotes.filter((q: any) => q.item_id !== id);
    saveDB(db);
  },

  // Quotes
  async getQuotes(itemId: number): Promise<Quote[]> {
    const db = getDB();
    return db.quotes
      .filter((q: any) => q.item_id === itemId)
      .sort((a: any, b: any) => new Date(b.quote_date).getTime() - new Date(a.quote_date).getTime());
  },

  async createQuote(itemId: number, quote: Omit<Quote, 'id' | 'item_id'>): Promise<{ id: number }> {
    const db = getDB();
    const newQ = {
      id: getNextId(db.quotes),
      item_id: itemId,
      ...quote,
      quote_type: quote.quote_type || 'private',
      is_outlier: false
    };
    db.quotes.push(newQ);
    saveDB(db);
    return { id: newQ.id as number };
  },

  async updateQuote(id: number, quote: Omit<Quote, 'id' | 'item_id'>): Promise<void> {
    const db = getDB();
    const idx = db.quotes.findIndex((q: any) => q.id === id);
    if (idx !== -1) {
      db.quotes[idx] = { ...db.quotes[idx], ...quote };
      saveDB(db);
    }
  },

  async deleteQuote(id: number): Promise<void> {
    const db = getDB();
    db.quotes = db.quotes.filter((q: any) => q.id !== id);
    saveDB(db);
  },

  async batchCreateItems(processId: number, items: any[]): Promise<void> {
    const db = getDB();
    let nextId = getNextId(db.items);
    const newItems = items.map(item => ({
      id: nextId++,
      process_id: processId,
      item_number: item.item_number,
      specification: item.specification,
      unit: item.unit,
      quantity: item.quantity,
      pricing_strategy: item.pricing_strategy || 'sanitized'
    }));
    db.items.push(...newItems);
    saveDB(db);
  },

  async batchCreateQuotes(itemId: number, quotes: any[]): Promise<void> {
    const db = getDB();
    let nextId = getNextId(db.quotes);
    const newQuotes = quotes.map(quote => ({
      id: nextId++,
      item_id: itemId,
      source: quote.source,
      quote_date: quote.quote_date,
      unit_price: quote.unit_price,
      quote_type: quote.quote_type || 'private',
      is_outlier: false
    }));
    db.quotes.push(...newQuotes);
    saveDB(db);
  },

  // History
  async getHistory(): Promise<(Item & { process_number: string, object: string, created_at?: string })[]> {
    const db = getDB();
    return db.items.map((item: any) => {
      const process = db.processes.find((p: any) => p.id === item.process_id);
      return {
        ...item,
        process_number: process?.process_number,
        object: process?.object,
        created_at: process?.created_at
      };
    }).sort((a: any, b: any) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }
};
