
import { db } from '../firebase';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    query,
    where,
    getDocs,
    writeBatch,
    Timestamp
} from 'firebase/firestore';
import { ProcessoAquisicao, SIPACProcess, ContractItem } from '../types';

/**
 * Calcula o Health Score (0-100) baseado no tempo sem movimentação.
 * Regra: Perda de 5 pontos por dia após 15 dias parado.
 */
export const calculateHealthScore = (lastMovementDate: string): { score: number, daysIdle: number } => {
    if (!lastMovementDate) return { score: 100, daysIdle: 0 };

    const [day, month, year] = lastMovementDate.split('/').map(Number);
    const lastDate = new Date(year, month - 1, day);
    const today = new Date();

    const diffTime = Math.abs(today.getTime() - lastDate.getTime());
    const daysIdle = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysIdle <= 15) return { score: 100, daysIdle };

    const penalty = (daysIdle - 15) * 5;
    const score = Math.max(0, 100 - penalty);

    return { score, daysIdle };
};

/**
 * Traduz a Unidade Atual do SIPAC para uma Fase Interna amigável.
 */
export const deriveInternalPhase = (unidadeAtual: string): string => {
    const unit = unidadeAtual.toUpperCase();

    if (unit.includes('PROCURADORIA') || unit.includes('PF-IFES')) return 'Análise Jurídica';
    if (unit.includes('DLC') || unit.includes('LICITA')) return 'Setor de Licitação';
    if (unit.includes('GABINETE')) return 'Gabinete (Assinatura/Encaminhamento)';
    if (unit.includes('COORDENADORIA DE TI') || unit.includes('CTI')) return 'Setor Requisitante (Ajustes TIC)';
    if (unit.includes('DAP') || unit.includes('DIRETORIA DE ADMIN')) return 'Diretoria de Administração';
    if (unit.includes('FINANCE') || unit.includes('CONTAB')) return 'Execução Orçamentária';

    return unidadeAtual; // Fallback para o nome original
};

/**
 * Vincula um ou mais itens do PCA a um processo SIPAC.
 * @param year Opcional: Ano do PCA. Se não informado, tenta extrair do protocolo.
 * @param numeroDfd Opcional: Número do DFD para preservar o agrupamento.
 */
export const linkItemsToProcess = async (protocolo: string, itemIds: (string | number)[], sipacData: SIPACProcess, year?: string, numeroDfd?: string) => {
    const batch = writeBatch(db);

    // 1. Criar/Atualizar o ProcessoAquisicao (Pai)
    const procId = protocolo.replace(/[^\d]/g, ''); // CNPJ_ANO_NUMERO simplificado ou protocolo limpo
    const procRef = doc(db, "acquisition_processes", procId); // Usando ID sanitizado (apenas números)

    const lastMovDate = sipacData.movimentacoes?.[0]?.data || sipacData.dataAutuacion;
    const { score, daysIdle } = calculateHealthScore(lastMovDate);

    const processData: ProcessoAquisicao = {
        id: procId,
        protocoloSIPAC: protocolo,
        itens_vinculados: itemIds.map(String),
        fase_interna_status: deriveInternalPhase(sipacData.unidadeAtual || ''),
        health_score: score,
        dias_sem_movimentacao: daysIdle,
        dadosSIPAC: sipacData,
        ultima_sincronizacao: new Date().toLocaleString('pt-BR')
    };

    batch.set(procRef, processData, { merge: true });

    // 2. Atualizar os Itens (Filhos)
    for (const id of itemIds) {
        // Obter o ano do item se possível, ou usar o ano atual (fallback)
        // Para garantir que o ID do documento seja {ano}-{id} consistente com o fetchPcaData
        // Se o ID já contiver o ano (ex: manual), usamos ele.
        let docId = String(id);
        let itemYear = year;

        // No fetchPcaData, os itens oficiais são salvos como "{ano}-{officialId}"
        // Vamos tentar identificar se o ID precisa do prefixo do ano
        if (!docId.includes('-')) {
            // Se não tem hífen, provavelmente é um ID puro do PNCP. 
            if (!itemYear) {
                // Fallback: tentar extrair do protocolo (comportamento legado)
                const yearMatch = protocolo.match(/\/(\d{4})-/);
                itemYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
            }
            docId = `${itemYear}-${docId}`;
        } else if (!itemYear) {
            // Se já tem hífen (ex: 2024-1), extrair o ano dele
            itemYear = docId.split('-')[0];
        }

        const safeDocId = docId.replace(/\//g, '-');
        const itemRef = doc(db, "pca_data", safeDocId);

        const updateData: any = {
            officialId: String(id), // Importante: mantém o ID original do PNCP aqui
            vinculo_processo_id: protocolo,
            status_item: 'Em Processo',
            protocoloSIPAC: protocolo,
            ano: itemYear, // Garante que o campo ano exista para queries
            "dadosSIPAC.unidadeAtual": sipacData.unidadeAtual,
            "dadosSIPAC.fase_interna_status": processData.fase_interna_status,
            updatedAt: Timestamp.now()
        };

        // Preserve numeroDfd if provided
        if (numeroDfd) {
            updateData.numeroDfd = numeroDfd;
        }

        batch.set(itemRef, updateData, { merge: true });
    }

    await batch.commit();
}


/**
 * Busca processos que podem possuir o mesmo embedding ou contexto.
 */
export const searchProcessesSemantically = async (query: string) => {
    // Placeholder para busca via Gemini/Embeddings no futuro
    // Por enquanto, busca simples por texto nos campos de assunto do SIPAC
    const q = query.toLowerCase();
    const snap = await getDocs(collection(db, "acquisition_processes"));

    return snap.docs
        .map(d => d.data() as ProcessoAquisicao)
        .filter(p =>
            p.dadosSIPAC.assuntoDescricao?.toLowerCase().includes(q) ||
            p.dadosSIPAC.assuntoDetalhado?.toLowerCase().includes(q)
        );
};
