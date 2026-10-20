import Papa from 'papaparse';
import { formatPlain } from '../domain/money';
import { parseAmount, detectDecimalFormat } from '../domain/money';
import { normalizeText } from '../domain/text';
import type { SourceLine } from './statementParser';

export const MAX_ROWS = 5000;

type Cell = string | number | boolean | Date | null | undefined;

const COLS = {
  date: ['fecha', 'date', 'fecha de origen', 'fecha operacion', 'release date', 'fecha de compra', 'fecha movimiento'],
  concept: ['concepto', 'descripcion', 'detalle', 'description', 'comercio', 'transaction type', 'movimiento', 'establecimiento'],
  amount: ['importe', 'monto', 'valor', 'amount', 'total', 'net amount', 'transaction net amount', 'pesos', 'importe en pesos', 'importe ars'],
  debit: ['debito', 'debitos', 'egreso', 'egresos', 'cargo', 'debe'],
  credit: ['credito', 'creditos', 'ingreso', 'ingresos', 'abono', 'haber'],
  installment: ['cuota', 'cuotas', 'nro cuota', 'cuota actual'],
};

function findCol(header: string[], keys: string[]): number {
  for (const k of keys) {
    const i = header.findIndex((h) => h === k);
    if (i >= 0) return i;
  }
  for (const k of keys) {
    const i = header.findIndex((h) => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

function cellText(c: Cell): string {
  if (c === null || c === undefined) return '';
  if (c instanceof Date) return dateText(c);
  return String(c);
}

function dateText(d: Date): string {
  // Se suma medio día para evitar corrimientos por zona horaria.
  const x = new Date(d.getTime() + 12 * 3600 * 1000);
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`;
}

/** Número de serie de Excel (días desde 1899-12-30) a dd/mm/aaaa, sin zona horaria. */
export function serialToText(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function cellAmount(c: Cell, fmt: 'coma' | 'punto'): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? Math.round(c * 100) : null;
  const s = cellText(c).trim();
  if (!s) return null;
  return parseAmount(s, fmt);
}

/**
 * Convierte filas de una planilla en renglones normalizados
 * ("dd/mm/aaaa concepto C.n/N importe") que procesa el mismo intérprete de resúmenes.
 */
export function rowsToLines(rows: Cell[][]): { lines: SourceLine[]; mapped: boolean } {
  const limited = rows.slice(0, MAX_ROWS);
  const sample = limited.slice(0, 200).map((r) => r.map(cellText).join(' ')).join('\n');
  const fmt = detectDecimalFormat(sample);
  let headerIdx = -1;
  let cols = { date: -1, concept: -1, amount: -1, debit: -1, credit: -1, installment: -1 };
  for (let i = 0; i < Math.min(limited.length, 20); i++) {
    const h = limited[i].map((c) => normalizeText(cellText(c)));
    const c = {
      date: findCol(h, COLS.date),
      concept: findCol(h, COLS.concept),
      amount: findCol(h, COLS.amount),
      debit: findCol(h, COLS.debit),
      credit: findCol(h, COLS.credit),
      installment: findCol(h, COLS.installment),
    };
    if (c.date >= 0 && c.concept >= 0 && (c.amount >= 0 || c.debit >= 0)) {
      headerIdx = i;
      cols = c;
      break;
    }
  }
  if (headerIdx < 0) {
    return { lines: limited.map((r) => ({ text: r.map(cellText).filter(Boolean).join('  ') })), mapped: false };
  }
  const body = limited.slice(headerIdx + 1);
  const pre = limited.slice(0, headerIdx).map((r) => ({ text: r.map(cellText).filter(Boolean).join('  ') }));
  // Extractos de cuenta (p. ej. Mercado Pago): egresos negativos, ingresos positivos.
  let neg = 0;
  let pos = 0;
  if (cols.amount >= 0 && cols.debit < 0) {
    for (const r of body) {
      const v = cellAmount(r[cols.amount], fmt);
      if (v === null) continue;
      if (v < 0) neg++;
      else pos++;
    }
  }
  const accountStyle = neg > 0 && neg >= pos;
  const lines: SourceLine[] = [...pre];
  for (const r of body) {
    const dateRaw = r[cols.date];
    const date =
      dateRaw instanceof Date
        ? dateText(dateRaw)
        : typeof dateRaw === 'number' && dateRaw > 20000 && dateRaw < 80000
          ? serialToText(dateRaw)
          : cellText(dateRaw).trim().split(/[ T]/)[0];
    const concept = cellText(r[cols.concept]).replace(/\s+/g, ' ').trim();
    let amount: number | null = null;
    if (cols.debit >= 0) {
      const d = cellAmount(r[cols.debit], fmt);
      const c = cols.credit >= 0 ? cellAmount(r[cols.credit], fmt) : null;
      if (d) amount = Math.abs(d);
      else if (c) amount = -Math.abs(c);
    } else {
      amount = cellAmount(r[cols.amount], fmt);
      if (amount !== null && accountStyle) amount = -amount;
    }
    if (!date || amount === null) continue;
    let inst = '';
    if (cols.installment >= 0) {
      const m = cellText(r[cols.installment]).match(/(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/);
      if (m) inst = ` C.${m[1]}/${m[2]}`;
    }
    const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date;
    lines.push({ text: `${isoLike} ${concept || '(sin concepto)'}${inst} ${amount < 0 ? '-' : ''}${formatPlain(Math.abs(amount))}` });
  }
  return { lines, mapped: true };
}

export function parseCsv(text: string): Cell[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true, preview: MAX_ROWS + 50 });
  return res.data.map((r) => r.map((c) => (typeof c === 'string' ? sanitizeCell(c) : c)));
}

/** Evita que el texto importado se interprete como fórmula si luego se exporta. */
export function sanitizeCell(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ');
}

export async function parseSpreadsheet(bytes: Uint8Array): Promise<Cell[][]> {
  const XLSX = await import('@e965/xlsx');
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true, cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 50, WTF: false });
  const out: Cell[][] = [];
  for (const name of wb.SheetNames.slice(0, 5)) {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + MAX_ROWS); r++) {
      const row: Cell[] = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 50); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as { t: string; v: unknown; z?: string; w?: string } | undefined;
        if (!cell) {
          row.push('');
        } else if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
          // Fecha de Excel: se convierte desde el número de serie, sin depender de la zona horaria.
          const d = XLSX.SSF.parse_date_code(cell.v as number);
          row.push(d ? `${String(d.d).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y}` : '');
        } else if (cell.t === 'n') {
          row.push(cell.v as number);
        } else if (cell.t === 'd') {
          row.push(cell.v as Date);
        } else {
          row.push(sanitizeCell(String(cell.v ?? '')));
        }
      }
      out.push(row);
    }
    if (out.length > MAX_ROWS) break;
  }
  return out;
}

export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // Si hay caracteres de reemplazo, probablemente sea Latin-1 (exportaciones de bancos).
  if (utf8.includes('�')) return new TextDecoder('windows-1252').decode(bytes);
  return utf8;
}
