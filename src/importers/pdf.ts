import type { SourceLine } from './statementParser';

export const MAX_PDF_PAGES = 60;

// Tipos mínimos de pdf.js para poder usar tanto la versión de navegador como la de Node.
interface TextItem { str: string; transform: number[] }
interface PdfPage {
  getTextContent(): Promise<{ items: Array<TextItem | { type: string }> }>;
  getViewport(o: { scale: number }): { width: number; height: number };
  render(o: unknown): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
export interface PdfLib {
  getDocument(src: unknown): { promise: Promise<PdfDoc> };
}

export interface PdfExtraction {
  lines: SourceLine[];
  pages: number;
  /** Páginas sin texto extraíble (probablemente escaneadas). */
  scannedPages: number[];
}

/** Opciones seguras: sin eval, sin XFA, sin scripts del documento. */
export function safePdfOptions(data: Uint8Array) {
  return {
    data,
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  };
}

/** Extrae texto agrupando los fragmentos por renglón (coordenada vertical). */
export async function extractPdfText(lib: PdfLib, bytes: Uint8Array): Promise<{ result: PdfExtraction; doc: PdfDoc }> {
  let doc: PdfDoc;
  try {
    doc = await lib.getDocument(safePdfOptions(bytes)).promise;
  } catch (e) {
    const msg = String((e as Error)?.name ?? '');
    if (/Password/i.test(msg)) throw new Error('El PDF está protegido con contraseña. Ábralo y expórtelo sin contraseña.');
    throw new Error('No se pudo leer el PDF: el archivo está dañado o no es válido.');
  }
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  const lines: SourceLine[] = [];
  const scannedPages: number[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; s: string }>>();
    let chars = 0;
    for (const it of content.items) {
      if (!('str' in it)) continue;
      const s = it.str;
      if (!s.trim()) continue;
      chars += s.trim().length;
      const y = Math.round(it.transform[5] / 3) * 3;
      const x = it.transform[4];
      const row = rows.get(y) ?? [];
      row.push({ x, s });
      rows.set(y, row);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x);
      lines.push({ text: parts.map((q) => q.s).join(' '), page: p, cells: parts.map((q) => ({ x: Math.round(q.x), s: q.s.trim() })) });
    }
    if (chars < 20) scannedPages.push(p);
    page.cleanup();
  }
  return { result: { lines, pages, scannedPages }, doc };
}
