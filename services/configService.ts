import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SystemConfig } from '../types';
import { CNPJ_IFES_BSF, PCA_YEARS_MAP, DEFAULT_YEAR } from '../constants';

const CONFIG_DOC_PATH = 'system_config/pncp_config';
const CANONICAL_UNIDADE_GESTORA = {
    cnpj: CNPJ_IFES_BSF,
    uasg: '158434',
    nome: 'Campus Barra de São Francisco'
};

let cachedConfig: SystemConfig | null = null;

const fallbackConfig: SystemConfig = {
    unidadeGestora: CANONICAL_UNIDADE_GESTORA,
    pcaYearsMap: PCA_YEARS_MAP,
    defaultYear: DEFAULT_YEAR
};

const normalizeSystemConfig = (config?: Partial<SystemConfig> | null): SystemConfig => ({
    unidadeGestora: CANONICAL_UNIDADE_GESTORA,
    pcaYearsMap: config?.pcaYearsMap || PCA_YEARS_MAP,
    defaultYear: config?.defaultYear || DEFAULT_YEAR
});

export const fetchSystemConfig = async (forceRefresh = false): Promise<SystemConfig> => {
    if (cachedConfig && !forceRefresh) return cachedConfig;

    if (!db) {
        cachedConfig = fallbackConfig;
        console.warn('[ConfigService] Firestore indisponivel. Usando configuracao padrao em memoria.');
        return fallbackConfig;
    }

    try {
        const docRef = doc(db, CONFIG_DOC_PATH);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const rawConfig = docSnap.data() as SystemConfig;
            const normalizedConfig = normalizeSystemConfig(rawConfig);
            cachedConfig = normalizedConfig;

            if (
                rawConfig?.unidadeGestora?.nome !== CANONICAL_UNIDADE_GESTORA.nome ||
                rawConfig?.unidadeGestora?.cnpj !== CANONICAL_UNIDADE_GESTORA.cnpj ||
                rawConfig?.unidadeGestora?.uasg !== CANONICAL_UNIDADE_GESTORA.uasg
            ) {
                await setDoc(docRef, normalizedConfig, { merge: true });
            }

            console.log('[ConfigService] Configuracao carregada do Firestore:', cachedConfig);
            return cachedConfig;
        }

        await setDoc(docRef, fallbackConfig);
        cachedConfig = fallbackConfig;
        console.log('[ConfigService] Configuracao padrao criada no Firestore.');
        return cachedConfig;
    } catch (error) {
        console.error('[ConfigService] Erro ao carregar configuracao:', error);
        cachedConfig = fallbackConfig;
        return fallbackConfig;
    }
};

export const getActiveUnidadeGestora = () => cachedConfig?.unidadeGestora || {
    ...CANONICAL_UNIDADE_GESTORA
};

export const getPcaYearsMap = () => cachedConfig?.pcaYearsMap || PCA_YEARS_MAP;
export const getDefaultYear = () => cachedConfig?.defaultYear || DEFAULT_YEAR;
