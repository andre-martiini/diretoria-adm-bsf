
import { db } from '../firebase';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    Timestamp
} from 'firebase/firestore';
import {
    ContractItem,
    Category
} from '../types';
import {
    CNPJ_IFES_BSF,
    PCA_YEARS_MAP,
    LOCAL_API_SERVER
} from '../constants';

// In-memory cache for the current session
const inMemoryCache: Record<string, {
    data: ContractItem[];
    lastSync: string | null;
    pcaMeta: { id: string, dataPublicacao: string } | null;
}> = {};

export const hasPcaInMemoryCache = (year: string) => !!inMemoryCache[year];

export const fetchPcaData = async (
    year: string,
    forceSync: boolean = false,
    skipSync: boolean = false,
    onProgress?: (progress: number) => void
) => {
    const report = (p: number) => onProgress?.(Math.min(p, 100));

    // 1. Return from in-memory cache if available and not forcing sync
    if (!forceSync && inMemoryCache[year]) {
        console.log(`[PCA Service] Returning in-memory cache for ${year}`);
        report(100);
        return inMemoryCache[year];
    }

    report(5); // Started
    console.log(`[PCA Service] Fetching data for ${year} (forceSync: ${forceSync})`);

    let officialItems: any[] = [];
    const cacheRef = doc(db, "pca_cache", year);
    const yearNum = Number(year);
    const itemsQuery = query(collection(db, "pca_data"), where("ano", "in", [year, yearNum]));

    const tryLocalJson = async () => {
        const api_url = `/data/pca_${year}.json`;
        try {
            const response = await fetch(api_url);
            if (response.ok) {
                const jsonData = await response.json();
                return jsonData.data || (Array.isArray(jsonData) ? jsonData : []);
            }
        } catch (e) {
            console.warn("JSON local não encontrado:", api_url);
        }
        return [];
    };

    report(10); // Checking local and cloud snapshots

    // Priority: 1. Firestore Cache | 2. Local JSON Snapshot (The "Midnight Photograph")
    const cacheSnap = await getDoc(cacheRef);
    const cacheData = cacheSnap.exists() ? cacheSnap.data() : null;

    if (cacheData && cacheData.items && !forceSync) {
        console.log(`[PCA Service] Using Firestore snapshot for ${year}`);
        officialItems = cacheData.items;
    } else if (!forceSync) {
        console.log(`[PCA Service] Firestore cache missing, trying local snapshot...`);
        officialItems = await tryLocalJson();
    }

    // Determine if we need to sync with PNCP (ONLY if forced or no data at all and not skipSync)
    const shouldSyncNow = forceSync || (officialItems.length === 0 && !skipSync);

    if (shouldSyncNow) {
        try {
            console.log(`[PCA Service] Performing LIVE sync with PNCP for ${year}...`);
            const seq = PCA_YEARS_MAP[year] || '12';
            const pageSize = 100;
            let currentPage = 1;
            let totalPages = 1;

            report(15);

            const firstUrl = `${LOCAL_API_SERVER}/api/pncp/pca/${CNPJ_IFES_BSF}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=${currentPage}`;
            const firstRes = await fetch(firstUrl);

            if (firstRes.ok) {
                const firstData = await firstRes.json();
                const initialItems = firstData.data || (Array.isArray(firstData) ? firstData : []);
                officialItems = [...initialItems];
                totalPages = firstData.totalPaginas || 1;

                report(30);

                for (currentPage = 2; currentPage <= totalPages; currentPage++) {
                    const url = `${LOCAL_API_SERVER}/api/pncp/pca/${CNPJ_IFES_BSF}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=${currentPage}`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const pageData = await res.json();
                        const items = pageData.data || (Array.isArray(pageData) ? pageData : []);
                        officialItems = [...officialItems, ...items];
                        report(30 + (currentPage / totalPages) * 45);
                    }
                }

                if (officialItems.length > 0) {
                    try {
                        await setDoc(cacheRef, {
                            items: officialItems,
                            updatedAt: Timestamp.now(),
                            count: officialItems.length
                        });
                        console.log(`[PCA Service] Firestore snapshot updated for ${year}`);
                    } catch (fsErr) {
                        console.error("[PCA Service] Error writing to Firestore cache:", fsErr);
                    }
                }
            } else {
                throw new Error(`API Proxy returned status ${firstRes.status}`);
            }
        } catch (syncErr) {
            console.error("[PCA Service] Erro no sync PNCP:", syncErr);
            report(70);
            if (!officialItems.length) {
                officialItems = await tryLocalJson();
            }
        }
    } else {
        report(75);
        console.log(`[PCA Service] Snapshots loaded successfully (No sync needed)`);
    }

    report(80); // Fetching supplemental data

    // Fetch supplemental/manual data
    const querySnapshot = await getDocs(itemsQuery);
    const firestoreData: Record<string, any> = {};
    const manualItems: ContractItem[] = [];

    querySnapshot.forEach((doc) => {
        const d = doc.data();
        if (d.isManual) {
            manualItems.push({
                id: doc.id,
                titulo: d.titulo,
                categoria: d.categoria,
                valor: d.valor,
                valorExecutado: d.valorExecutado || 0,
                inicio: d.inicio,
                fim: d.fim || '',
                area: d.area,
                isManual: true
            });
        } else {
            firestoreData[d.officialId] = d;
        }
    });

    report(90); // Mapping and Merge

    // Map and Merge
    const mappedOfficial = (Array.isArray(officialItems) ? officialItems : []).map((item: any, index: number) => {
        const officialId = String(item.id || index);
        const pncpCategory = item.categoriaItemPcaNome || '';
        let categoria = Category.Bens;

        if (pncpCategory.includes('Serviço') || pncpCategory.includes('Obra')) {
            categoria = Category.Servicos;
        } else if (pncpCategory.includes('TIC')) {
            categoria = Category.TIC;
        }

        const valor = item.valorTotal || (item.valorUnitario || 0) * (item.quantidade || 0);
        const extra = firestoreData[officialId] || {};

        return {
            id: officialId,
            titulo: item.descricao || item.grupoContratacaoNome || "Item sem descrição",
            categoria: categoria,
            valor: valor,
            valorExecutado: extra.valorExecutado || 0,
            inicio: item.dataDesejada || new Date().toISOString().split('T')[0],
            fim: item.dataFim || '',
            area: item.nomeUnidade || "Diretoria de Adm. e Planejamento",
            isManual: false
        };
    });

    const finalData = [...mappedOfficial, ...manualItems];

    // Determine the date of the photograph/snapshot
    let lastSyncStr = "Snapshot Recente";
    if (cacheData?.updatedAt) {
        lastSyncStr = cacheData.updatedAt.toDate().toLocaleString('pt-BR');
    } else {
        // Fallback for local JSON (we assume it's from the last 24h sync)
        lastSyncStr = `Snapshot Local (${new Date().toLocaleDateString('pt-BR')})`;
    }

    let pcaMeta = null;
    if (officialItems.length > 0) {
        const firstItem = officialItems[0];
        pcaMeta = {
            id: `${firstItem.cnpj || CNPJ_IFES_BSF}-0-${String(firstItem.sequencialPca || '12').padStart(6, '0')}/${firstItem.anoPca || year}`,
            dataPublicacao: firstItem.dataPublicacaoPncp || firstItem.dataInclusao
        };
    }

    // Update in-memory cache
    inMemoryCache[year] = {
        data: finalData,
        lastSync: lastSyncStr,
        pcaMeta
    };

    report(100); // Done
    return inMemoryCache[year];
};
