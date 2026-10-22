import type { DocumentMeta } from '../domain/types';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Grabaciones de pantalla: se procesan en el dispositivo y no se guardan. */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export type FileKind = DocumentMeta['kind'];

export interface ValidatedFile {
  kind: FileKind;
  mime: string;
  ext: string;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const EXT_KIND: Record<string, FileKind> = {
  pdf: 'pdf',
  jpg: 'imagen',
  jpeg: 'imagen',
  png: 'imagen',
  webp: 'imagen',
  csv: 'csv',
  txt: 'csv',
  xls: 'excel',
  xlsx: 'excel',
  json: 'csv',
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
};

function startsWith(b: Uint8Array, sig: number[], offset = 0) {
  return sig.every((v, i) => b[offset + i] === v);
}

/**
 * Valida un archivo por extensión Y por contenido (firma binaria), para
 * rechazar archivos malformados o con extensión engañosa.
 */
export function validateFile(name: string, bytes: Uint8Array): ValidatedFile {
  if (!bytes.length) throw new ImportError('El archivo está vacío.');
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const expected = EXT_KIND[ext];
  if (!expected) throw new ImportError(`Formato no admitido (.${ext}). Use PDF, JPG, PNG, CSV, XLS, XLSX o un video (MP4).`);
  if (bytes.length > (expected === 'video' ? MAX_VIDEO_BYTES : MAX_FILE_BYTES))
    throw new ImportError(expected === 'video' ? 'El video supera el máximo de 300 MB. Grabá solo la parte de los consumos.' : 'El archivo supera el máximo de 25 MB.');

  let detected: { kind: FileKind; mime: string } | null = null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) detected = { kind: 'pdf', mime: 'application/pdf' };
  else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) detected = { kind: 'imagen', mime: 'image/png' };
  else if (startsWith(bytes, [0xff, 0xd8, 0xff])) detected = { kind: 'imagen', mime: 'image/jpeg' };
  else if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) detected = { kind: 'imagen', mime: 'image/webp' };
  else if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) detected = { kind: 'video', mime: ext === 'mov' ? 'video/quicktime' : 'video/mp4' };
  else if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) detected = { kind: 'video', mime: 'video/webm' };
  else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && ext === 'xlsx')
    detected = { kind: 'excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  else if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && ext === 'xls')
    detected = { kind: 'excel', mime: 'application/vnd.ms-excel' };
  else if (expected === 'csv' || (expected === 'excel' && ext === 'xls')) {
    // Algunos bancos exportan "XLS" que en realidad son texto/HTML tabulado.
    const head = bytes.subarray(0, Math.min(bytes.length, 8192));
    const hasNul = head.includes(0);
    if (!hasNul) detected = { kind: 'csv', mime: 'text/csv' };
  }
  if (!detected) throw new ImportError('El contenido del archivo no coincide con su extensión o está dañado.');
  if (detected.kind !== expected && !(expected === 'excel' && detected.kind === 'csv'))
    throw new ImportError('La extensión del archivo no coincide con su contenido.');
  if (detected.kind === 'csv') {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).toLowerCase();
    if (/<script|<html|<!doctype/.test(head)) throw new ImportError('El archivo contiene HTML o código activo y no se importará.');
  }
  return { kind: detected.kind, mime: detected.mime, ext };
}
