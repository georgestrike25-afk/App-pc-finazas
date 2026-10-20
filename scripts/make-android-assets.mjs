// Genera íconos (mipmap) y pantallas de inicio de Android a partir del logo, usando Chromium.
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'android/app/src/main/res';
const BG = '#0f766e';
const DOLLAR = '<path d="M32 12v40M41 20c-2-3-5.5-4-9-4-5.5 0-9 3-9 7.5 0 10 19 5.5 19 16 0 4.5-4 7.5-10 7.5-4 0-8-1.5-10-5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
const sym = (px) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">${DOLLAR}</svg>`;
const size = (file) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
async function shot(w, h, html, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
const box = (w, h, inner, extra = '') => `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;${extra}">${inner}</div>`;

for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const dir = join(RES, `mipmap-${d}`);
  const [s] = size(join(dir, 'ic_launcher.png'));
  const [f] = size(join(dir, 'ic_launcher_foreground.png'));
  await shot(s, s, box(s, s, sym(s * 0.72), `background:${BG};border-radius:${s * 0.22}px`), join(dir, 'ic_launcher.png'));
  await shot(s, s, box(s, s, sym(s * 0.66), `background:${BG};border-radius:50%`), join(dir, 'ic_launcher_round.png'));
  // Zona segura del ícono adaptable: 66/108 del lienzo.
  await shot(f, f, box(f, f, sym(f * 0.5)), join(dir, 'ic_launcher_foreground.png'));
}
for (const d of readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
  const file = join(RES, d, 'splash.png');
  if (!existsSync(file)) continue;
  const [w, h] = size(file);
  const s = Math.min(w, h) * 0.28;
  await shot(w, h, box(w, h, `<div style="display:flex;flex-direction:column;align-items:center;gap:${s * 0.12}px">${box(s, s, sym(s * 0.75), `background:rgba(255,255,255,.12);border-radius:${s * 0.22}px`)}<div style="color:#fff;font:600 ${s * 0.2}px system-ui,sans-serif">Finanzas Personales</div></div>`, `background:${BG}`), file);
}
await browser.close();
console.log('Recursos de Android generados');
