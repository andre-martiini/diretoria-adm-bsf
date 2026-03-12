
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
    Category,
    GovProcessRegistryEntry,
    PCAMetadata
} from '../types';
import {
    CNPJ_IFES_BSF,
    PCA_YEARS_MAP,
    API_SERVER_URL
} from '../constants';
import { fetchSystemConfig } from './configService';

// In-memory cache for the current session
const inMemoryCache: Record<string, {
    data: ContractItem[];
    lastSync: string | null;
    pcaMeta: { id: string, dataPublicacao: string } | null;
}> = {};

let govProcessRegistryCache: {
    loadedAt: number;
    lookup: Map<string, GovProcessRegistryEntry>;
} | null = null;

export const hasPcaInMemoryCache = (year: string) => !!inMemoryCache[year];

const DEFAULT_FETCH_TIMEOUT_MS = 8000;

const normalizeProcessNumber = (processNumber: string | undefined | null): string => {
    if (!processNumber) return '';
    return processNumber.replace(/[\.\/\-\s]/g, '');
};

const GOV_PROCESS_REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;
const GOV_PROCESS_REGISTRY_ERROR_CACHE_TTL_MS = 30 * 1000;

const fetchWithTimeout = async (input: string, init?: RequestInit, timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal
        });
    } finally {
        window.clearTimeout(timeoutId);
    }
};

const isAbortError = (error: unknown) =>
    error instanceof DOMException
        ? error.name === 'AbortError'
        : (error as { name?: string } | null | undefined)?.name === 'AbortError';

const fetchGovProcessRegistryLookup = async (forceRefresh: boolean = false): Promise<Map<string, GovProcessRegistryEntry>> => {
    if (!forceRefresh && govProcessRegistryCache && (Date.now() - govProcessRegistryCache.loadedAt) < GOV_PROCESS_REGISTRY_CACHE_TTL_MS) {
        return govProcessRegistryCache.lookup;
    }

    try {
        const response = await fetchWithTimeout(`${API_SERVER_URL}/api/gov-process-registry`, undefined, 5000);
        if (!response.ok) throw new Error('Falha ao carregar registro de processos governamentais.');
        const payload = await response.json();
        const entries = Array.isArray(payload?.data) ? payload.data : [];
        const lookup = new Map<string, GovProcessRegistryEntry>();

        entries.forEach((entry: GovProcessRegistryEntry) => {
            const key = normalizeProcessNumber(entry?.numeroProcesso || entry?.processKey);
            if (key) lookup.set(key, entry);
        });

        govProcessRegistryCache = {
            loadedAt: Date.now(),
            lookup
        };

        return lookup;
    } catch (error) {
        const fallbackLookup = govProcessRegistryCache?.lookup || new Map<string, GovProcessRegistryEntry>();
        govProcessRegistryCache = {
            loadedAt: Date.now() - GOV_PROCESS_REGISTRY_CACHE_TTL_MS + GOV_PROCESS_REGISTRY_ERROR_CACHE_TTL_MS,
            lookup: fallbackLookup
        };

        if (!isAbortError(error)) {
            console.warn('[PCA Service] Nao foi possivel carregar o registro de processos governamentais:', error);
        }

        return fallbackLookup;
    }
};

const resolveGovProcessMatch = (
    protocolOrProcess: string | undefined | null,
    lookup: Map<string, GovProcessRegistryEntry>
) => {
    const normalized = normalizeProcessNumber(protocolOrProcess);
    if (!normalized) {
        return {
            govProcessStatusCode: null,
            govProcessStatusLabel: null,
            govProcessMatch: null
        };
    }

    const match = lookup.get(normalized) || null;
    return {
        govProcessStatusCode: match?.identificationStatusCode || 'NAO_IDENTIFICADO',
        govProcessStatusLabel: match?.identificationStatusLabel || 'Nao identificado',
        govProcessMatch: match
    };
};

export const fetchLocalPcaSnapshot = async (year: string): Promise<ContractItem[]> => {
    const api_url = `/data/pca_${year}.json?t=${Date.now()}`;
    const exec_url = `/data/execution_data.json?t=${Date.now()}`;

    try {
        const [responseResult, execResponseResult, govProcessLookupResult] = await Promise.allSettled([
            fetchWithTimeout(api_url),
            fetchWithTimeout(exec_url).catch(() => ({ ok: false, json: async () => ({}) } as Response)),
            fetchGovProcessRegistryLookup()
        ]);

        const response = responseResult.status === 'fulfilled'
            ? responseResult.value
            : ({ ok: false, json: async () => ({}) } as Response);
        const execResponse = execResponseResult.status === 'fulfilled'
            ? execResponseResult.value
            : ({ ok: false, json: async () => ({}) } as Response);
        const govProcessLookup = govProcessLookupResult.status === 'fulfilled'
            ? govProcessLookupResult.value
            : new Map<string, GovProcessRegistryEntry>();

        let executionData: any[] = [];
        if (execResponse.ok) {
            const execJson = await execResponse.json();
            executionData = execJson.pncp || [];
            console.log("Loaded Execution Data:", executionData.length);
        } else {
            console.error("Failed to load execution data");
        }

        if (response.ok) {
            const jsonData = await response.json();
            const raw = jsonData.data || (Array.isArray(jsonData) ? jsonData : []);
            const mappedSnapshot = raw.map((item: any, index: number) => {
                const officialId = String(item.id || item.numeroItem || index).trim();
                const pncpCategory = String(item.categoriaItemPcaNome || item.nomeClassificacao || '').toLowerCase();
                let categoria = Category.Bens;
                if (pncpCategory.includes('serviç') || pncpCategory.includes('obra')) {
                    categoria = Category.Servicos;
                } else if (pncpCategory.includes('tic') || pncpCategory.includes('tecnologia')) {
                    categoria = Category.TIC;
                }

                // Nomenclature Correction (User FINAL definition):
                // DFD = the short code (e.g., 9/2026)
                // IFC = the full code (e.g., 158886-9/2026)

                const fullCode = item.grupoContratacaoCodigo || '';
                let dfdNumber = '';
                let ifcCode = fullCode;

                if (fullCode.includes('-')) {
                    dfdNumber = fullCode.split('-').slice(1).join('-');
                } else {
                    dfdNumber = fullCode;
                }

                // Title Logic: Use specific description if possible
                const itemTitle = item.descricao ||
                    item.pdmDescricao ||
                    item.classificacaoSuperiorNome ||
                    item.grupoContratacaoNome ||
                    "Item do PCA";

                return {
                    id: officialId,
                    titulo: itemTitle,
                    categoria: categoria,
                    valor: Number(item.valorTotal || (Number(item.valorUnitario || 0) * Number(item.quantidade || 0)) || 0),
                    valorExecutado: 0,
                    inicio: item.dataEstimadaInicioProcesso || item.dataDesejada || new Date().toISOString().split('T')[0],
                    fim: item.dataDesejada || item.dataFim || '',
                    area: item.nomeUnidade || "IFES - BSF",
                    isManual: false,
                    ano: String(year),
                    identificadorFuturaContratacao: item.grupoContratacaoCodigo || '',
                    numeroItem: item.numeroItem || index + 1,
                    codigoItem: item.codigoItemPca || item.codigoItemCatalogado || '',
                    unidadeMedida: item.unidadeMedida || item.unidadeFornecimento || '',
                    quantidade: Number(item.quantidade || 0),
                    valorUnitario: Number(item.valorUnitario || 0),
                    unidadeRequisitante: item.unidadeRequisitante || item.nomeUnidade || '',
                    grupoContratacao: item.grupoContratacaoNome || '',
                    descricaoDetalhada: item.descricao || "Item do Plano de Contratação",
                    numeroDfd: dfdNumber,
                    ifc: ifcCode,
                    sequencialItemPca: item.numeroItem || index + 1,
                    protocoloSIPAC: item.protocoloSIPAC || '',
                    dadosSIPAC: null,
                    valorEmpenhado: (() => {
                        const protocol = item.protocoloSIPAC || '';
                        if (protocol && executionData.length > 0) {
                            const normalized = normalizeProcessNumber(protocol);
                            const match = executionData.find((ex: any) => normalizeProcessNumber(ex.processo) === normalized);
                            if (match) console.log("MATCH FOUND for", normalized, match.valorTotalHomologado);
                            return match ? (match.valorTotalHomologado || 0) : 0;
                        }
                        return 0;
                    })(),
                    dadosExecucao: (() => {
                        const protocol = item.protocoloSIPAC || '';
                        if (protocol && executionData.length > 0) {
                            const normalized = normalizeProcessNumber(protocol);
                            return executionData.find((ex: any) => normalizeProcessNumber(ex.processo) === normalized) || null;
                        }
                        return null;
                    })(),
                    ...resolveGovProcessMatch(item.protocoloSIPAC || item.dadosSIPAC?.numeroProcesso, govProcessLookup)
                };
            });

            return mappedSnapshot;
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

    const hasFirestore = !!db;
    const yearNum = Number(year);
    const cacheRef = hasFirestore ? doc(db, "pca_cache", year) : null;
    const itemsQuery = hasFirestore ? query(collection(db, "pca_data"), where("ano", "in", [String(year), Number(year)])) : null;

    let rawOfficialItems: any[] = [];
    let firestoreManualItems: ContractItem[] = [];
    let firestoreDataUpdates: Record<string, any> = {};
    let cacheMetadata: any = null;
    let executionData: any[] = [];
    let govProcessLookup = new Map<string, GovProcessRegistryEntry>();

    // 2. Helper para Carregamento Local (Prioridade de Velocidade)
    const tryLocalJson = async () => {
        const api_url = `/data/pca_${year}.json?t=${Date.now()}`;
        try {
            const response = await fetchWithTimeout(api_url);
            if (response.ok) {
                const jsonData = await response.json();
                return jsonData.data || (Array.isArray(jsonData) ? jsonData : []);
            }
        } catch (e) {
            console.warn("[PCA Service] JSON local não encontrado:", api_url);
        }
        return [];
    };

    // Helper para carregar dados de execução (Integração PNCP/Compras.gov)
    const tryExecutionData = async () => {
        const api_url = `/data/execution_data.json?t=${Date.now()}`;
        try {
            const response = await fetchWithTimeout(api_url);
            if (response.ok) {
                const jsonData = await response.json();
                return jsonData.pncp || [];
            }
        } catch (e) {
            console.warn("[PCA Service] JSON de execução não encontrado:", api_url);
        }
        return [];
    };

    // 3. Tentar carregar Snapshot Local PRIMEIRO (para não travar a tela)
    report(10);
    const [rawItemsResult, execItemsResult, registryLookupResult] = await Promise.allSettled([
        tryLocalJson(),
        tryExecutionData(),
        fetchGovProcessRegistryLookup(forceSync)
    ]);
    rawOfficialItems = rawItemsResult.status === 'fulfilled' ? rawItemsResult.value : [];
    executionData = execItemsResult.status === 'fulfilled' ? execItemsResult.value : [];
    govProcessLookup = registryLookupResult.status === 'fulfilled' ? registryLookupResult.value : new Map<string, GovProcessRegistryEntry>();
    console.log(`[PCA Service] ✅ Snapshot local carregado: ${rawOfficialItems.length} itens brutos. ${executionData.length} itens de execução.`);

    // 4. Buscar no Firestore
    if (!hasFirestore || !cacheRef || !itemsQuery) {
        console.warn("[PCA Service] Firestore indisponivel. Continuando apenas com snapshot local/API.");
    } else {
        try {
            report(20);
            const [cacheSnap, suppSnap] = await Promise.all([
                getDoc(cacheRef).catch(() => null),
                getDocs(itemsQuery).catch(() => null)
            ]);

        if (cacheSnap?.exists()) {
            cacheMetadata = cacheSnap.data();
            // Prioritize Firestore cache if it has items, regardless of local JSON presence
            if (cacheMetadata.items && cacheMetadata.items.length > 0) {
                rawOfficialItems = cacheMetadata.items;
                console.log(`[PCA Service] Usando cache do Firestore (${rawOfficialItems.length} itens) - Prioridade sobre Local`);
            }
        }

        if (suppSnap && !suppSnap.empty) {
            console.log(`[PCA Service] Documentos encontrados: ${suppSnap.size}`);
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
                        protocoloSIPAC: d.protocoloSIPAC || '',
                        dadosSIPAC: d.dadosSIPAC || null,
                        identificadorFuturaContratacao: d.identificadorFuturaContratacao || '',
                        numeroDfd: d.numeroDfd || d.identificadorFuturaContratacao || '',
                        ifc: d.ifc || '',
                        isManual: true,
                        ano: String(year),
                        ...resolveGovProcessMatch(d.protocoloSIPAC || d.dadosSIPAC?.numeroProcesso, govProcessLookup)
                    } as any);
                } else if (d.officialId) {
                    firestoreDataUpdates[String(d.officialId)] = d;
                }
            });
        } else {
            console.log(`[PCA Service] Nenhum documento retornado na query para o ano ${year}`);
            // Backup: Tentar sem Filtro se for erro de índice/tipo (apenas para debug se necessário, mas vamos confiar na query por agora)
        }
        } catch (fsErr) {
            console.error("[PCA Service] Erro ao carregar dados do Firestore:", fsErr);
        }
    }

    // 5. LIVE SYNC (PNCP)
    const shouldSyncNow = forceSync || (rawOfficialItems.length === 0 && !skipSync);
    if (shouldSyncNow) {
        try {
            console.log(`[PCA Service] 📡 Realizando Sincronização LIVE com PNCP...`);

            const config = await fetchSystemConfig();
            const cnpj = config.unidadeGestora.cnpj || CNPJ_IFES_BSF;
            const seqMap = config.pcaYearsMap || PCA_YEARS_MAP;
            const seq = seqMap[year] || '12';

            const pageSize = 100;
            const firstUrl = `${API_SERVER_URL}/api/pncp/pca/${cnpj}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=1`;
            const firstRes = await fetchWithTimeout(firstUrl, undefined, 12000);

            if (firstRes.ok) {
                const firstData = await firstRes.json();
                rawOfficialItems = firstData.data || (Array.isArray(firstData) ? firstData : []);
                if (rawOfficialItems.length > 0) {
                    console.log('[PCA DEBUG] Exemplo de Item PNCP (Raw):', JSON.stringify(rawOfficialItems[0], null, 2));
                }
                const totalPages = firstData.totalPaginas || 1;

                for (let p = 2; p <= totalPages; p++) {
                    const res = await fetchWithTimeout(`${API_SERVER_URL}/api/pncp/pca/${cnpj}/${year}?tamanhoPagina=${pageSize}&sequencial=${seq}&pagina=${p}`, undefined, 12000);
                    if (res.ok) {
                        const pageData = await res.json();
                        rawOfficialItems = [...rawOfficialItems, ...(pageData.data || [])];
                        report(30 + (p / totalPages) * 50);
                    }
                }

                // Salva no Firestore
                if (cacheRef) {
                    setDoc(cacheRef, {
                        items: rawOfficialItems,
                        updatedAt: Timestamp.now(),
                        count: rawOfficialItems.length
                    }).catch(e => console.error("Erro cache:", e));
                }
            }
        } catch (syncErr) {
            console.error("[PCA Service] Falha na sincronização LIVE:", syncErr);
        }
    }

    report(90);

    // 6. Mapeamento Final
    const mappedOfficial = rawOfficialItems.map((item: any, index: number) => {
        const officialId = String(item.id || item.numeroItem || index).trim();
        const pncpCategory = String(item.categoriaItemPcaNome || item.nomeClassificacao || '').toLowerCase();

        let categoria = Category.Bens;
        if (pncpCategory.includes('serviç') || pncpCategory.includes('obra')) {
            categoria = Category.Servicos;
        } else if (pncpCategory.includes('tic') || pncpCategory.includes('tecnologia')) {
            categoria = Category.TIC;
        }

        const valor = Number(item.valorTotal || (Number(item.valorUnitario || 0) * Number(item.quantidade || 0)) || 0);
        const extra = firestoreDataUpdates[officialId] || {};

        // Nomenclature Correction (User FINAL definition):
        // DFD = the short code (e.g., 9/2026)
        // IFC = the full code (e.g., 158886-9/2026)

        const fullCode = item.grupoContratacaoCodigo || '';
        let dfdNumber = '';
        let ifcCode = fullCode;

        if (fullCode.includes('-')) {
            dfdNumber = fullCode.split('-').slice(1).join('-');
        } else {
            dfdNumber = fullCode;
        }

        // Title Logic: Use specific description if possible
        const itemTitle = item.descricao ||
            item.pdmDescricao ||
            item.classificacaoSuperiorNome ||
            item.grupoContratacaoNome ||
            "Item do PCA";

        // Execution Data Linking
        let valorEmpenhado = 0;
        let dadosExecucao = null;
        const protocol = extra.protocoloSIPAC || '';
        if (protocol && executionData.length > 0) {
            const normalizedProtocol = normalizeProcessNumber(protocol);
            const match = executionData.find((ex: any) => normalizeProcessNumber(ex.processo) === normalizedProtocol);
            if (match) {
                // Using homologated value as proxy for committed value (Empenhado)
                valorEmpenhado = match.valorTotalHomologado || 0;
                dadosExecucao = match;
            }
        }

        return {
            id: officialId,
            titulo: itemTitle,
            categoria: categoria,
            valor: valor,
            valorExecutado: Number(extra.valorExecutado || 0),
            valorEmpenhado: valorEmpenhado,
            dadosExecucao: dadosExecucao,
            inicio: item.dataEstimadaInicioProcesso || item.dataDesejada || new Date().toISOString().split('T')[0],
            fim: item.dataDesejada || item.dataFim || '',
            area: item.nomeUnidade || "IFES - BSF",
            protocoloSIPAC: extra.protocoloSIPAC || '',
            dadosSIPAC: extra.dadosSIPAC || null,
            vinculo_processo_id: extra.vinculo_processo_id || extra.protocoloSIPAC || '',
            status_item: extra.status_item || (extra.protocoloSIPAC ? 'Em Processo' : 'Não iniciado'),
            identificadorFuturaContratacao: extra.identificadorFuturaContratacao || item.grupoContratacaoCodigo || '',
            isManual: false,
            ano: String(year),
            numeroItem: item.numeroItem || index + 1,
            codigoItem: item.codigoItemPca || item.codigoItemCatalogado || '',
            unidadeMedida: item.unidadeMedida || item.unidadeFornecimento || '',
            quantidade: Number(item.quantidade || 0),
            valorUnitario: Number(item.valorUnitario || 0),
            unidadeRequisitante: item.unidadeRequisitante || item.nomeUnidade || '',
            grupoContratacao: item.grupoContratacaoNome || '',
            descricaoDetalhada: item.descricao || "Item do Plano de Contratação",
            numeroDfd: dfdNumber,
            ifc: ifcCode,
            sequencialItemPca: item.numeroItem || index + 1,
            classificacaoSuperiorCodigo: item.classificacaoSuperiorCodigo || '',
            classificacaoSuperiorNome: item.classificacaoSuperiorNome || '',
            dataDesejada: item.dataDesejada || '',
            equipePlanejamento: extra.equipePlanejamento || [],
            equipeIdentificada: extra.equipeIdentificada || false,
            ...resolveGovProcessMatch(extra.protocoloSIPAC || extra.dadosSIPAC?.numeroProcesso, govProcessLookup)
        };
    });

    const finalData = [...mappedOfficial, ...firestoreManualItems];

    let lastSyncStr = cacheMetadata?.updatedAt
        ? cacheMetadata.updatedAt.toDate().toLocaleString('pt-BR')
        : `Snapshot Local (${new Date().toLocaleDateString('pt-BR')})`;

    let pcaMeta = null;
    if (rawOfficialItems.length > 0) {
        const first = rawOfficialItems[0];
        const config = await fetchSystemConfig();
        const cnpjFallback = config.unidadeGestora.cnpj || CNPJ_IFES_BSF;
        const seqMap = config.pcaYearsMap || PCA_YEARS_MAP;
        const seqFallback = seqMap[year] || '12';

        pcaMeta = {
            id: `${first.cnpj || cnpjFallback}-0-${String(first.sequencialPca || seqFallback).padStart(6, '0')}/${first.anoPca || year}`,
            dataPublicacao: first.dataPublicacaoPncp || first.dataInclusao,
            sequencialPca: String(first.sequencialPca || seqFallback),
            dataInclusao: first.dataInclusao || '',
            dataAtualizacao: first.dataAtualizacao || first.dataInclusao || '',
            valorTotalEstimado: rawOfficialItems.reduce((acc, item) => acc + Number(item.valorTotal || 0), 0),
            situacao: first.situacaoPcaNome || 'Ativo',
            poder: first.poderId === '1' ? 'Executivo' : first.poderId === '2' ? 'Legislativo' : first.poderId === '3' ? 'Judiciário' : 'Executivo',
            esfera: first.esferaId === 'F' ? 'Federal' : first.esferaId === 'E' ? 'Estadual' : first.esferaId === 'M' ? 'Municipal' : 'Federal',
            unidadeSubordinada: first.nomeUnidade || '',
            uasg: first.uasg || '',
            orgaoNome: first.orgaoSubordinadoNome || first.nomeOrgao || 'IFES'
        };
    }

    const result = {
        data: finalData,
        lastSync: lastSyncStr,
        pcaMeta
    };

    inMemoryCache[year] = result;
    console.log(`[PCA Service] ✅ Finalizado. Total: ${finalData.length} itens.`);
    report(100);
    return result;
};

export const updatePcaCache = (year: string, itemId: string | number, newData: any) => {
    if (inMemoryCache[year] && inMemoryCache[year].data) {
        const index = inMemoryCache[year].data.findIndex((i: any) => String(i.id) === String(itemId));
        if (index !== -1) {
            inMemoryCache[year].data[index] = {
                ...inMemoryCache[year].data[index],
                ...newData
            };
        }
    }
};
