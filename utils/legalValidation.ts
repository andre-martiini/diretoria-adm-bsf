import { LEGAL_LIMITS } from '../constants/legalLimits';
import { ContractItem, Category } from '../types';

export interface LegalValidationResult {
    eligible: boolean;
    modality: string;
    reason: string;
    requirements: string[];
    documentation: string[];
    alerts?: string[];
}

/**
 * Utilitário para validação de enquadramento legal conforme a Lei 14.133/2021
 */
export const LegalValidation = {
    /**
     * Valida se o item se enquadra em Dispensa de Licitação por Valor (Art. 75, I e II)
     */
    checkDispensaPorValor: (item: ContractItem): LegalValidationResult => {
        const isObras = item.categoria === Category.Obras;
        const limit = isObras ? LEGAL_LIMITS.DISPENSA_OBRAS_ENG_BAIXO_VALOR : LEGAL_LIMITS.DISPENSA_COMPRAS_SERVICOS_BAIXO_VALOR;
        const limitFormatted = limit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        if (item.valor <= limit) {
            return {
                eligible: true,
                modality: 'Dispensa de Licitação (Baixo Valor)',
                reason: `Valor estimado (R$ ${item.valor.toLocaleString('pt-BR')}) está abaixo do limite de ${limitFormatted} para ${isObras ? 'Obras e Serviços de Engenharia' : 'Compras e Outros Serviços'}.`,
                requirements: [
                    'Verificar se não há fracionamento de despesa (somatório de itens da mesma natureza no exercício).',
                    'Pesquisa de preços para comprovar compatibilidade com mercado.',
                    'Parecer jurídico (salvo se houver minuta padronizada ou baixo valor/complexidade conforme regulamento).'
                ],
                documentation: [
                    'Documento de Formalização da Demanda (DFD)',
                    'Estudo Técnico Preliminar (se não dispensado)',
                    'Pesquisa de Preços',
                    'Autorização da Autoridade Competente'
                ]
            };
        } else {
            return {
                eligible: false,
                modality: 'Dispensa de Licitação (Baixo Valor)',
                reason: `Valor estimado (R$ ${item.valor.toLocaleString('pt-BR')}) excede o limite de ${limitFormatted}.`,
                requirements: [],
                documentation: []
            };
        }
    },

    /**
     * Retorna requisitos para Inexigibilidade (Art. 74)
     */
    checkInexigibilidade: (subType: 'Exclusivo' | 'Artistico' | 'Especializado' | 'Imovel'): LegalValidationResult => {
        const commonDocs = ['DFD', 'Estudo Técnico Preliminar', 'Razão da Escolha do Executante', 'Justificativa do Preço'];

        switch (subType) {
            case 'Exclusivo':
                return {
                    eligible: true, // Depende de prova
                    modality: 'Inexigibilidade - Fornecedor Exclusivo (Art. 74, I)',
                    reason: 'Fornecedor exclusivo comprovado.',
                    requirements: [
                        'Vedada a preferência de marca.',
                        'Comprovação de exclusividade por atestado de sindicato, federação ou entidade equivalente.'
                    ],
                    documentation: [...commonDocs, 'Atestado de Exclusividade']
                };
            case 'Artistico':
                return {
                    eligible: true,
                    modality: 'Inexigibilidade - Artista Consagrado (Art. 74, II)',
                    reason: 'Contratação de profissional do setor artístico.',
                    requirements: [
                        'Contratação direta ou via empresário exclusivo.',
                        'Consagração pela crítica especializada ou opinião pública.'
                    ],
                    documentation: [...commonDocs, 'Portfólio/Crítica', 'Contrato de Exclusividade (se via empresário)']
                };
            case 'Especializado':
                return {
                    eligible: true,
                    modality: 'Inexigibilidade - Serviço Técnico Especializado (Art. 74, III)',
                    reason: 'Serviço de natureza predominantemente intelectual com profissional de notória especialização.',
                    requirements: [
                        'Natureza singular do serviço.',
                        'Notória especialização do contratado.',
                        'Vedado para publicidade e propaganda.'
                    ],
                    documentation: [...commonDocs, 'Comprovação de Notória Especialização (Diplomas, Obras, etc.)']
                };
            case 'Imovel':
                return {
                    eligible: true,
                    modality: 'Inexigibilidade - Aquisição/Locação de Imóvel (Art. 74, V)',
                    reason: 'Imóvel cujas características instalações e localização tornem necessária sua escolha.',
                    requirements: [
                        'Avaliação prévia do bem e do seu estado de conservação.',
                        'Certificação de inexistência de imóveis públicos vagos e disponíveis.'
                    ],
                    documentation: [...commonDocs, 'Laudo de Avaliação', 'Certidão de Inexistência de Imóveis Públicos']
                };
        }
    },

    /**
     * Validações Específicas de Dispensa (Art. 75, exceto valor)
     */
    checkDispensaEspecifica: (caso: 'Pesquisa' | 'Emergencia' | 'Deserta' | 'ManutencaoVeiculos'): LegalValidationResult => {
         switch (caso) {
            case 'Pesquisa':
                return {
                    eligible: true,
                    modality: 'Dispensa - P&D (Art. 75, IV, c)',
                    reason: 'Produto para pesquisa e desenvolvimento.',
                    requirements: [
                        `Valor até ${LEGAL_LIMITS.DISPENSA_PRODUTOS_PD.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})} (se aplicável obras/serviços de mesma natureza).`
                    ],
                    documentation: ['Projeto de Pesquisa aprovado']
                };
            case 'Emergencia':
                return {
                    eligible: true,
                    modality: 'Dispensa - Emergência/Calamidade (Art. 75, VIII)',
                    reason: 'Urgência no atendimento de situação que possa ocasionar prejuízo ou comprometer a segurança.',
                    requirements: [
                        'Parcela de obras/serviços concluída em no máximo 1 ano.',
                        'Vedada prorrogação e recontratação.',
                        'Preços compatíveis com mercado.'
                    ],
                    documentation: ['Decreto/Ato de Calamidade ou Justificativa Técnica da Emergência']
                };
            case 'ManutencaoVeiculos':
                return {
                    eligible: true, // Seria condicional ao valor se tivéssemos o item aqui, mas é validação de requisitos
                    modality: 'Dispensa - Manutenção de Veículos (Art. 75, §7º)',
                    reason: 'Manutenção de veículos automotores.',
                    requirements: [
                         `Valor até ${LEGAL_LIMITS.DISPENSA_MANUTENCAO_VEICULOS.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}.`,
                         'Contratação realizada preferencialmente por cartão de pagamento.'
                    ],
                    documentation: ['Orçamentos', 'Justificativa']
                };
             case 'Deserta':
                 return {
                     eligible: true,
                     modality: 'Dispensa - Licitação Deserta/Fracassada (Art. 75, III)',
                     reason: 'Não acudiram interessados à licitação anterior ou preços apresentados foram superiores.',
                     requirements: [
                         'Manutenção das condições definidas no edital da licitação anterior.',
                         'Realizada há menos de 1 ano.'
                     ],
                     documentation: ['Cópia do Processo da Licitação Deserta', 'Justificativa']
                 };
        }
    },

    /**
     * Validação para Licitação Dispensada (Alienação) - Art. 76
     */
    checkLicitacaoDispensada: (tipoBens: 'Moveis' | 'Imoveis'): LegalValidationResult => {
        if (tipoBens === 'Imoveis') {
            return {
                eligible: true,
                modality: 'Licitação Dispensada - Bens Imóveis (Art. 76, I)',
                reason: 'Alienação de bens imóveis da Administração.',
                requirements: [
                    'Autorização legislativa.',
                    'Avaliação prévia.',
                    'Dação em pagamento, permuta, investidura ou venda a outro órgão público.'
                ],
                documentation: ['Lei Autorizativa', 'Laudo de Avaliação', 'Termo de Doação/Permuta']
            };
        } else {
            return {
                eligible: true,
                modality: 'Licitação Dispensada - Bens Móveis (Art. 76, II)',
                reason: 'Alienação de bens móveis.',
                requirements: [
                    'Avaliação prévia.',
                    'Doação para fins de interesse social, permuta, venda de ações, venda de títulos.'
                ],
                documentation: ['Laudo de Avaliação', 'Termo de Doação/Permuta']
            };
        }
    },

    /**
     * Validação para Credenciamento (Art. 79)
     */
    checkCredenciamento: (hipotese: 'Paralela' | 'SelecaoTerceiros' | 'MercadoFluido'): LegalValidationResult => {
        const baseResult = {
            eligible: true,
            modality: 'Credenciamento (Art. 79)',
            documentation: ['Edital de Chamamento Público', 'Regulamento de Credenciamento']
        };

        switch (hipotese) {
            case 'Paralela':
                return {
                    ...baseResult,
                    reason: 'Contratação paralela e não excludente.',
                    requirements: [
                        'Viabilidade de contratação simultânea de todos os interessados.',
                        'Interesse público na multiplicidade de contratados.'
                    ]
                };
            case 'SelecaoTerceiros':
                return {
                    ...baseResult,
                    reason: 'Seleção a critério de terceiros.',
                    requirements: [
                        'Caso em que a seleção do contratado fica a cargo do beneficiário direto da prestação.'
                    ]
                };
            case 'MercadoFluido':
                return {
                    ...baseResult,
                    reason: 'Mercados fluidos.',
                    requirements: [
                        'Flutuação constante do valor da prestação e das condições de contratação.',
                        'Registro de cotação variável.'
                    ]
                };
        }
    }
};
