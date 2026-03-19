import { test } from 'node:test';
import assert from 'node:assert';
import { FractionationControlService } from './fractionationControlService';
import { ContractItem, Category } from '../types';
import { LEGAL_LIMITS } from '../constants/legalLimits';

test('FractionationControlService - calculateFractionation', async (t) => {
    const mockData: Partial<ContractItem>[] = [
        {
            id: 1,
            titulo: 'Compra 1',
            valor: 10000,
            categoria: Category.Bens,
            codigoPdm: '12345',
            modalidade: 'Dispensa de Licitação'
        },
        {
            id: 2,
            titulo: 'Compra 2',
            valor: 20000,
            categoria: Category.Bens,
            codigoPdm: '12345',
            modalidade: 'Dispensa de Licitação'
        },
        {
            id: 3,
            titulo: 'Compra Obras 1',
            valor: 120000,
            categoria: Category.Obras,
            codigoPdm: '99999',
            modalidade: 'Dispensa de Licitação'
        },
        {
            id: 4,
            titulo: 'Compra Pregão',
            valor: 50000,
            categoria: Category.Bens,
            codigoPdm: '12345',
            modalidade: 'Pregão Eletrônico'
        },
        {
            id: 5,
            titulo: 'Compra Suprimento',
            valor: 5000,
            categoria: Category.Bens,
            codigoPdm: '54321',
            modalidade: 'Suprimento de Fundos'
        }
    ];

    await t.test('Should calculate limits correctly for Dispensa de Licitação (Serviços/Bens)', () => {
        const result = FractionationControlService.calculateFractionation(
            mockData as ContractItem[],
            '12345',
            false,
            30000,
            'Dispensa de Licitação'
        );

        // Already used for PDM 12345: 10000 + 20000 = 30000.
        // Pregão (50000) should be excluded.
        assert.strictEqual(result.used, 30000);
        assert.strictEqual(result.limit, LEGAL_LIMITS.DISPENSA_COMPRAS_SERVICOS_BAIXO_VALOR); // 65492.11
        assert.strictEqual(result.exceeded, false); // 30000 + 30000 = 60000 < 65492.11
    });

    await t.test('Should trigger exceeded alert for Dispensa de Licitação (Serviços/Bens)', () => {
        const result = FractionationControlService.calculateFractionation(
            mockData as ContractItem[],
            '12345',
            false,
            40000,
            'Dispensa de Licitação'
        );

        assert.strictEqual(result.used, 30000);
        assert.strictEqual(result.exceeded, true); // 30000 + 40000 = 70000 > 65492.11
    });

    await t.test('Should calculate limits correctly for Obras', () => {
        const result = FractionationControlService.calculateFractionation(
            mockData as ContractItem[],
            '99999',
            true,
            5000,
            'Dispensa de Licitação'
        );

        // Already used for Obras PDM 99999: 120000
        assert.strictEqual(result.used, 120000);
        assert.strictEqual(result.limit, LEGAL_LIMITS.DISPENSA_OBRAS_ENG_BAIXO_VALOR); // 130984.20
        assert.strictEqual(result.exceeded, false); // 120000 + 5000 = 125000 < 130984.20
    });

    await t.test('Should not consume limit for non-restricted modalities (e.g. Pregão)', () => {
        const result = FractionationControlService.calculateFractionation(
            mockData as ContractItem[],
            '12345',
            false,
            100000,
            'Pregão Eletrônico'
        );

        assert.strictEqual(result.used, 0);
        assert.strictEqual(result.exceeded, false);
    });

    await t.test('Should calculate limits correctly for Suprimento de Fundos', () => {
        const result = FractionationControlService.calculateFractionation(
            mockData as ContractItem[],
            '54321',
            false,
            2000,
            'Suprimento de Fundos'
        );

        assert.strictEqual(result.used, 5000);
        assert.strictEqual(result.exceeded, false);
    });
});
