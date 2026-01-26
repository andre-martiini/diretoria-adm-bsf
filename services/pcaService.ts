
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

export const fetchLocalPcaSnapshot = async (year: string): Promise<ContractItem[]> => {
    const api_url = `/data/pca_${year}.json?t=${Date.now()}`;
    try {
        const response = await fetch(api_url);
        if (response.ok) {
            const jsonData = await response.json();
            const raw = jsonData.data || (Array.isArray(jsonData) ? jsonData : []);
            return raw.map((item: any, index: number) => {
                const officialId = String(item.id || item.numeroItem || index);
                const pncpCategory = String(item.categoriaItemPcaNome || item.nomeClassificacao || '').toLowerCase();
                let categoria = Category.Bens;
                if (pncpCategory.includes('serviç') || pncpCategory.includes('obra')) {
                    categoria = Category.Servicos;
                } else if (pncpCategory.includes('tic') || pncpCategory.includes('tecnologia')) {
                    categoria = Category.TIC;
                }
                return {
                    id: officialId,
                    titulo: item.descricao || item.grupoContratacaoNome || "Item do Plano de Contratação",
                    categoria: categoria,
                    valor: Number(item.valorTotal || (Number(item.valorUnitario || 0) * Number(item.quantidade || 0)) || 0),
                    valorExecutado: 0,
                    inicio: item.dataDesejada || new Date().toISOString().split('T')[0],
                    fim: item.dataFim || '',
                    area: item.nomeUnidade || "IFES - BSF",
                    isManual: false,
                    ano: String(year)
                };
            });
        }
    } catch (e) {
        console.warn("[PCA Service] Erro no snapshot local:", e);
    }
    return [];
};

export const fetchPcaData = async (
    year: string,
    forceSync: boolean = false,
    skipSync: boolean = false,
    onProgress?: (progress: number) => void
) => {
    const report = (p: number) => onProgress?.(Math.min(p, 100));

    // 1. In-memory Cache (Fastest)
    if (!forceSync && inMemoryCache[year]) {
        console.log(`[PCA Service] Retornando cache em memória para ${year}`);
        report(100);
        return inMemoryCache[year];
    }

    console.log(`[PCA Service] 🚀 Iniciando carregamento para ${year} (Force: ${forceSync})`);
    report(5);

    const yearNum = Number(year);
    const cacheRef = doc(db, "pca_cache", year);
    const itemsQuery = query(collection(db, "pca_data"), where("ano", "in", [year, yearNum]));

    let rawOfficialItems: any[] = [];
    let firestoreManualItems: ContractItem[] = [];
    let firestoreDataUpdates: Record<string, any> = {};
    let cacheMetadata: any = null;

    // 2. Helper para Carregamento Local (Prioridade de Velocidade)
    const tryLocalJson = async () => {
        const api_url = `/data/pca_${year}.json?t=${Date.now()}`;
        try {
            const response = await fetch(api_url);
            if (response.ok) {
                const jsonData = await response.json();
                return jsonData.data || (Array.isArray(jsonData) ? jsonData : []);
            }
        } catch (e) {
            console.warn("[PCA Service] JSON local não encontrado:", api_url);
        }
        return [];
    };

    // 3. Tentar carregar Snapshot Local PRIMEIRO (para não travar a tela)
    report(10);
    rawOfficialItems = await tryLocalJson();
    console.log(`[PCA Service] Snapshot local carregado: ${rawOfficialItems.length} itens.`);

    // 4. Se não estiver forçando sincronização com a PNCP, buscar atualizações no Firestore (Manual + Cache)
    try {
        report(20);

        // Timeout de 2 segundos para o Firestore para não travar a experiência do usuário
        const firestorePromise = Promise.all([
            getDoc(cacheRef).catch(() => null),
            getDocs(itemsQuery).catch(() => null)
        ]);

        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));

        const results = await Promise.race([firestorePromise, timeoutPromise]);

        if (results) {
            const [cacheSnap, suppSnap] = results;

            if (cacheSnap?.exists()) {
                cacheMetadata = cacheSnap.data();
                // Se o cache do Firestore for mais novo ou se o local falhou, usamos ele
                if (cacheMetadata.items && (rawOfficialItems.length === 0 || forceSync)) {
                    rawOfficialItems = cacheMetadata.items;
                    console.log(`[PCA Service] Usando cache do Firestore (${rawOfficialItems.length} itens)`);
                }
            }

            if (suppSnap) {
                suppSnap.forEach((doc) => {
                    const d = doc.data();
                    if (d.isManual) {
                        firestoreManualItems.push({
                            id: doc.id,
                            titulo: d.titulo || "Item Manual",
                            categoria: d.categoria,
                            valor: Number(d.valor || 0),
                            valorExecutado: Number(d.valorExecutado || 0),
                            inicio: d.inicio || new Date().toISOString(),
                            area: d.area || "Manual",
                            isManual: true,
                            ano: String(year)
                        } as any);
                    } else {
                        firestoreDataUpdates[String(d.officialId)] = d;
                    }
                });
                console.log(`[PCA Service] ${firestoreManualItems.length} itens manuais e ${Object.keys(firestoreDataUpdates).length} atualizações oficiais encontradas.`);
            }
        }
    } catch (fsErr) {
        console.error("[PCA Service] Erro ao carregar dados do Firestore:", fsErr);
    }

    // 5. LIVE SYNC (Somente se explicitamente solicitado ou se tudo estiver vazio)
    const shouldSyncNow = forceSync || (rawOfficialItems.length === 0 && !skipSync);
    if (shouldSyncNow) {
        try {
            console.log(`[PCA Service] 📡 Realizando Sincronização LIVE com PNCP...`);
            const seq = PCA_YEARS_MAP[year] || '12';
            const pageSize = 100;
            const firstUrl = `${LOCAL_API_SERVER}/api/pncp/pca/${CNPJ_IFES_BSF}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=1`;
            const firstRes = await fetch(firstUrl);

            if (firstRes.ok) {
                const firstData = await firstRes.json();
                rawOfficialItems = firstData.data || (Array.isArray(firstData) ? firstData : []);
                const totalPages = firstData.totalPaginas || 1;

                for (let p = 2; p <= totalPages; p++) {
                    const res = await fetch(`${LOCAL_API_SERVER}/api/pncp/pca/${CNPJ_IFES_BSF}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=${p}`);
                    if (res.ok) {
                        const pageData = await res.json();
                        rawOfficialItems = [...rawOfficialItems, ...(pageData.data || [])];
                        report(30 + (p / totalPages) * 50);
                    }
                }

                // Salva no Firestore para as próximas vezes
                setDoc(cacheRef, {
                    items: rawOfficialItems,
                    updatedAt: Timestamp.now(),
                    count: rawOfficialItems.length
                }).catch(e => console.error("Erro cache:", e));
            }
        } catch (syncErr) {
            console.error("[PCA Service] Falha na sincronização LIVE:", syncErr);
        }
    }

    report(90);

    // 6. Mapeamento Final e Unificação
    const mappedOfficial = rawOfficialItems.map((item: any, index: number) => {
        const officialId = String(item.id || item.numeroItem || index);
        const pncpCategory = String(item.categoriaItemPcaNome || item.nomeClassificacao || '').toLowerCase();

        let categoria = Category.Bens;
        if (pncpCategory.includes('serviç') || pncpCategory.includes('obra')) {
            categoria = Category.Servicos;
        } else if (pncpCategory.includes('tic') || pncpCategory.includes('tecnologia')) {
            categoria = Category.TIC;
        }

        const valor = Number(item.valorTotal || (Number(item.valorUnitario || 0) * Number(item.quantidade || 0)) || 0);
        const extra = firestoreDataUpdates[officialId] || {};

        return {
            id: officialId,
            titulo: item.descricao || item.grupoContratacaoNome || "Item do Plano de Contratação",
            categoria: categoria,
            valor: valor,
            valorExecutado: Number(extra.valorExecutado || 0),
            inicio: item.dataDesejada || new Date().toISOString().split('T')[0],
            fim: item.dataFim || '',
            area: item.nomeUnidade || "IFES - BSF",
            isManual: false,
            ano: String(year)
        };
    });

    const finalData = [...mappedOfficial, ...firestoreManualItems];

    let lastSyncStr = cacheMetadata?.updatedAt
        ? cacheMetadata.updatedAt.toDate().toLocaleString('pt-BR')
        : `Snapshot Local (${new Date().toLocaleDateString('pt-BR')})`;

    let pcaMeta = null;
    if (rawOfficialItems.length > 0) {
        const first = rawOfficialItems[0];
        pcaMeta = {
            id: `${first.cnpj || CNPJ_IFES_BSF}-0-${String(first.sequencialPca || '12').padStart(6, '0')}/${first.anoPca || year}`,
            dataPublicacao: first.dataPublicacaoPncp || first.dataInclusao
        };
    }

    const result = {
        data: finalData,
        lastSync: lastSyncStr,
        pcaMeta
    };

    // Atualiza cache em memória
    inMemoryCache[year] = result;

    console.log(`[PCA Service] ✅ Carregamento finalizado para ${year}. Total: ${finalData.length} itens.`);
    report(100);

    return result;
};
