import { defineConfig } from '@playwright/test';

/**
 * Capturas del prototipo "Forest Finance" (Etapa 1).
 * Usa la app compilada (dist) servida con `npx vite preview --port 4173` desde la raíz del proyecto,
 * cada prueba en un navegador nuevo con datos de prueba: nunca toca datos reales.
 */
const desktop = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: '.',
  testMatch: /capture\.spec\.ts/,
  timeout: 600_000,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:4173', localStorage: [{ name: 'fp.guiaVista', value: '1' }] }] },
  },
  projects: [
    { name: 'desktop-claro', use: { ...desktop, colorScheme: 'light' } },
    { name: 'desktop-oscuro', use: { ...desktop, colorScheme: 'dark' } },
    { name: 'mobile-claro', use: { ...mobile, colorScheme: 'light' } },
    { name: 'mobile-oscuro', use: { ...mobile, colorScheme: 'dark' } },
  ],
});
