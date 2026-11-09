import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { makeStatementPdf } from '../fixtures/makeFixtures';
import { fillMoney, go, kpi, openFresh, openLines, setMonth } from './helpers';

test.describe.configure({ mode: 'serial' });

test('1. instalación y apertura sin datos previos (manifiesto y service worker)', async ({ page }) => {
  await openFresh(page);
  await expect(page.getByText('Primeros pasos')).toBeVisible();
  await expect(page.getByText('La app empieza vacía')).toBeVisible();
  await go(page, 'resumen');
  await expect(page.getByText('La aplicación comienza vacía')).toBeVisible();
  await expect(kpi(page, 'Ingresos cobrados')).toHaveText(/\$\s?0,00/);
  await expect(kpi(page, 'Deudas pendientes')).toHaveText(/\$\s?0,00/);
  await expect(kpi(page, 'Ahorro del viaje')).toHaveText(/\$\s?0,00/);
  await expect(page.getByText('Sin cargar').first()).toBeVisible();
  // Presupuesto inicial identificado como valor editable, no como gasto
  await expect(page.getByText('valor inicial editable').first()).toBeVisible();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await (await page.request.get(manifestHref!)).json();
  expect(manifest.name).toBe('Brote: tus finanzas, en crecimiento');
  expect(manifest.short_name).toBe('Brote');
  expect(manifest.display).toBe('standalone');
  expect(manifest.lang).toBe('es-AR');
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.scriptURL ?? '';
  });
  expect(sw).toMatch(/sw\.js$/);
});

test('2-3. registro de ingreso variable y persistencia tras cerrar y reabrir', async ({ page, context }) => {
  await go(page, 'ingresos');
  await page.getByRole('button', { name: '+ Registrar ingreso' }).click();
  await fillMoney(page, 'Ingreso efectivamente cobrado', '1.250.000,50');
  await page.getByRole('button', { name: '+ Agregar' }).first().click();
  await page.getByPlaceholder('Concepto').first().fill('Horas extra');
  await page.locator('fieldset').first().locator('input[inputmode="decimal"]').fill('100.000');
  await expect(page.getByText('Ingreso total neto disponible')).toContainText('1.350.000,50');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('table')).toContainText('1.350.000,50');
  await page.close();

  const page2 = await context.newPage();
  await go(page2, 'ingresos');
  await expect(page2.locator('table')).toContainText('1.350.000,50');
  await expect(page2.locator('table')).toContainText('Confirmado');
  // El ingreso no se copia al mes siguiente
  await go(page2, 'resumen');
  await page2.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(kpi(page2, 'Ingresos cobrados')).toHaveText(/\$\s?0,00/);
});

test('4, 6, 7. importación de PDF con texto, corrección de importe y reimportación sin duplicar', async ({ page }) => {
  const pdf = Buffer.from(await makeStatementPdf());
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'resumen-visa.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText('Revisión de datos extraídos')).toBeVisible();
  await expect(page.getByLabel('Entidad', { exact: true })).toHaveValue('Visa Banco Patagonia');
  const items = page.getByTestId('review-item');
  await expect(items).toHaveCount(5);
  await expect(page.getByText('no se convierte en una deuda nueva')).toBeVisible();
  await expect(page.getByTestId('import-summary')).toContainText('3 gastos');

  // Corrección de un importe extraído
  await openLines(page);
  const coto = items.filter({ hasText: 'COTO' });
  const amount = coto.locator('input[name="amount"]');
  await expect(amount).toHaveValue('32.450,50');
  await amount.fill('32.000,00');
  await amount.blur();
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await expect(page.getByText(/Importación completa: 3 gasto/)).toBeVisible();

  await go(page, 'deudas');
  await expect(page.locator('.ob-table').getByText('MERCADOLIBRE*TIENDA')).toBeVisible();
  await expect(page.getByText('3/10 pagadas')).toBeVisible();
  await expect(page.locator('table').nth(1)).toContainText('141.700,50');

  // Reimportación del mismo documento
  await go(page, 'importar');
  await page.locator('#file').setInputFiles({ name: 'resumen-visa.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByText(/ya fue importado/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByTestId('review-item').filter({ hasText: 'Duplicado' })).toHaveCount(5);
  await expect(page.getByText('0 de 5 línea(s) se incorporarán')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar e incorporar' }).click();
  await expect(page.getByText(/Importación completa: 0 gasto\(s\), 0 obligación/)).toBeVisible();
  await go(page, 'deudas');
  await expect(page.locator('.ob-table').getByText('MERCADOLIBRE*TIENDA')).toHaveCount(1);

  // Sancor ya no se usa: el cupón quedó como gasto común de obra social y Compartidos no tiene sección de Sancor.
  await go(page, 'compartidos');
  await expect(page.locator('.sancor')).toHaveCount(0);
  await go(page, 'gastos');
  await setMonth(page, '2026-10');
  await expect(page.getByTestId('gastos-lista').or(page.locator('table')).first()).toContainText(/SANCOR/i);
});

test('5. importación de una imagen con OCR local', async ({ page }) => {
  test.setTimeout(240_000);
  await go(page, 'importar');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1400;
    c.height = 420;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '44px Arial';
    const lines = ['NARANJA X RESUMEN', 'Vencimiento 10/11/2026', '03/10/2026 FARMACIA CENTRAL 12.345,67', '05/10/2026 SUPERMERCADO DIA 8.900,00'];
    lines.forEach((l, i) => g.fillText(l, 40, 80 + i * 90));
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('#file').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByText('Revisión de datos extraídos')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('OCR', { exact: true })).toBeVisible();
  const items = page.getByTestId('review-item');
  await expect(items.first()).toBeAttached();
  const values = await items.locator('input[name="amount"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain('12.345,67');
  await page.getByRole('button', { name: 'Cancelar' }).first().click();
});

test('8-9. compra en cuotas manual y gasto compartido al 50 %', async ({ page }) => {
  await go(page, 'deudas');
  await page.getByRole('button', { name: '+ Nueva deuda' }).click();
  await page.locator('input[name="entity"]').fill('Naranja X');
  await page.locator('input[name="concept"]').fill('Heladera');
  await page.locator('input[name="totalInstallments"]').fill('10');
  await page.locator('input[name="paidInstallments"]').fill('4');
  await page.locator('input[name="installmentAmount"]').fill('50.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const row = page.locator('tr', { hasText: 'Heladera' });
  await expect(row).toContainText('4/10 pagadas');
  await expect(row).toContainText('300.000,00');
  await row.getByRole('button', { name: 'Ver cuotas' }).click();
  await expect(page.locator('.modal tbody tr')).toHaveCount(10);
  await expect(page.locator('.modal tbody tr', { hasText: 'pendiente' })).toHaveCount(6);
  await page.locator('.modal').getByRole('button', { name: 'Cerrar' }).click();

  await go(page, 'compartidos');
  await page.getByRole('button', { name: '+ Gasto del hogar' }).click();
  await page.locator('input[name="concept"]').fill('Alquiler');
  await page.locator('input[name="amount"]').fill('600.000');
  await expect(page.getByText(/Tu parte:/)).toContainText('300.000,00');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('tr', { hasText: 'Alquiler' })).toContainText('50 %');
  await expect(kpi(page, 'Mi parte')).toContainText('300.000,00');
});

test('12. proyección del ahorro hasta abril de 2027', async ({ page }) => {
  await go(page, 'viaje');
  await expect(page.getByText('Viaje de abril de 2027').first()).toBeVisible();
  await page.locator('input[name="estimatedCost"]').fill('3.000.000');
  await page.locator('input[name="planned"]').fill('200.000');
  await page.locator('input[name="planned"]').blur();
  await page.getByRole('button', { name: 'Guardar objetivo' }).click();
  await page.getByLabel('Ingreso mensual (sueldo neto)').fill('2.000.000');
  await page.getByLabel('Ingreso mensual (sueldo neto)').blur();
  await page.getByRole('button', { name: 'Calcular' }).click();
  await expect(page.getByTestId('viaje-respuesta')).toContainText('abril de 2027');
  await page.getByText('Ver escenarios y proyección mes a mes').click();
  await expect(page.locator('.scen')).toHaveCount(3);
  const proj = page.locator('details.more-opts table').first();
  // Desde el mes que viene hasta abril inclusive (el sueldo de abril se cobra antes del viaje).
  await expect(proj).toContainText('abril de 2027');
  await expect(proj).not.toContainText('mayo de 2027');
  // Ahorro posible por mes: ingreso 2.000.000 − presupuesto del día a día (600 a 700 mil)
  await expect(page.getByTestId('capacity-months')).toContainText('$ 1.300.000 a $ 1.400.000');
  await expect(page.getByText(/Aporte mensual necesario/)).toBeVisible();
});

test('13. exportación y restauración de una copia de seguridad cifrada', async ({ page }) => {
  await go(page, 'deudas');
  await page.getByRole('button', { name: '+ Nueva deuda' }).click();
  await page.locator('input[name="concept"]').fill('Heladera');
  await page.locator('input[name="totalInstallments"]').fill('6');
  await page.locator('input[name="installmentAmount"]').fill('10.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.ob-table').getByText('Heladera')).toBeVisible();
  await go(page, 'copias');
  await page.getByLabel('Contraseña (opcional, mínimo 8 caracteres)').fill('clave-e2e-1234');
  await page.getByLabel('Repetir contraseña').fill('clave-e2e-1234');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar copia' }).click()]);
  const path = await dl.path();
  const text = readFileSync(path!, 'utf8');
  expect(JSON.parse(text).encrypted).toBe(true);
  expect(text).not.toContain('Heladera');

  // Borrar todo
  await go(page, 'configuracion');
  await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Borrar todo' }).click();
  await go(page, 'deudas');
  await expect(page.getByText('No hay obligaciones registradas')).toBeVisible();

  // Restaurar
  await go(page, 'copias');
  await page.getByLabel('Modo', { exact: true }).selectOption('reemplazar');
  await page.getByLabel('Archivo de copia').setInputFiles(path!);
  await page.getByLabel('Contraseña de la copia').fill('clave-e2e-1234');
  await page.getByRole('button', { name: 'Descifrar y continuar' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Reemplazar' }).click();
  await expect(page.getByText(/Copia restaurada/)).toBeVisible();
  await go(page, 'deudas');
  await expect(page.locator('.ob-table').getByText('Heladera')).toBeVisible();
});

test('14. funcionamiento sin conexión de las funciones esenciales', async ({ page, context }) => {
  // A mitad de ciclo de cobro (el presupuesto del día a día cuenta desde el cuarto día hábil).
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00'));
  await openFresh(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.topbar h1')).toHaveText('Este mes');
  await expect(page.locator('.topbar').getByText('Sin conexión')).toBeVisible();
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.locator('input[name="concept"]').fill('Verdulería sin conexión');
  await page.locator('input[name="amount"]').fill('5.500');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('tr', { hasText: 'Verdulería sin conexión' })).toContainText('5.500,00');
  await go(page, 'presupuesto');
  await expect(kpi(page, 'Gastado')).toContainText('5.500,00');
  await context.setOffline(false);
});

test('botón rápido "½" divide un gasto a medias y se puede quitar', async ({ page }) => {
  await openFresh(page);
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.locator('input[name="concept"]').fill('Compra a medias');
  await page.locator('input[name="amount"]').fill('10.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const row = page.locator('tr', { hasText: 'Compra a medias' });
  await expect(row).toContainText('10.000,00');
  await row.getByRole('button', { name: /^A medias:/ }).click();
  await expect(row).toContainText('5.000,00');
  await expect(row).toContainText('50 %');
  await row.getByRole('button', { name: /^Quitar a medias:/ }).click();
  await expect(row).not.toContainText('5.000,00');
  await expect(row).toContainText('10.000,00');
});

test('15. un gasto de antes de cobrar cuenta en el ciclo anterior y después en el nuevo', async ({ page }) => {
  // Hoy es 3/11: el cobro de noviembre es el 5/11 (cuarto día hábil), así que todavía rige el ciclo de octubre.
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00'));
  await openFresh(page);
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.locator('input[name="concept"]').fill('Almuerzo antes de cobrar');
  await page.locator('input[name="amount"]').fill('4.500');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('tr', { hasText: 'Almuerzo antes de cobrar' })).toContainText('4.500,00');
  await go(page, 'presupuesto');
  await expect(page.getByTestId('ciclo')).toContainText('05/11/2026');
  await expect(page.getByTestId('ciclo-activo')).toContainText('cuenta en el ciclo de octubre');
  await expect(kpi(page, 'Gastado')).toContainText('$ 0,00'); // noviembre todavía no empezó
  await page.getByRole('button', { name: /Ver el ciclo de octubre/ }).click();
  await expect(kpi(page, 'Gastado')).toContainText('4.500,00');
});

test('16. gastos que te devuelve el hospital: salen de Gastos, no tocan el presupuesto y se cierran con "Me devolvieron"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00'));
  await openFresh(page);
  await go(page, 'gastos');
  for (const [c, a] of [['Uber al hospital', '10.000'], ['Uber de vuelta', '8.000'], ['Verdulería', '5.000']]) {
    await page.getByRole('button', { name: '+ Anotar gasto' }).click();
    await page.locator('input[name="concept"]').fill(c);
    await page.locator('input[name="amount"]').fill(a);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await go(page, 'presupuesto');
  await expect(kpi(page, 'Gastado')).toContainText('23.000,00');
  await go(page, 'gastos');
  // La primera vez pregunta quién te lo devuelve; después es un solo toque.
  await page.locator('tr', { hasText: 'Uber al hospital' }).getByRole('button', { name: /^Me devuelven/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Guardar' }).click();
  await page.locator('tr', { hasText: 'Uber de vuelta' }).getByRole('button', { name: /^Me devuelven/ }).click();
  await expect(page.locator('tr', { hasText: 'Uber al hospital' })).toHaveCount(0);
  await expect(page.locator('tr', { hasText: 'Uber de vuelta' })).toHaveCount(0);
  await expect(page.locator('tr', { hasText: 'Verdulería' })).toBeVisible();
  // No es gasto tuyo: el presupuesto del día a día solo cuenta lo propio.
  await go(page, 'presupuesto');
  await expect(kpi(page, 'Gastado')).toContainText('5.000,00');
  // Devoluciones: te deben 18.000.
  await go(page, 'devoluciones');
  await expect(kpi(page, 'Te tienen que devolver')).toContainText('18.000,00');
  await expect(page.getByTestId('devoluciones-pendientes').locator('li')).toHaveCount(2);
  // Un ticket de taxi con foto.
  await page.getByRole('button', { name: '+ Gasto que me devuelven' }).click();
  await page.locator('.modal input').first().fill('Taxi jueves');
  await page.getByLabel('Importe').fill('7.000');
  await page.getByLabel('Importe').blur();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('.modal input[type="file"]').setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: png });
  await page.locator('.modal').getByRole('button', { name: 'Guardar' }).click();
  await expect(kpi(page, 'Te tienen que devolver')).toContainText('25.000,00');
  await expect(page.getByRole('button', { name: 'Ver la foto del ticket' })).toBeVisible();
  // El hospital paga todo junto.
  await page.getByText('Elegir todos').click();
  await page.getByRole('button', { name: 'Me devolvieron' }).click();
  await expect(page.locator('.modal input').first()).toHaveValue(/25\.000,00/);
  await page.locator('.modal').getByRole('button', { name: 'Confirmar' }).click();
  await expect(kpi(page, 'Te tienen que devolver')).toContainText('$ 0,00');
  await expect(kpi(page, /Te devolvieron/)).toContainText('25.000,00');
  await expect(page.getByText('Ya te los devolvieron')).toBeVisible();
  // Nunca fue gasto tuyo.
  await go(page, 'presupuesto');
  await expect(kpi(page, 'Gastado')).toContainText('5.000,00');
});
