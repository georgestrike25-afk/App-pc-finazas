import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { go, GUIA_VISTA } from './helpers';

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
    const pc = await (await browser.newContext({ storageState: GUIA_VISTA })).newPage();
    const phone = await (await browser.newContext({ storageState: GUIA_VISTA })).newPage();
    const addExpense = async (page: typeof pc, concept: string) => {
      await go(page, 'gastos');
      await page.getByRole('button', { name: '+ Anotar gasto' }).click();
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
  await row.getByRole('button', { name: 'Ver cuotas' }).click();
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
  await expect(salary.getByLabel('Acción', { exact: true })).toHaveValue('ingreso');
  await expect(salary.locator('input[name="amount"]')).toHaveValue('1.000.000,00');
  const old = page.getByTestId('review-item').filter({ hasText: /prestamo/i });
  await expect(old.getByLabel('Incluir')).not.toBeChecked();
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await expect(page.getByText(/1 ingreso\(s\)/)).toBeVisible();
  await go(page, 'ingresos');
  await expect(page.locator('table')).toContainText('1.000.000,00');
  await expect(page.locator('table')).toContainText('13/09/2026');
});

test('cuotas pagadas por error: aviso antes de pagar y corrección en un toque', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00'));
  const { makeLoanPdf } = await import('../fixtures/loanFixture');
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'cronograma.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makeLoanPdf(5)) });
  await page.getByRole('button', { name: 'Incorporar préstamo' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Tarjetas y deudas');
  const row = page.locator('.ob-table tr', { hasText: 'Préstamo personal' });
  await expect(row).toContainText('5/6 pagadas');
  // La cuota 6 vence el 05/11: la app advierte que todavía no venció
  await row.getByRole('button', { name: 'Ver cuotas' }).click();
  await page.locator('.modal').getByText('Corregir cuotas pagadas').click();
  await page.locator('.modal').getByRole('button', { name: 'Marcar la cuota 6 como pagada' }).click();
  await expect(page.locator('.modal')).toContainText('todavía no venció');
  await page.locator('.modal').getByRole('button', { name: 'Sí, la pagué' }).click();
  await expect(row).toContainText('6/6 pagadas');
  await expect(page.getByText('Hay cuotas marcadas como pagadas antes de vencer')).toBeVisible();
  await page.getByRole('button', { name: 'Dejar pagadas solo las vencidas hasta hoy' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Corregir' }).click();
  await expect(row).toContainText('5/6 pagadas');
  await expect(page.getByText('Hay cuotas marcadas como pagadas antes de vencer')).toHaveCount(0);
  // Deshacer último pago desde el calendario
  await row.getByRole('button', { name: 'Ver cuotas' }).click();
  await page.locator('.modal').getByText('Corregir cuotas pagadas').click();
  await page.getByRole('button', { name: /Deshacer último pago/ }).click();
  await expect(row).toContainText('4/6 pagadas');
});

test('plan de pagos de Mercado Pago y deuda por entidad', async ({ page }) => {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const pg = pdf.addPage([300, 500]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = ['Mercado pago', 'PLAN DE PAGOS ESTIMADO Moneda: pesos', 'argentinos', 'NOVIEMBRE 2026 Tarjeta: $100.000,00', 'Prestamos: $50.000,00 Total del mes:', '$150.000,00', 'DICIEMBRE 2026 Tarjeta: $0,00', 'Prestamos: $50.000,00 Total del mes:', '$50.000,00', 'TOTAL DEL PLAN: $200.000,00'];
  lines.forEach((t, i) => pg.drawText(t, { x: 20, y: 470 - i * 16, size: 9, font }));
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'Mercado_pago_a_la_fecha.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.getByTestId('verif-plan')).toContainText('coincide');
  await page.getByRole('button', { name: 'Incorporar plan' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Deuda por entidad');
  const card = page.locator('.entity-card', { hasText: 'Mercado Pago' });
  await expect(card).toContainText('200.000,00');
  await expect(card).toContainText('último pago en diciembre de 2026');
  await expect(card.getByTestId('entity-items').locator('li')).toHaveCount(2);
});

test('Este mes: lo que te queda, pendientes y "Ya lo pagué"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00'));
  const { makeNaranjaPdf } = await import('../fixtures/naranjaFixture');
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'naranja.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makeNaranjaPdf()) });
  await expect(page.getByTestId('verif-saldo')).toContainText('coincide');
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await go(page, 'inicio');
  await expect(page.getByText('Te quedan este mes')).toBeVisible();
  const pend = page.getByTestId('pendientes');
  await expect(pend).toContainText('Cargar el sueldo de octubre de 2026');
  await expect(pend).toContainText('Pagar el resumen de Naranja X');
  await pend.getByRole('button', { name: 'Ya lo pagué' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Sí, ya lo pagué' }).click();
  await expect(pend).toContainText('pagado');
  await expect(pend.getByRole('button', { name: 'Ya lo pagué' })).toHaveCount(0);
  // Las cuotas de ese resumen quedan pagadas
  await go(page, 'entidades');
  await expect(page.locator('.entity-card', { hasText: 'Naranja X' })).toContainText('Vas por la cuota 10 de 12');
});

test.describe('primera vez', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la guía paso a paso se abre sola, recorre las secciones y no vuelve a aparecer', async ({ page }) => {
    await page.goto('/');
    const guia = page.getByTestId('guia');
    await expect(guia).toContainText('Te muestro cómo funciona');
    await guia.getByRole('button', { name: 'Empezar la guía' }).click();
    await expect(guia).toContainText('Este mes');
    // Avanza hasta "Subir documento": abre esa pantalla
    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia.locator('h2')).toHaveText('Subir documento');
    await expect(page.locator('.topbar h1')).toHaveText('Subir documento');
    await expect(page.locator('.tour-spot')).toBeVisible();
    await guia.getByRole('button', { name: 'Anterior' }).click();
    await expect(guia.locator('h2')).toHaveText('Qué te falta hacer');
    // Recorre el resto hasta el final
    for (let i = 0; i < 20 && !(await guia.getByRole('button', { name: 'Empezar', exact: true }).count()); i++) await guia.getByRole('button', { name: 'Siguiente' }).click();
    await expect(guia.locator('h2')).toHaveText('¡Listo!');
    await guia.getByRole('button', { name: 'Empezar', exact: true }).click();
    await expect(guia).toHaveCount(0);
    await expect(page.locator('.topbar h1')).toHaveText('Este mes');
    await page.reload();
    await expect(page.locator('.topbar h1')).toHaveText('Este mes');
    await expect(guia).toHaveCount(0);
    // Se puede volver a ver desde "Cómo usar"
    await go(page, 'ayuda');
    await page.getByRole('button', { name: 'Ver la guía paso a paso' }).click();
    await expect(guia).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guia).toHaveCount(0);
  });
});

test('el signo ? abre una burbuja con la explicación', async ({ page }) => {
  await go(page, 'importar');
  await page.getByRole('button', { name: 'Ayuda: Importar documento' }).click();
  const bubble = page.getByRole('dialog', { name: 'Ayuda: Importar documento' });
  await expect(bubble).toContainText('Resumen de tarjeta');
  await bubble.getByRole('button', { name: 'Entendido' }).click();
  await expect(bubble).toHaveCount(0);
  // La de la pantalla, al lado del título, y se cierra tocando afuera
  await page.getByRole('button', { name: 'Qué es la pantalla Subir documento' }).click();
  await expect(page.getByRole('dialog', { name: 'Qué es la pantalla Subir documento' })).toContainText('no se duplica');
  await page.locator('.content').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.help-bubble')).toHaveCount(0);
  // En los campos de un formulario
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.getByRole('button', { name: 'Qué es un gasto que se repite' }).click();
  await expect(page.locator('.help-bubble')).toContainText('todos los meses');
});

test('planilla de gastos compartidos (CSV de Google Sheets): elegir quién sos y cargar tu parte', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00'));
  await go(page, 'importar');
  const csv = [
    'Mes,Alquiler,,Luz,,Cochera,Total Mes',
    ',Caro,Leo,Caro,Leo,Leo,',
    'Septiembre,"$300,000.00","$150,000.00","$30.000,50","15000,25","$15,000",$0',
    'Octubre,"$310,000.00","$155,000.00","$25,000.00","$12,500.00","$15,000.00",$0',
  ].join('\n');
  await page.locator('#file').setInputFiles({ name: 'Gastos compartidos 2026.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const quien = page.getByTestId('planilla-quien');
  await expect(quien).toBeVisible();
  await expect(page.getByRole('button', { name: 'Incorporar gastos' })).toBeDisabled();
  await quien.getByRole('button', { name: 'Leo' }).click();
  await expect(page.getByTestId('planilla-resumen')).toContainText('332.500,25');
  await page.getByRole('button', { name: 'Incorporar gastos' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Gastos compartidos');
  await expect(page.locator('.content')).toContainText('Caro');
  const alquiler = page.locator('tr', { hasText: 'Alquiler' });
  await expect(alquiler).toContainText('310.000,00');
  await expect(alquiler).toContainText('155.000,00');
  // Volver a subirla no duplica
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'Gastos compartidos 2026 (1).csv', mimeType: 'text/csv', buffer: Buffer.from(csv + '\n') });
  await expect(page.getByRole('button', { name: 'Incorporar gastos' })).toBeDisabled();
  await expect(page.locator('.content')).toContainText('Ya cargado');
});

test('plata hasta cobrar: se descuenta lo que gastás', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00'));
  await go(page, 'inicio');
  const card = page.locator('.cash-card');
  await card.getByLabel('¿Cuánta plata tenés hoy?').fill('100.000');
  await card.getByLabel(/Hasta cuándo/).fill('2026-10-31');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card).toContainText('100.000,00');
  await expect(card).toContainText('10 días');
  await expect(card).toContainText('10.000,00 por día');
  await page.clock.setFixedTime(new Date('2026-10-22T12:05:00'));
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.getByLabel('Cuánto').fill('25.000');
  await page.getByLabel('En qué').fill('Súper');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await go(page, 'inicio');
  await expect(card).toContainText('75.000,00');
  await expect(card).toContainText('7.500,00 por día');
  await card.getByRole('button', { name: /Gastaste/ }).click();
  await expect(card.getByTestId('cash-items')).toContainText('Súper');
  // Corregir
  await card.getByRole('button', { name: 'Corregir' }).click();
  await card.getByLabel('¿Cuánta plata tenés hoy?').fill('80.000');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card).toContainText('80.000,00');
});
