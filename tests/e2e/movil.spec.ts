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
  await expect(page.locator('nav.bottom a')).toHaveCount(5);
  await page.getByRole('button', { name: 'Más' }).click();
  await page.locator('.side').getByRole('link', { name: /Viaje/ }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Objetivo de viaje');
  await page.screenshot({ path: 'test-results/movil-viaje.png', fullPage: true });
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
