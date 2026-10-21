import { expect, type Page } from '@playwright/test';

export async function openFresh(page: Page) {
  await page.goto('/');
  await expect(page.locator('.topbar h1')).toHaveText('Este mes');
}

export async function go(page: Page, route: string) {
  await page.goto(`/#/${route}`);
  await expect(page.locator('.content')).not.toContainText('Cargando datos locales');
}

/** Escribe un importe en el campo MoneyInput identificado por su etiqueta. */
export async function fillMoney(page: Page, label: string | RegExp, value: string) {
  const input = page.getByLabel(label, { exact: typeof label === 'string' });
  await input.fill(value);
  await input.blur();
}

export function kpi(page: Page, title: string | RegExp) {
  return page.locator('.kpi', { hasText: title }).locator('.money').first();
}

export async function setMonth(page: Page, month: string) {
  await page.locator('.month-nav input[type="month"]').fill(month);
}

/** Abre la lista completa de líneas en la revisión de una importación. */
export async function openLines(page: Page) {
  const d = page.locator('details.lines-detail');
  if (!(await d.evaluate((e) => (e as HTMLDetailsElement).open))) await d.locator(':scope > summary').click();
}
