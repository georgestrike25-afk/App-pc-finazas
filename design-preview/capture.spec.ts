import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROTO = 'file://' + join(HERE, 'prototype/index.html');

/** Pantallas del prototipo (una por ruta real de la app, más formularios, diálogos y estados vacíos). */
const PROTO_SCREENS = ['inicio', 'gastos', 'ingresos', 'compartidos', 'presupuesto', 'deudas', 'cuotas', 'prestamos-tarjetas', 'viaje', 'detalle-del-mes', 'importar', 'historial', 'configuracion', 'copias-sincronizacion', 'ayuda', 'formulario-gasto', 'confirmar-eliminar', 'gastos-vacio', 'primeros-pasos'];

/** Pantallas de la app (todas las rutas existentes). */
const SCREENS: Array<[route: string, name: string]> = [
  ['inicio', 'inicio'],
  ['gastos', 'gastos'],
  ['ingresos', 'ingresos'],
  ['compartidos', 'compartidos'],
  ['presupuesto', 'presupuesto'],
  ['entidades', 'deudas'],
  ['cuotas', 'cuotas'],
  ['deudas', 'prestamos-tarjetas'],
  ['viaje', 'viaje'],
  ['resumen', 'detalle-del-mes'],
  ['importar', 'importar'],
  ['historial', 'historial'],
  ['configuracion', 'configuracion'],
  ['copias', 'copias-sincronizacion'],
  ['ayuda', 'ayuda'],
];

async function go(page: Page, route: string) {
  await page.goto(`/#/${route}`);
  await expect(page.locator('.content')).not.toContainText('Cargando datos locales');
}

async function money(page: Page, label: string | RegExp, value: string) {
  const i = page.getByLabel(label, { exact: typeof label === 'string' }).first();
  await i.fill(value);
  await i.blur();
}

/** Datos de prueba (ficticios) en un navegador limpio. */
async function seed(page: Page) {
  const { makeNaranjaPdf } = await import('../tests/fixtures/naranjaFixture');
  const { makeLoanPdf } = await import('../tests/fixtures/loanFixture');
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'naranja.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makeNaranjaPdf()) });
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'cronograma.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await makeLoanPdf(3)) });
  await page.getByRole('button', { name: 'Incorporar préstamo' }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Tarjetas y deudas');

  await go(page, 'ingresos');
  await page.getByRole('button', { name: '+ Registrar ingreso' }).click();
  await money(page, 'Ingreso efectivamente cobrado', '1.250.000,00');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await go(page, 'compartidos');
  await page.getByRole('button', { name: '+ Gasto del hogar' }).click();
  await page.locator('input[name="concept"]').fill('Alquiler');
  await page.locator('input[name="amount"]').fill('600.000');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await go(page, 'gastos');
  for (const [c, a] of [['Supermercado Día', '42.300'], ['Verdulería', '8.500'], ['Farmacia', '12.900'], ['Combustible', '35.000']]) {
    await page.getByRole('button', { name: '+ Anotar gasto' }).click();
    await page.locator('input[name="concept"]').fill(c);
    await page.locator('input[name="amount"]').fill(a);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await page.getByRole('button', { name: /^Mitad con .*Supermercado Día/ }).click();

  await go(page, 'viaje');
  await page.locator('input[name="estimatedCost"]').fill('3.000.000');
  await page.locator('input[name="planned"]').fill('200.000');
  await page.locator('input[name="planned"]').blur();
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();

  await go(page, 'inicio');
  await money(page, '¿Cuánta plata tenés hoy?', '433.253,20');
  await page.locator('.cash-card').getByLabel(/Hasta cuándo/).fill('2026-10-31');
  await page.locator('.cash-card').getByRole('button', { name: 'Guardar' }).click();
  // Los avisos ("Gasto guardado"…) se van solos; se espera para que no tapen las capturas.
  await page.waitForTimeout(4500);
}

async function shot(page: Page, dir: string, file: string, full = false) {
  await page.locator('.banner.ok button').click({ timeout: 500 }).catch(() => {});
  await page.mouse.move(0, 0);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(dir, `${file}.png`), fullPage: full, animations: 'disabled' });
}

test('propuesta (prototipo)', async ({ page }, info) => {
  const [device, tema] = info.project.name.split('-');
  const dir = join(HERE, 'capturas');
  mkdirSync(dir, { recursive: true });
  for (const r of PROTO_SCREENS) {
    await page.goto(`${PROTO}?tema=${tema === 'oscuro' ? 'dark' : 'light'}#/${r}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(dir, `${device}-${r}-${tema}.png`), animations: 'disabled' });
    if (device === 'mobile' && !['formulario-gasto', 'confirmar-eliminar'].includes(r))
      await page.screenshot({ path: join(dir, `${device}-${r}-${tema}-completa.png`), fullPage: true, animations: 'disabled' });
  }
});

/** El diseño actual de la app, con datos de prueba, para comparar. */
const CURRENT: Array<[string, string]> = [['inicio', 'inicio'], ['gastos', 'gastos'], ['ingresos', 'ingresos'], ['compartidos', 'compartidos'], ['presupuesto', 'presupuesto'], ['entidades', 'deudas'], ['cuotas', 'cuotas'], ['deudas', 'prestamos-tarjetas'], ['viaje', 'viaje'], ['resumen', 'detalle-del-mes'], ['importar', 'importar'], ['historial', 'historial'], ['configuracion', 'configuracion'], ['copias', 'copias-sincronizacion'], ['ayuda', 'ayuda']];
test('actual (app de hoy)', async ({ page }, info) => {
  const [device, tema] = info.project.name.split('-');
  const dir = join(HERE, 'actual');
  mkdirSync(dir, { recursive: true });
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00'));
  await go(page, 'inicio');
  await shot(page, dir, `${device}-primeros-pasos-${tema}`);
  await seed(page);
  for (const [route, label] of CURRENT) {
    await go(page, route);
    await shot(page, dir, `${device}-${label}-${tema}`);
  }
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await shot(page, dir, `${device}-formulario-gasto-${tema}`);
});
