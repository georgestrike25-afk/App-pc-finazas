import type { SourceLine } from './statementParser';
import { isNative } from '../platform';

/**
 * OCR 100 % local con Tesseract.js (WebAssembly). Los recursos (worker, núcleo
 * WASM y datos del idioma español) se sirven desde /ocr dentro de la propia
 * aplicación: ningún documento se envía a servicios externos.
 */
export const OCR_ASSETS = [
  'ocr/worker.min.js',
  'ocr/core/tesseract-core-simd-lstm.wasm.js',
  'ocr/core/tesseract-core-lstm.wasm.js',
  'ocr/lang/spa.traineddata.gz',
];

type Progress = (p: { status: string; progress: number }) => void;

function base(): string {
  const b = import.meta.env.BASE_URL || '/';
  return new URL(b, self.location.origin).href;
}

/** Descarga los recursos de OCR a la caché para poder usarlo sin conexión. */
export async function prefetchOcrAssets(): Promise<void> {
  if (isNative()) return; // en el APK los recursos ya están incluidos
  for (const a of OCR_ASSETS) {
    const r = await fetch(base() + a, { cache: 'reload' });
    if (!r.ok) throw new Error(`No se pudo descargar ${a}`);
    await r.arrayBuffer();
  }
}

export async function ocrImages(images: Array<Blob | HTMLCanvasElement>, onProgress?: Progress): Promise<SourceLine[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa', 1, {
    workerPath: base() + 'ocr/worker.min.js',
    corePath: base() + 'ocr/core',
    langPath: base() + 'ocr/lang',
    // Al empaquetar el APK, Android descomprime los recursos .gz (queda spa.traineddata).
    gzip: !isNative(),
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => onProgress?.({ status: m.status, progress: m.progress }),
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: '1' } as never);
    const out: SourceLine[] = [];
    for (let p = 0; p < images.length; p++) {
      const res = await worker.recognize(images[p] as never, {}, { blocks: true, text: true });
      const blocks = (res.data as unknown as { blocks?: Array<{ paragraphs: Array<{ lines: Array<{ text: string; confidence: number }> }> }> }).blocks;
      if (blocks?.length) {
        for (const b of blocks) for (const para of b.paragraphs) for (const l of para.lines) out.push({ text: l.text.trim(), ocrConfidence: l.confidence, page: p + 1 });
      } else {
        const conf = res.data.confidence;
        for (const t of res.data.text.split('\n')) out.push({ text: t, ocrConfidence: conf, page: p + 1 });
      }
    }
    return out.filter((l) => l.text);
  } finally {
    await worker.terminate();
  }
}
