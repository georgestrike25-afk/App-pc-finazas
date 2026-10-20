// Genera los íconos PNG de la PWA a partir del SVG usando Chromium (Playwright).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
async function render(size, file, maskable = false) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#0f766e;display:grid;place-items:center"><div style="width:${size * 0.7}px;height:${size * 0.7}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></div>`
    : svg.replace('<svg', `<svg width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await render(192, 'public/icons/icon-192.png');
await render(512, 'public/icons/icon-512.png');
await render(512, 'public/icons/icon-maskable-512.png', true);
await browser.close();
console.log('Íconos generados');
