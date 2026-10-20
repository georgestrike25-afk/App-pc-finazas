// Genera release/finanzas-personales-fuente.zip con todo lo necesario para reconstruir el proyecto.
import archiver from 'archiver';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'release'), { recursive: true });
const outPath = join(root, 'release', 'finanzas-personales-fuente.zip');
const out = createWriteStream(outPath);
const zip = archiver('zip', { zlib: { level: 9 } });
zip.pipe(out);
zip.glob('**/*', {
  cwd: root,
  dot: true,
  ignore: ['node_modules/**', 'dist/**', 'dev-dist/**', 'release/**', 'test-results/**', 'playwright-report/**', '.git/**', 'public/ocr/**', 'sync-server/data/**', '**/*.log'],
}, { prefix: 'finanzas-personales' });
out.on('close', () => console.log(`ZIP generado: ${outPath} (${(zip.pointer() / 1024).toFixed(0)} KB)`));
zip.on('error', (e) => { throw e; });
await zip.finalize();
