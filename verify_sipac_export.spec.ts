
import { test, expect } from '@playwright/test';

test('Verify SIPAC Export Button', async ({ page }) => {
  // Mock the API response
  await page.route('**/api/sipac/processo*', async (route) => {
    const json = {
      numeroProcesso: '23068.123456/2023-99',
      status: 'EM TRAMITACAO',
      dataAutuacion: '01/01/2023',
      horarioAutuacion: '10:00',
      natureza: 'ADMINISTRATIVO',
      assuntoCodigo: '123',
      assuntoDescricao: 'TESTE DE EXPORTACAO',
      assuntoDetalhado: 'Detalhe do teste',
      observacao: 'Obs do teste',
      interessados: [{ tipo: 'SERVIDOR', nome: 'JOAO DA SILVA' }],
      documentos: [
        { ordem: '1', tipo: 'MEMORANDO', data: '01/01/2023', unidadeOrigem: 'DG', url: 'http://fake.url/doc1.pdf' },
        { ordem: '2', tipo: 'OFICIO', data: '02/01/2023', unidadeOrigem: 'DG', url: 'http://fake.url/doc2.pdf' }
      ],
      movimentacoes: [
        { data: '01/01/2023', horario: '10:00', usuarioRemetente: 'JOAO', unidadeOrigem: 'DG', unidadeDestino: 'PROAD', usuarioRecebedor: 'MARIA', urgente: 'NAO' }
      ]
    };
    await route.fulfill({ json });
  });

  // Navigate to the SIPAC Importer page
  await page.goto('http://localhost:3000/sipac');

  // Fill the protocol input
  await page.fill('input[type="text"]', '23068.123456/2023-99');

  // Click the "Localizar" button
  await page.click('button:has-text("Localizar")');

  // Wait for the results to load
  await expect(page.getByText('23068.123456/2023-99')).toBeVisible();

  // Wait for the Export button to appear
  const exportButton = page.getByText('Exportar Dossiê para o Gemini (.zip)');
  await expect(exportButton).toBeVisible();

  // Take a screenshot
  await page.screenshot({ path: 'sipac_verification.png', fullPage: true });
});
