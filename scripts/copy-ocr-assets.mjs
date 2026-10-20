// Copia los recursos de OCR (Tesseract.js) a public/ocr para que el OCR funcione
// 100 % local, sin descargar nada desde CDNs externos.
import { mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz', 'lang/spa.traineddata.gz'],
];

for (const [from, to] of files) {
  const src = join(root, from);
  const dst = join(out, to);
  if (!existsSync(src)) {
    console.error(`[ocr] Falta ${from}. Ejecute "npm install".`);
    process.exit(1);
  }
  if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
}
console.log('[ocr] Recursos de OCR copiados en public/ocr');
