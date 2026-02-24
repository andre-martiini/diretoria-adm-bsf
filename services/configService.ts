import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SystemConfig } from '../types';
import { CNPJ_IFES_BSF, PCA_YEARS_MAP, DEFAULT_YEAR } from '../constants';

const CONFIG_DOC_PATH = 'system_config/pncp_config';

let cachedConfig: SystemConfig | null = null;

const fallbackConfig: SystemConfig = {
    unidadeGestora: {
        cnpj: CNPJ_IFES_BSF,
        uasg: '158434',
        nome: 'Campus Sao Mateus'
    },
    pcaYearsMap: PCA_YEARS_MAP,
    defaultYear: DEFAULT_YEAR
};

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
            cachedConfig = docSnap.data() as SystemConfig;
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
    cnpj: CNPJ_IFES_BSF,
    uasg: '158434',
    nome: 'Campus Sao Mateus'
};

export const getPcaYearsMap = () => cachedConfig?.pcaYearsMap || PCA_YEARS_MAP;
export const getDefaultYear = () => cachedConfig?.defaultYear || DEFAULT_YEAR;
