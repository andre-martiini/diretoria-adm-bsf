import { SIPACDocument, DocumentRule, ChecklistItemResult, ValidationStatus, DocumentChecklistAIAnalysis } from '../types';
import { DISPENSA_LICITACAO_LIMIT } from '../constants';

export const STANDARD_DOCUMENT_RULES: DocumentRule[] = [
    {
        id: 'dfd',
        nome: '1. Documento de Formalização de Demanda (DFD)',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Dispensado para informações sigilosas, contratações por suprimento de fundos, casos de guerra, estado de defesa, sítio ou intervenção federal, contratações para as Forças Armadas com quebra de padronização, e pequenas compras ou prestação de serviços de pronto pagamento.',
        elementosObrigatorios: [
            'Justificativa da necessidade da contratação.',
            'Descrição sucinta do objeto.',
            'Quantidade a ser contratada (expectativa de consumo anual).',
            'Estimativa preliminar do valor.',
            'Data pretendida para a conclusão da contratação.',
            'Grau de prioridade (baixo, médio ou alto).',
            'Indicação de vinculação com outro DFD, se houver.',
            'Nome da área requisitante ou técnica e identificação do responsável.'
        ],
        keywords: ['Formalização de Demanda', 'DFD', 'Formalizacao de Demanda']
    },
    {
        id: 'etp',
        nome: '2. Estudo Técnico Preliminar (ETP)',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Dispensado em prorrogações de contratos contínuos e dispensas de licitação por licitação deserta ou fracassada. Facultativo em dispensas por baixo valor, emergência ou calamidade pública, e contratações para Forças Armadas.',
        elementosObrigatorios: [
            'Descrição da necessidade da contratação e problema a ser resolvido.',
            'Estimativa das quantidades a serem contratadas e memórias de cálculo.',
            'Estimativa do valor da contratação e memórias de cálculo.',
            'Justificativas para o parcelamento ou não da solução.',
            'Posicionamento conclusivo sobre a adequação da contratação.'
        ],
        keywords: ['Estudo Técnico Preliminar', 'ETP', 'Estudo Tecnico Preliminar', 'Estudo Técnico', 'Estudo Tecnico']
    },
    {
        id: 'riscos',
        nome: '3. Mapa de Gerenciamento de Riscos',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa absoluta legal, devendo o controle ser proporcional à complexidade do processo.',
        elementosObrigatorios: [
            'Identificação dos riscos que podem interferir na contratação.',
            'Avaliação de riscos técnicos, mercadológicos e de gestão.',
            'Definição de medidas mitigadoras e preventivas.'
        ],
        keywords: ['Gerenciamento de Riscos', 'Matriz de Riscos', 'Mapa de Riscos', 'Analise de Riscos', 'Análise de Riscos']
    },
    {
        id: 'tr_pb',
        nome: '4. Termo de Referência (TR) ou Projeto Básico (PB)',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Dispensado em prorrogações de contratos contínuos e dispensas de licitação por licitação deserta ou fracassada mantidas as condições do edital anterior.',
        elementosObrigatorios: [
            'Definição do objeto (natureza, quantitativos, prazo, especificações).',
            'Fundamentação da contratação referenciando o ETP.',
            'Descrição da solução como um todo.',
            'Modelos de execução e de gestão do contrato.',
            'Critérios de medição e de pagamento.',
            'Forma e critérios de seleção do fornecedor.',
            'Estimativas do valor da contratação.'
        ],
        keywords: ['Termo de Referência', 'Termo de Referencia', 'Projeto Básico', 'Projeto Basico', 'TR', 'PB']
    },
    {
        id: 'pesquisa_precos',
        nome: '5. Pesquisa de Preços (Estimativa de Despesa)',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Descrição do objeto a ser contratado.',
            'Identificação dos responsáveis pela pesquisa.',
            'Caracterização das fontes consultadas.',
            'Série de preços coletados e método estatístico aplicado.',
            'Justificativas para a exclusão de valores inconsistentes.',
            'Memória de cálculo do valor estimado.'
        ],
        keywords: ['Pesquisa de Preços', 'Pesquisa de Precos', 'Estimativa de Despesa', 'Mapa de Preços', 'Mapa de Precos', 'Cotação', 'Cotacao']
    },
    {
        id: 'adequeacao_orcamentaria',
        nome: '6. Declaração de Adequação Orçamentária',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Dispensado na fase interna quando a contratação utilizar o Sistema de Registro de Preços (SRP).',
        elementosObrigatorios: [
            'Demonstração da compatibilidade da despesa com o PPA e LDO.',
            'Adequação com a LOA, indicando a dotação específica.',
            'Estimativa do impacto orçamentário-financeiro, quando couber.'
        ],
        keywords: ['Adequação Orçamentária', 'Adequacao Orcamentaria', 'Disponibilidade Orçamentária', 'Disponibilidade Orcamentaria']
    },
    {
        id: 'minuta_edital',
        nome: '7. Minuta do Edital e/ou Contrato',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Minuta de edital não se aplica a contratações diretas. O contrato pode ser substituído por nota de empenho em certos casos.',
        elementosObrigatorios: [
            'Objeto da licitação descrito de forma clara.',
            'Regras relativas a convocação, julgamento, habilitação, recursos e penalidades.',
            'Regras de fiscalização e gestão do contrato.',
            'Direitos e responsabilidades das partes.'
        ],
        keywords: ['Minuta do Edital', 'Minuta de Edital', 'Minuta do Contrato', 'Minuta de Contrato']
    },
    {
        id: 'parecer_juridico',
        nome: '8. Parecer Jurídico',
        obrigatoriedade: 'Obrigatório com exceções',
        hipotesesDispensa: 'Dispensável nas contratações de baixo valor, baixa complexidade, ou uso de minutas padronizadas (conforme regulamento).',
        elementosObrigatorios: [
            'Apreciação de todos os elementos indispensáveis.',
            'Exposição dos pressupostos de fato e de direito.',
            'Linguagem simples, objetiva e compreensível.'
        ],
        keywords: ['Parecer Jurídico', 'Parecer Juridico', 'Manifestação Jurídica', 'Manifestacao Juridica']
    },
    {
        id: 'autorizacao',
        nome: '9. Autorização da Autoridade Competente',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Despacho formal da autoridade máxima ou delegada.',
            'Autorização expressa para a publicação do edital ou contratação direta.'
        ],
        keywords: ['Autorização', 'Autorizacao', 'Despacho da Autoridade', 'Aprovação', 'Aprovacao']
    }
];

export const ARP_DOCUMENT_RULES: DocumentRule[] = [
    // Includes some standard ones usually required
    STANDARD_DOCUMENT_RULES[0], // DFD
    STANDARD_DOCUMENT_RULES[2], // Riscos
    {
        id: 'arp_justificativa',
        nome: 'Justificativa de Adesão (ARP)',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Demonstração de ganho de eficiência.',
            'Demonstração de economicidade.',
            'Estudo comparativo.'
        ],
        keywords: ['Justificativa de Adesão', 'Justificativa', 'Estudo de Ganho']
    },
    {
        id: 'arp_pesquisa',
        nome: 'Pesquisa de Preços (Compatibilidade)',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Comprovação de compatibilidade com o mercado.',
            'Comparativo com a Ata de Registro de Preços.'
        ],
        keywords: ['Pesquisa de Preços', 'Compatibilidade de Preços']
    },
    {
        id: 'arp_aceite',
        nome: 'Documento de Aceite do Fornecedor',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Aceite formal do fornecedor quanto aos quantitativos e prazos.',
            'Concordância com o fornecimento na condição de carona.'
        ],
        keywords: ['Aceite', 'Carta de Aceite', 'Declaração de Aceite', 'Manifestação do Fornecedor']
    },
    {
        id: 'arp_anuencia',
        nome: 'Anuência do Órgão Gerenciador',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Autorização do órgão gerenciador da ata.',
            'Controle do saldo de adesões (limite de 50% ou dobro).'
        ],
        keywords: ['Anuência', 'Autorização do Gerenciador', 'Ofício de Anuência']
    },
    {
        id: 'arp_certame_copias',
        nome: 'Cópias do Certame Original',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Ata de Registro de Preços assinada.',
            'Edital e Termo de Referência originais.',
            'Termo de Homologação.',
            'Parecer Jurídico original.'
        ],
        keywords: ['Cópia do Certame', 'Ata Original', 'Edital Original', 'Homologação']
    },
    {
        id: 'arp_regularidade',
        nome: 'Comprovantes de Regularidade (Empresa)',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'SICAF.',
            'Consulta CADIN.',
            'Consulta TCU (Inidôneos e Inabilitados).'
        ],
        keywords: ['Regularidade', 'SICAF', 'CADIN', 'Certidões']
    },
    STANDARD_DOCUMENT_RULES[5], // Adequação Orçamentária
    STANDARD_DOCUMENT_RULES[7], // Parecer Jurídico (Local)
    STANDARD_DOCUMENT_RULES[8], // Autorização
];

export const IRP_DOCUMENT_RULES: DocumentRule[] = [
    ...STANDARD_DOCUMENT_RULES,
    {
        id: 'irp_formulario',
        nome: 'Formulário de Participação na IRP',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Preenchimento completo dos itens de interesse.',
            'Indicação dos quantitativos.'
        ],
        keywords: ['Formulário IRP', 'Participação IRP']
    },
    {
        id: 'irp_declaracao',
        nome: 'Declaração de Participação',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Justificativas para a participação.',
            'Autorizações internas.',
            'Previsão no PAC (Plano Anual de Contratações).'
        ],
        keywords: ['Declaração de Participação', 'Manifestação de Interesse']
    },
    {
        id: 'irp_comprovantes',
        nome: 'Comprovantes de Lançamento (Prints)',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Print da tela de lançamento da IRP.',
            'Confirmação da manifestação dentro do prazo.'
        ],
        keywords: ['Print', 'Comprovante de Lançamento', 'Tela do Sistema']
    },
    {
        id: 'irp_certame_gerenciador',
        nome: 'Cópias do Certame do Gerenciador',
        obrigatoriedade: 'Sempre Obrigatório',
        hipotesesDispensa: 'Não há dispensa.',
        elementosObrigatorios: [
            'Minuta da ARP.',
            'Minuta do Edital e TR do órgão gerenciador.'
        ],
        keywords: ['Certame Gerenciador', 'Minuta ARP', 'Edital Gerenciador']
    }
];

export const validateProcessDocuments = (
    documents: SIPACDocument[],
    modeOrIsARP: boolean | 'standard' | 'arp' | 'irp' = 'standard',
    manualAssociations?: Record<string, string>,
    estimatedValue?: number | null,
    aiAnalyses?: Record<string, DocumentChecklistAIAnalysis>
): ChecklistItemResult[] => {

    let mode: 'standard' | 'arp' | 'irp';
    if (typeof modeOrIsARP === 'boolean') {
        mode = modeOrIsARP ? 'arp' : 'standard';
    } else {
        mode = modeOrIsARP;
    }

    let rules = STANDARD_DOCUMENT_RULES;
    if (mode === 'arp') rules = ARP_DOCUMENT_RULES;
    if (mode === 'irp') rules = IRP_DOCUMENT_RULES;

    return rules.map(rule => {
        let found: SIPACDocument | undefined;
        let aiMatch: { doc: SIPACDocument; analysis: DocumentChecklistAIAnalysis } | undefined;

        // 1. Check manual association first
        if (manualAssociations && manualAssociations[rule.id]) {
            const associatedDocOrder = manualAssociations[rule.id];
            found = documents.find(d => String(d.ordem) === String(associatedDocOrder));
        }

        // 2. If not found manually, try AI-based detection from OCR summaries
        if (!found && aiAnalyses) {
            const analyses = Object.values(aiAnalyses);
            for (const analysis of analyses) {
                const hasRuleMatch = Array.isArray(analysis?.matchedRules)
                    && analysis.matchedRules.some(m => String(m.ruleId) === String(rule.id));
                if (!hasRuleMatch) continue;
                const doc = documents.find(d => String(d.ordem) === String(analysis.documentOrder));
                if (!doc) continue;
                aiMatch = { doc, analysis };
                found = doc;
                break;
            }
        }

        // 3. If still not found, try keyword-based auto-detection
        if (!found) {
            found = documents.find(doc => {
                const docType = doc.tipo.toLowerCase();
                return rule.keywords.some(keyword => {
                    // Check if keyword is contained in document type
                    // We use word boundary checks or simple includes depending on specificity
                    return docType.includes(keyword.toLowerCase());
                });
            });
        }

        let status: ValidationStatus = found ? 'Presente' : 'Pendente';
        let note: string | undefined = undefined;

        // Custom logic for ETP
        if (rule.id === 'etp') {
            if (estimatedValue && estimatedValue < DISPENSA_LICITACAO_LIMIT) {
                if (status === 'Pendente') {
                    status = 'Dispensado';
                    note = `Dispensado por baixo valor (Estimado: R$ ${estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
                } else {
                    note = `Valor (R$ ${estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) permite dispensa de ETP, mas documento foi encontrado.`;
                }
            }
        }

        // Custom logic for Price Survey to show the value
        if (rule.id === 'pesquisa_precos' && estimatedValue) {
            note = `Valor Estimado Identificado: R$ ${estimatedValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }

        if (aiMatch) {
            const ruleMatch = aiMatch.analysis.matchedRules.find(m => String(m.ruleId) === String(rule.id));
            const confidenceLabel = ruleMatch?.confidence ? ` (confianca IA: ${ruleMatch.confidence})` : '';
            const justification = ruleMatch?.justification ? ` ${ruleMatch.justification}` : '';
            note = `Identificado por IA no OCR do documento #${aiMatch.doc.ordem}${confidenceLabel}.${justification}`.trim();
        }

        return {
            rule,
            status,
            foundDocument: found,
            note
        };
    });
};
