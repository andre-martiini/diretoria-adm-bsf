
import { db } from '../firebase';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy
} from 'firebase/firestore';
import { BudgetElement, BudgetRecord } from '../types';

const budgetCache: Record<string, { elements: BudgetElement[], records: BudgetRecord[] }> = {};

export const fetchBudgetTransparencyData = async (year: string) => {
    if (budgetCache[year]) return budgetCache[year];

    const yearNum = Number(year);

    // Fetch in parallel
    const [snapElements, snapRecords] = await Promise.all([
        getDocs(query(collection(db, "budget_elements"), where("ano", "==", yearNum))),
        getDocs(query(collection(db, "budget_records"), where("ano", "==", yearNum)))
    ]);

    const elements = snapElements.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetElement));
    const records = snapRecords.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetRecord));

    const result = { elements, records };
    budgetCache[year] = result;
    return result;
};
