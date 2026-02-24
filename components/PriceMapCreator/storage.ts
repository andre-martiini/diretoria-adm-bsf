import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Process, Item, Quote } from './types';

const STORAGE_KEY = 'gestao_clc_mapa_precos_v1';
const COLLECTIONS = {
  processes: 'price_map_processes',
  items: 'price_map_items',
  quotes: 'price_map_quotes'
};

type LocalDB = {
  processes: Process[];
  items: Item[];
  quotes: Quote[];
};

function getLocalDB(): LocalDB {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return { processes: [], items: [], quotes: [] };
  return JSON.parse(data);
}

function saveLocalDB(data: LocalDB) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getNextId(collectionRows: { id: number }[]): number {
  return collectionRows.length > 0 ? Math.max(...collectionRows.map(i => i.id)) + 1 : 1;
}

const useFirestore = () => !!db;

async function getAllProcessesRemote(): Promise<Process[]> {
  const snap = await getDocs(collection(db!, COLLECTIONS.processes));
  return snap.docs
    .map(d => d.data() as Process)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function getAllItemsRemote(): Promise<Item[]> {
  const snap = await getDocs(collection(db!, COLLECTIONS.items));
  return snap.docs.map(d => d.data() as Item);
}

async function getAllQuotesRemote(): Promise<Quote[]> {
  const snap = await getDocs(collection(db!, COLLECTIONS.quotes));
  return snap.docs.map(d => d.data() as Quote);
}

async function getNextIdRemote(collectionName: string): Promise<number> {
  const snap = await getDocs(collection(db!, collectionName));
  let maxId = 0;
  snap.forEach(row => {
    const value = Number(row.data()?.id || 0);
    if (value > maxId) maxId = value;
  });
  return maxId + 1;
}

async function getProcessByIdRemote(id: number): Promise<Process> {
  const q = query(collection(db!, COLLECTIONS.processes), where('id', '==', id));
  const snap = await getDocs(q);
  const first = snap.docs[0];
  if (!first) throw new Error('Not found');
  return first.data() as Process;
}

async function deleteByNumericId(collectionName: string, id: number): Promise<void> {
  await deleteDoc(doc(db!, collectionName, String(id)));
}

export const storage = {
  async getProcesses(): Promise<Process[]> {
    if (useFirestore()) return getAllProcessesRemote();

    const local = getLocalDB();
    return [...local.processes].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  async getProcess(id: number): Promise<Process> {
    if (useFirestore()) return getProcessByIdRemote(id);

    const local = getLocalDB();
    const p = local.processes.find(x => x.id === id);
    if (!p) throw new Error('Not found');
    return p;
  },

  async createProcess(process: { process_number: string, object: string }): Promise<{ id: number }> {
    if (useFirestore()) {
      const id = await getNextIdRemote(COLLECTIONS.processes);
      const payload: Process = {
        id,
        process_number: process.process_number,
        object: process.object,
        created_at: new Date().toISOString()
      };
      await setDoc(doc(db!, COLLECTIONS.processes, String(id)), payload);
      return { id };
    }

    const local = getLocalDB();
    const newP: Process = {
      id: getNextId(local.processes),
      process_number: process.process_number,
      object: process.object,
      created_at: new Date().toISOString()
    };
    local.processes.push(newP);
    saveLocalDB(local);
    return { id: newP.id };
  },

  async updateProcess(id: number, process: { process_number: string, object: string }): Promise<void> {
    if (useFirestore()) {
      await updateDoc(doc(db!, COLLECTIONS.processes, String(id)), process);
      return;
    }

    const local = getLocalDB();
    const idx = local.processes.findIndex(p => p.id === id);
    if (idx !== -1) {
      local.processes[idx] = { ...local.processes[idx], ...process };
      saveLocalDB(local);
    }
  },

  async deleteProcess(id: number): Promise<void> {
    if (useFirestore()) {
      const itemsQuery = query(collection(db!, COLLECTIONS.items), where('process_id', '==', id));
      const itemsSnap = await getDocs(itemsQuery);
      const itemIds = itemsSnap.docs.map(d => Number(d.data().id));

      const batch = writeBatch(db!);
      batch.delete(doc(db!, COLLECTIONS.processes, String(id)));
      itemsSnap.docs.forEach(itemDoc => batch.delete(itemDoc.ref));

      if (itemIds.length > 0) {
        const quotesSnap = await getDocs(collection(db!, COLLECTIONS.quotes));
        quotesSnap.docs.forEach(quoteDoc => {
          if (itemIds.includes(Number(quoteDoc.data().item_id))) {
            batch.delete(quoteDoc.ref);
          }
        });
      }

      await batch.commit();
      return;
    }

    const local = getLocalDB();
    local.processes = local.processes.filter(p => p.id !== id);
    const itemIds = local.items.filter(i => i.process_id === id).map(i => i.id);
    local.items = local.items.filter(i => i.process_id !== id);
    local.quotes = local.quotes.filter(q => !itemIds.includes(q.item_id));
    saveLocalDB(local);
  },

  async getItems(processId: number): Promise<Item[]> {
    if (useFirestore()) {
      const q = query(collection(db!, COLLECTIONS.items), where('process_id', '==', processId));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => d.data() as Item)
        .sort((a, b) => a.item_number - b.item_number);
    }

    const local = getLocalDB();
    return local.items
      .filter(i => i.process_id === processId)
      .sort((a, b) => a.item_number - b.item_number);
  },

  async createItem(processId: number, item: Omit<Item, 'id' | 'process_id'>): Promise<{ id: number }> {
    if (useFirestore()) {
      const id = await getNextIdRemote(COLLECTIONS.items);
      const payload: Item = {
        id,
        process_id: processId,
        item_number: item.item_number,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        pricing_strategy: item.pricing_strategy || 'sanitized'
      };
      await setDoc(doc(db!, COLLECTIONS.items, String(id)), payload);
      return { id };
    }

    const local = getLocalDB();
    const newI: Item = {
      id: getNextId(local.items),
      process_id: processId,
      item_number: item.item_number,
      specification: item.specification,
      unit: item.unit,
      quantity: item.quantity,
      pricing_strategy: item.pricing_strategy || 'sanitized'
    };
    local.items.push(newI);
    saveLocalDB(local);
    return { id: newI.id };
  },

  async updateItem(id: number, item: Omit<Item, 'id' | 'process_id'>): Promise<void> {
    if (useFirestore()) {
      await updateDoc(doc(db!, COLLECTIONS.items, String(id)), item);
      return;
    }

    const local = getLocalDB();
    const idx = local.items.findIndex(x => x.id === id);
    if (idx !== -1) {
      local.items[idx] = { ...local.items[idx], ...item };
      saveLocalDB(local);
    }
  },

  async deleteItem(id: number): Promise<void> {
    if (useFirestore()) {
      const batch = writeBatch(db!);
      batch.delete(doc(db!, COLLECTIONS.items, String(id)));

      const quotesSnap = await getDocs(query(collection(db!, COLLECTIONS.quotes), where('item_id', '==', id)));
      quotesSnap.docs.forEach(qd => batch.delete(qd.ref));
      await batch.commit();
      return;
    }

    const local = getLocalDB();
    local.items = local.items.filter(x => x.id !== id);
    local.quotes = local.quotes.filter(q => q.item_id !== id);
    saveLocalDB(local);
  },

  async getQuotes(itemId: number): Promise<Quote[]> {
    if (useFirestore()) {
      const q = query(collection(db!, COLLECTIONS.quotes), where('item_id', '==', itemId));
      const snap = await getDocs(q);
      return snap.docs
        .map(d => d.data() as Quote)
        .sort((a, b) => new Date(b.quote_date).getTime() - new Date(a.quote_date).getTime());
    }

    const local = getLocalDB();
    return local.quotes
      .filter(q => q.item_id === itemId)
      .sort((a, b) => new Date(b.quote_date).getTime() - new Date(a.quote_date).getTime());
  },

  async createQuote(itemId: number, quote: Omit<Quote, 'id' | 'item_id'>): Promise<{ id: number }> {
    if (useFirestore()) {
      const id = await getNextIdRemote(COLLECTIONS.quotes);
      const payload: Quote = {
        id,
        item_id: itemId,
        source: quote.source,
        quote_date: quote.quote_date,
        unit_price: quote.unit_price,
        quote_type: quote.quote_type || 'private',
        is_outlier: false
      };
      await setDoc(doc(db!, COLLECTIONS.quotes, String(id)), payload);
      return { id };
    }

    const local = getLocalDB();
    const newQ: Quote = {
      id: getNextId(local.quotes),
      item_id: itemId,
      source: quote.source,
      quote_date: quote.quote_date,
      unit_price: quote.unit_price,
      quote_type: quote.quote_type || 'private',
      is_outlier: false
    };
    local.quotes.push(newQ);
    saveLocalDB(local);
    return { id: newQ.id };
  },

  async updateQuote(id: number, quote: Omit<Quote, 'id' | 'item_id'>): Promise<void> {
    if (useFirestore()) {
      await updateDoc(doc(db!, COLLECTIONS.quotes, String(id)), quote);
      return;
    }

    const local = getLocalDB();
    const idx = local.quotes.findIndex(q => q.id === id);
    if (idx !== -1) {
      local.quotes[idx] = { ...local.quotes[idx], ...quote };
      saveLocalDB(local);
    }
  },

  async deleteQuote(id: number): Promise<void> {
    if (useFirestore()) {
      await deleteByNumericId(COLLECTIONS.quotes, id);
      return;
    }

    const local = getLocalDB();
    local.quotes = local.quotes.filter(q => q.id !== id);
    saveLocalDB(local);
  },

  async batchCreateItems(processId: number, items: any[]): Promise<void> {
    if (useFirestore()) {
      const batch = writeBatch(db!);
      let nextId = await getNextIdRemote(COLLECTIONS.items);
      items.forEach(item => {
        const payload: Item = {
          id: nextId,
          process_id: processId,
          item_number: item.item_number,
          specification: item.specification,
          unit: item.unit,
          quantity: item.quantity,
          pricing_strategy: item.pricing_strategy || 'sanitized'
        };
        batch.set(doc(db!, COLLECTIONS.items, String(nextId)), payload);
        nextId += 1;
      });
      await batch.commit();
      return;
    }

    const local = getLocalDB();
    let nextId = getNextId(local.items);
    const newItems: Item[] = items.map(item => ({
      id: nextId++,
      process_id: processId,
      item_number: item.item_number,
      specification: item.specification,
      unit: item.unit,
      quantity: item.quantity,
      pricing_strategy: item.pricing_strategy || 'sanitized'
    }));
    local.items.push(...newItems);
    saveLocalDB(local);
  },

  async batchCreateQuotes(itemId: number, quotes: any[]): Promise<void> {
    if (useFirestore()) {
      const batch = writeBatch(db!);
      let nextId = await getNextIdRemote(COLLECTIONS.quotes);
      quotes.forEach(quote => {
        const payload: Quote = {
          id: nextId,
          item_id: itemId,
          source: quote.source,
          quote_date: quote.quote_date,
          unit_price: quote.unit_price,
          quote_type: quote.quote_type || 'private',
          is_outlier: false
        };
        batch.set(doc(db!, COLLECTIONS.quotes, String(nextId)), payload);
        nextId += 1;
      });
      await batch.commit();
      return;
    }

    const local = getLocalDB();
    let nextId = getNextId(local.quotes);
    const newQuotes: Quote[] = quotes.map(quote => ({
      id: nextId++,
      item_id: itemId,
      source: quote.source,
      quote_date: quote.quote_date,
      unit_price: quote.unit_price,
      quote_type: quote.quote_type || 'private',
      is_outlier: false
    }));
    local.quotes.push(...newQuotes);
    saveLocalDB(local);
  },

  async getHistory(): Promise<(Item & { process_number: string, object: string, created_at?: string })[]> {
    if (useFirestore()) {
      const [processes, items] = await Promise.all([getAllProcessesRemote(), getAllItemsRemote()]);
      const processById = new Map<number, Process>(processes.map(p => [p.id, p]));
      return items
        .map(item => {
          const process = processById.get(item.process_id);
          return {
            ...item,
            process_number: process?.process_number || '',
            object: process?.object || '',
            created_at: process?.created_at
          };
        })
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    const local = getLocalDB();
    return local.items
      .map(item => {
        const process = local.processes.find(p => p.id === item.process_id);
        return {
          ...item,
          process_number: process?.process_number || '',
          object: process?.object || '',
          created_at: process?.created_at
        };
      })
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }
};
