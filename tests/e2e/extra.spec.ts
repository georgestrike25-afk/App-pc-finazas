import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { go } from './helpers';

test('PDF escaneado (solo imagen) se lee con OCR local', async ({ page }) => {
  test.setTimeout(240_000);
  await go(page, 'importar');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1240;
    c.height = 600;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '40px Arial';
    ['MERCADO PAGO', 'Vencimiento 15/11/2026', '02/10/2026 PRESTAMO PERSONAL Cuota 3 de 12 45.000,00'].forEach((l, i) => g.fillText(l, 40, 90 + i * 90));
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(Uint8Array.from(png));
  const p = pdf.addPage([620, 300]);
  p.drawImage(img, { x: 0, y: 0, width: 620, height: 300 });
  const bytes = Buffer.from(await pdf.save());
  await page.locator('#file').setInputFiles({ name: 'escaneado.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByText('Revisión de datos extraídos')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('OCR', { exact: true })).toBeVisible();
  const item = page.getByTestId('review-item').first();
  await expect(item.locator('input[name="amount"]')).toHaveValue('45.000,00');
});

test.describe('15. sincronización entre dos dispositivos con el servidor autohospedado', () => {
  const PORT = 18900 + Math.floor(Math.random() * 90);
  const TOKEN = 'token-e2e-0123456789abcdef';
  let proc: ChildProcess;
  let dir: string;
  test.beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sync-e2e-'));
    proc = spawn(process.execPath, ['sync-server/server.mjs'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SYNC_TOKEN: TOKEN, DATA_DIR: dir }, stdio: 'pipe' });
    await new Promise<void>((ok) => proc.stdout!.on('data', (d) => String(d).includes('Servidor') && ok()));
  });
  test.afterAll(() => {
    proc?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  test('PC y celular convergen', async ({ browser }) => {
    const pc = await (await browser.newContext()).newPage();
    const phone = await (await browser.newContext()).newPage();
    const addExpense = async (page: typeof pc, concept: string) => {
      await go(page, 'gastos');
      await page.getByRole('button', { name: '+ Gasto personal' }).click();
      await page.locator('input[name="concept"]').fill(concept);
      await page.locator('input[name="amount"]').fill('1.000');
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.locator('tr', { hasText: concept })).toBeVisible();
    };
    const sync = async (page: typeof pc) => {
      await go(page, 'copias');
      await page.getByLabel('Dirección del servidor').fill(`http://127.0.0.1:${PORT}`);
      await page.getByLabel(/^Espacio/).fill('hogar-e2e');
      await page.getByLabel('Token de acceso del servidor').fill(TOKEN);
      await page.getByLabel(/^Frase de sincronización/).fill('frase-e2e-secreta');
      await page.getByRole('button', { name: 'Sincronizar ahora' }).click();
      await expect(page.getByText(/Sincronización completa/)).toBeVisible({ timeout: 30_000 });
    };
    await addExpense(pc, 'Gasto desde PC');
    await addExpense(phone, 'Gasto desde celular');
    await sync(pc);
    await sync(phone);
    await sync(pc);
    for (const p of [pc, phone]) {
      await go(p, 'gastos');
      await expect(p.locator('tr', { hasText: 'Gasto desde PC' })).toBeVisible();
      await expect(p.locator('tr', { hasText: 'Gasto desde celular' })).toBeVisible();
    }
  });
});

test('cronograma de préstamo: muestra en qué cuota voy y cuánto falta', async ({ page }) => {
  const { makeLoanPdf } = await import('../fixtures/loanFixture');
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'cronogramaPrestamo.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makeLoanPdf(3)) });
  await expect(page.getByText('Cronograma de préstamo')).toBeVisible();
  await expect(page.locator('.kpi', { hasText: 'Vas por la cuota' })).toContainText('4 de 6');
  await expect(page.locator('.kpi', { hasText: 'Total que falta pagar' })).toContainText('69.000,00');
  await expect(page.locator('.kpi', { hasText: 'Capital adeudado' })).toContainText('42.000,00');
  await page.getByRole('button', { name: 'Incorporar préstamo' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Tarjetas y deudas');
  const row = page.locator('tr', { hasText: 'Préstamo personal' });
  await expect(row).toContainText('3/6 pagadas');
  await expect(row).toContainText('Vas por la 4 de 6');
  await row.getByRole('button', { name: 'Calendario' }).click();
  await expect(page.getByTestId('progreso')).toContainText('Intereses e impuestos que faltan');
});

test('captura de movimientos de cuenta: detecta el sueldo del mes y lo carga', async ({ page }) => {
  test.setTimeout(240_000);
  await go(page, 'importar');
  const png = await page.evaluate(async () => {
    const rows: Array<[string, string, string]> = [
      ['Otorgamiento adelanto', '+ $ 50.000,00', '13/09/2026'],
      ['Pago visa electronico', '- $ 318.000,00', '13/09/2026'],
      ['Acredit. plan sueldos c 0001', '+ $ 1.000.000,00', '13/09/2026'],
      ['Transferencia entre cuentas', '- $ 10.000,00', '13/09/2026'],
      ['Amort.s/prestamo otorg.', '- $ 24.000,00', '10/08/2026'],
    ];
    const c = document.createElement('canvas');
    c.width = 1080;
    c.height = 140 + rows.length * 190;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.font = '40px Arial';
    g.fillStyle = '#000';
    g.fillText('Banco Patagonia', 40, 80);
    rows.forEach(([concept, amount, date], i) => {
      const y = 200 + i * 190;
      g.font = '38px Arial';
      g.fillStyle = '#222';
      g.fillText(concept, 40, y);
      g.font = 'bold 38px Arial';
      g.fillStyle = amount.startsWith('+') ? '#1b7a2f' : '#111';
      g.textAlign = 'right';
      g.fillText(amount, 1040, y);
      g.font = '32px Arial';
      g.fillStyle = '#555';
      g.fillText(date, 1040, y + 55);
      g.textAlign = 'left';
    });
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('#file').setInputFiles({ name: 'movimientos.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByText('Revisión de datos extraídos')).toBeVisible({ timeout: 200_000 });
  const salary = page.getByTestId('review-item').filter({ hasText: /plan sueldos/i });
  await expect(salary.getByLabel('Acción')).toHaveValue('ingreso');
  await expect(salary.locator('input[name="amount"]')).toHaveValue('1.000.000,00');
  const old = page.getByTestId('review-item').filter({ hasText: /prestamo/i });
  await expect(old.getByLabel('Incluir')).not.toBeChecked();
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await expect(page.getByText(/1 ingreso\(s\)/)).toBeVisible();
  await go(page, 'ingresos');
  await expect(page.locator('table')).toContainText('1.000.000,00');
  await expect(page.locator('table')).toContainText('13/09/2026');
});
