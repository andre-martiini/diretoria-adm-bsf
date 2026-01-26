
import { db } from '../firebase';
import {
    collection,
    query,
    where,
    getDocs,
    orderBy
} from 'firebase/firestore';
import { BudgetElement, BudgetRecord } from '../types';

export const fetchBudgetTransparencyData = async (year: string) => {
    const yearNum = Number(year);

    // Fetch elements
    const qElements = query(
        collection(db, "budget_elements"),
        where("ano", "==", yearNum)
    );
    const snapElements = await getDocs(qElements);
    const elements = snapElements.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetElement));

    // Fetch records
    const qRecords = query(
        collection(db, "budget_records"),
        where("ano", "==", yearNum)
    );
    const snapRecords = await getDocs(qRecords);
    const records = snapRecords.docs.map(doc => ({ id: doc.id, ...doc.data() } as BudgetRecord));

    return { elements, records };
};
