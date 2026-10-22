import { test, expect } from '@playwright/test';
import { go } from './helpers';

test('diseño adaptable en Android: sin desplazamiento horizontal y navegación inferior', async ({ page }) => {
  for (const r of ['inicio', 'resumen', 'ingresos', 'gastos', 'deudas', 'entidades', 'importar', 'cuotas', 'compartidos', 'presupuesto', 'viaje', 'historial', 'configuracion', 'copias', 'ayuda']) {
    await go(page, r);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `desborde en ${r}`).toBeLessThanOrEqual(1);
  }
  await go(page, 'inicio');
  await expect(page.locator('nav.bottom')).toBeVisible();
  // Inicio, Gastos, Deudas y Viaje abajo (más el botón "Más"); "Subir" queda arriba, en el encabezado.
  await expect(page.locator('nav.bottom a')).toHaveCount(4);
  await expect(page.locator('.topbar').getByRole('link', { name: 'Subir documento' })).toBeVisible();
  await page.getByRole('button', { name: 'Más' }).click();
  await page.locator('.side').getByRole('link', { name: /Viaje/ }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Objetivo de viaje');
  await page.screenshot({ path: 'test-results/movil-viaje.png', fullPage: true });
  // Los gastos se ven como lista (no como tabla apretada)
  await go(page, 'gastos');
  await page.getByRole('button', { name: '+ Anotar gasto' }).click();
  await page.getByLabel('Cuánto').fill('12.270,00');
  await page.getByLabel('En qué').fill('PEDIDOSYA*EL FUELLE con un nombre bastante largo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const item = page.getByTestId('gastos-lista').locator('li').first();
  await expect(item).toContainText('12.270,00');
  expect((await item.locator('.exp-concept').boundingBox())!.width).toBeGreaterThan(150);
  await expect(page.locator('table')).toHaveCount(0);
});

test.describe('primera vez en el celular', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la guía resalta la navegación inferior y las burbujas no se salen de la pantalla', async ({ page }) => {
    await page.goto('/');
    const guia = page.getByTestId('guia');
    await guia.getByRole('button', { name: 'Empezar la guía' }).click();
    const nav = (await page.locator('nav.bottom [data-tour="nav-inicio"]').boundingBox())!;
    await expect.poll(async () => Math.abs(((await page.locator('.tour-spot').boundingBox())?.y ?? -99) + 6 - nav.y)).toBeLessThan(2);
    const spot = (await page.locator('.tour-spot').boundingBox())!;
    const card = await guia.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(vw);
    // La tarjeta no tapa el elemento resaltado
    expect(card!.y + card!.height).toBeLessThanOrEqual(spot.y);
    await page.screenshot({ path: 'test-results/movil-guia.png' });
    await guia.getByRole('button', { name: 'Salir' }).click();
    await expect(guia).toHaveCount(0);
    await page.getByRole('button', { name: 'Qué es la pantalla Este mes' }).click();
    const b = await page.locator('.help-bubble').boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(vw);
    await page.screenshot({ path: 'test-results/movil-burbuja.png' });
  });
});
