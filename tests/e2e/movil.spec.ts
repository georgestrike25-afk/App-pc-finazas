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
