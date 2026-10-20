import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { go } from './helpers';

// Simula el entorno del APK: Capacitor detecta Android por window.androidBridge y,
// como hace el empaquetado de Android, el modelo de OCR queda sin comprimir (.gz eliminado).
test.beforeAll(() => {
  const gz = 'dist/ocr/lang/spa.traineddata.gz';
  const plain = 'dist/ocr/lang/spa.traineddata';
  if (existsSync(gz) && !existsSync(plain)) writeFileSync(plain, gunzipSync(readFileSync(gz)));
});

test('modo APK: sin service worker y OCR con el modelo descomprimido', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    (window as unknown as { androidBridge: unknown }).androidBridge = { postMessage: () => {} };
  });
  const gzRequests: string[] = [];
  page.on('request', (r) => r.url().endsWith('.traineddata.gz') && gzRequests.push(r.url()));
  await go(page, 'importar');
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length))).toBe(0);
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1300;
    c.height = 260;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = '44px Arial';
    ['Vencimiento 10/11/2026', '03/10/2026 FARMACIA CENTRAL 12.345,67'].forEach((l, i) => g.fillText(l, 40, 90 + i * 90));
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('#file').setInputFiles({ name: 'captura.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.getByText('Revisión de datos extraídos')).toBeVisible({ timeout: 200_000 });
  const values = await page.getByTestId('review-item').locator('input[name="amount"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(values).toContain('12.345,67');
  expect(gzRequests).toEqual([]);
  // En el APK las copias se guardan con el menú Compartir
  await go(page, 'copias');
  await expect(page.getByRole('button', { name: 'Guardar o enviar copia…' })).toBeVisible();
});
