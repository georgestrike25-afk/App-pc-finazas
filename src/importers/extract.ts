import { sha256Hex } from '../domain/text';
import { extractPdfText, type PdfLib } from './pdf';
import { parseStatementText, type ParsedDocument, type SourceLine } from './statementParser';
import { parseAccountMovements } from './accountMovements';
import { decodeText, parseCsv, parseSpreadsheet, rowsToLines } from './tabular';
import { validateFile, type ValidatedFile } from './fileValidation';

export interface Extraction {
  validated: ValidatedFile;
  hash: string;
  lines: SourceLine[];
  parsed: ParsedDocument;
  ocrUsed: boolean;
  notes: string[];
}

type Progress = (msg: string, pct?: number) => void;

async function pdfLib(): Promise<PdfLib> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs as unknown as PdfLib;
}

/** Lee el archivo localmente (sin red) y lo convierte en datos estructurados. */
export async function extractFile(file: File, opts: { allowOcr: boolean; onProgress?: Progress }): Promise<Extraction> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateFile(file.name, bytes);
  const hash = await sha256Hex(bytes);
  const notes: string[] = [];
  let lines: SourceLine[] = [];
  let ocrUsed = false;
  const p = opts.onProgress ?? (() => {});

  if (validated.kind === 'pdf') {
    p('Leyendo texto del PDF…');
    const lib = await pdfLib();
    const { result, doc } = await extractPdfText(lib, bytes.slice());
    lines = result.lines;
    if (result.scannedPages.length) {
      if (opts.allowOcr) {
        const { ocrImages } = await import('./ocr');
        const canvases: HTMLCanvasElement[] = [];
        for (const n of result.scannedPages.slice(0, 10)) {
          const page = await doc.getPage(n);
          const vp = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
          canvases.push(canvas);
        }
        p('Reconociendo texto (OCR local)…', 0);
        const ocrLines = await ocrImages(canvases, (x) => p(`OCR: ${x.status}`, x.progress));
        lines = [...lines.filter((l) => !result.scannedPages.includes(l.page ?? 0)), ...ocrLines];
        ocrUsed = true;
        if (result.scannedPages.length > 10) notes.push('Solo se procesaron con OCR las primeras 10 páginas escaneadas.');
      } else {
        notes.push(`${result.scannedPages.length} página(s) sin texto: active el OCR para leerlas.`);
      }
    }
    await doc.destroy();
  } else if (validated.kind === 'imagen') {
    if (!opts.allowOcr) throw new Error('Las imágenes requieren OCR. Actívelo para continuar.');
    const { ocrImages } = await import('./ocr');
    p('Reconociendo texto (OCR local)…', 0);
    lines = await ocrImages([new Blob([bytes], { type: validated.mime })], (x) => p(`OCR: ${x.status}`, x.progress));
    ocrUsed = true;
  } else if (validated.kind === 'csv') {
    p('Leyendo CSV…');
    const r = rowsToLines(parseCsv(decodeText(bytes)));
    lines = r.lines;
    if (!r.mapped) notes.push('No se identificaron las columnas; se interpretó cada fila como texto.');
  } else {
    p('Leyendo planilla…');
    try {
      const r = rowsToLines(await parseSpreadsheet(bytes));
      lines = r.lines;
      if (!r.mapped) notes.push('No se identificaron las columnas; se interpretó cada fila como texto.');
    } catch {
      throw new Error('No se pudo leer la planilla: el archivo está dañado o protegido.');
    }
  }
  // Primero se prueba el formato de movimientos de cuenta (capturas de home banking).
  const parsed = parseAccountMovements(lines) ?? parseStatementText(lines, { fallbackYear: new Date().getFullYear() });
  parsed.warnings.unshift(...notes);
  return { validated, hash, lines, parsed, ocrUsed, notes };
}
