/**
 * Saca del video (grabación de pantalla) los cuadros distintos para leerlos con OCR.
 * Todo ocurre en el dispositivo: el video no se envía a ningún lado ni se guarda.
 *
 * Se toma un cuadro cada 0,25 s y se guardan los que están "quietos" (la pantalla no se
 * está desplazando) y que muestran algo distinto del último guardado.
 */
const SIG_W = 48;
const SIG_H = 96;

function once(el: HTMLMediaElement, ev: string, ms = 8000): Promise<void> {
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('timeout')), ms);
    const done = () => {
      clearTimeout(t);
      el.removeEventListener(ev, done);
      el.removeEventListener('error', err);
      ok();
    };
    const err = () => {
      clearTimeout(t);
      fail(new Error('error'));
    };
    el.addEventListener(ev, done);
    el.addEventListener('error', err);
  });
}

function signature(ctx: CanvasRenderingContext2D, v: HTMLVideoElement): Uint8Array {
  ctx.drawImage(v, 0, 0, SIG_W, SIG_H);
  const d = ctx.getImageData(0, 0, SIG_W, SIG_H).data;
  const out = new Uint8Array(SIG_W * SIG_H);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
  return out;
}

/** Diferencia media (0-255) entre dos firmas. */
export function sigDiff(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

export async function videoFrames(file: Blob, opts: { maxFrames?: number; onProgress?: (pct: number) => void } = {}): Promise<HTMLCanvasElement[]> {
  const maxFrames = opts.maxFrames ?? 60;
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  try {
    try {
      await once(v, 'loadeddata', 15000);
    } catch {
      throw new Error('No se pudo abrir el video en este dispositivo (algunas grabaciones vienen en formato HEVC/H.265). Probá desde el celular, o con capturas de pantalla (una por pantalla).');
    }
    let duration = v.duration;
    if (!Number.isFinite(duration)) {
      // Algunas grabaciones no informan la duración hasta recorrerlas.
      v.currentTime = 1e7;
      await once(v, 'seeked').catch(() => {});
      duration = v.duration;
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('No se pudo leer la duración del video.');
    const sig = document.createElement('canvas');
    sig.width = SIG_W;
    sig.height = SIG_H;
    const sctx = sig.getContext('2d', { willReadFrequently: true })!;
    const scale = Math.min(1, 1080 / (v.videoWidth || 1080));
    const kept: HTMLCanvasElement[] = [];
    let prev: Uint8Array | null = null;
    let lastKept: Uint8Array | null = null;
    let lastKeptT = -Infinity;
    const step = duration > 120 ? duration / 480 : 0.25;
    for (let t = 0.05; t < duration && kept.length < maxFrames; t += step) {
      v.currentTime = t;
      await once(v, 'seeked').catch(() => {});
      const s = signature(sctx, v);
      const still = prev !== null && sigDiff(prev, s) < 2.5;
      prev = s;
      opts.onProgress?.(Math.min(1, t / duration));
      // Se prefieren los cuadros quietos; si la pantalla se desplaza sin parar, se toma uno cada ~0,75 s
      // (las grabaciones de pantalla no se ven movidas, así que igual se leen bien).
      if (!still && t - lastKeptT < 0.75) continue;
      if (lastKept && sigDiff(lastKept, s) < 4) continue;
      const c = document.createElement('canvas');
      c.width = Math.round((v.videoWidth || 1080) * scale);
      c.height = Math.round((v.videoHeight || 1920) * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      kept.push(c);
      lastKept = s;
      lastKeptT = t;
    }
    if (!kept.length) throw new Error('No se encontraron pantallas quietas en el video. Grabalo deteniéndote un momento en cada pantalla.');
    return kept;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}
