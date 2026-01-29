
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { SystemConfig } from '../types';
import { CNPJ_IFES_BSF, PCA_YEARS_MAP, DEFAULT_YEAR } from '../constants';

const CONFIG_DOC_PATH = 'system_config/pncp_config';

let cachedConfig: SystemConfig | null = null;

export const fetchSystemConfig = async (forceRefresh = false): Promise<SystemConfig> => {
    if (cachedConfig && !forceRefresh) return cachedConfig;

    try {
        const docRef = doc(db, CONFIG_DOC_PATH);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            cachedConfig = docSnap.data() as SystemConfig;
            console.log('[ConfigService] Configuração carregada do Firestore:', cachedConfig);
            return cachedConfig;
        } else {
            // Se não existir, cria com os valores padrão (fallback)
            const defaultConfig: SystemConfig = {
                unidadeGestora: {
                    cnpj: CNPJ_IFES_BSF,
                    uasg: '158434', // UASG padrão do Campus BSF (exemplo)
                    nome: 'Campus São Mateus'
                },
                pcaYearsMap: PCA_YEARS_MAP,
                defaultYear: DEFAULT_YEAR
            };

            await setDoc(docRef, defaultConfig);
            cachedConfig = defaultConfig;
            console.log('[ConfigService] Configuração padrão criada no Firestore.');
            return cachedConfig;
        }
    } catch (error) {
        console.error('[ConfigService] Erro ao carregar configuração:', error);
        // Fallback total se o Firebase falhar
        return {
            unidadeGestora: {
                cnpj: CNPJ_IFES_BSF,
                uasg: '158434',
                nome: 'Campus São Mateus'
            },
            pcaYearsMap: PCA_YEARS_MAP,
            defaultYear: DEFAULT_YEAR
        };
    }
};

export const getActiveUnidadeGestora = () => cachedConfig?.unidadeGestora || {
    cnpj: CNPJ_IFES_BSF,
    uasg: '158434',
    nome: 'Campus São Mateus'
};

export const getPcaYearsMap = () => cachedConfig?.pcaYearsMap || PCA_YEARS_MAP;
export const getDefaultYear = () => cachedConfig?.defaultYear || DEFAULT_YEAR;
