import { isIsoDate, monthOf, parseDateEs, type MonthKey } from '../domain/dates';
import { detectDecimalFormat, parseAmount, sum, type Cents } from '../domain/money';
import { normalizeText } from '../domain/text';
import type { SourceLine } from './statementParser';

export type LoanRowStatus = 'pagada' | 'pendiente' | 'vencida';

export interface LoanRow {
  n: number;
  dueDate: string;
  capital?: Cents;
  total: Cents;
  status: LoanRowStatus;
  statusText: string;
}

export interface LoanSchedule {
  loanType: string;
  loanNumber?: string;
  rows: LoanRow[];
  warnings: string[];
}

const ROW = /^(\d{1,3})\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s+(.+)$/;
const AMOUNT = /\$?\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})/g;

function statusOf(text: string): { status: LoanRowStatus; text: string } | null {
  const t = normalizeText(text);
  if (!t) return null;
  if (/\b(paga|pagada|pagado|cancelada|cobrada)\b/.test(t)) return { status: 'pagada', text };
  if (/\b(no vencida|a vencer|pendiente|vigente)\b/.test(t)) return { status: 'pendiente', text };
  if (/\b(vencida|impaga|en mora|morosa)\b/.test(t)) return { status: 'vencida', text };
  return null;
}

/**
 * Reconoce un cronograma de préstamo: encabezado con "Cuota" y "Vencimiento", y filas
 * "n  dd/mm/aaaa  importes…  estado". Las columnas de importes se asignan según el
 * orden del encabezado (Capital, Interés, IVA, Total…); si no hay "Total", se usa el último.
 */
export function detectLoanSchedule(lines: SourceLine[]): LoanSchedule | null {
  const texts = lines.map((l) => (l.text ?? '').replace(/\s+/g, ' ').trim());
  const hi = texts.findIndex((t) => /\bcuota\b/i.test(t) && /\bvencimiento\b/i.test(t) && /(total|importe|capital)/i.test(t));
  if (hi < 0) return null;
  const header = normalizeText(texts[hi]).split(' ');
  const amountCols = header.filter((h) => /^(capital|interes|intereses|iva|impuestos|seguro|total|importe|cuota pura)$/.test(h) || h === 'cuota').filter((h, i, a) => !(h === 'cuota' && a.indexOf('cuota') === i));
  const fmt = detectDecimalFormat(texts.slice(hi, hi + 50).join('\n'));
  const rows: LoanRow[] = [];
  const warnings: string[] = [];
  for (const t of texts.slice(hi + 1)) {
    const m = t.match(ROW);
    if (!m) continue;
    const d = parseDateEs(m[2]);
    if (!d || !isIsoDate(d.iso)) continue;
    const rest = m[3];
    const amounts = [...rest.matchAll(AMOUNT)].map((a) => parseAmount(a[1], fmt)).filter((v): v is number => v !== null);
    if (!amounts.length) continue;
    const lastAmountEnd = (() => {
      let end = 0;
      for (const a of rest.matchAll(AMOUNT)) end = (a.index ?? 0) + a[0].length;
      return end;
    })();
    const st = statusOf(rest.slice(lastAmountEnd));
    const totalIdx = amountCols.lastIndexOf('total') >= 0 && amountCols.length === amounts.length ? amountCols.lastIndexOf('total') : amounts.length - 1;
    const capIdx = amountCols.indexOf('capital');
    rows.push({
      n: Number(m[1]),
      dueDate: d.iso,
      capital: capIdx >= 0 && capIdx < amounts.length && capIdx !== totalIdx ? amounts[capIdx] : undefined,
      total: amounts[totalIdx],
      status: st?.status ?? 'pendiente',
      statusText: st?.text.trim() ?? '',
    });
    if (!st) warnings.push(`Cuota ${m[1]}: no se pudo leer el estado; se considera pendiente.`);
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => a.n - b.n);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].n !== rows[i - 1].n + 1) warnings.push(`Falta la cuota ${rows[i - 1].n + 1} en el cronograma.`);
    if (rows[i].dueDate <= rows[i - 1].dueDate) warnings.push(`La cuota ${rows[i].n} vence antes que la anterior.`);
  }
  if (rows[0].n !== 1) warnings.push('El cronograma no empieza en la cuota 1.');
  const full = texts.join('\n');
  const num = full.match(/(?:nro|n[°º]|numero|número)\.?\s*:?\s*(\d{4,})/i);
  const type = full.match(/pr[eé]stamo\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
  return { loanType: type ? type[1].toLowerCase() : 'personal', loanNumber: num?.[1], rows, warnings };
}

export interface LoanSummary {
  totalInstallments: number;
  paidCount: number;
  /** Cuotas pagadas consecutivas desde la 1 (lo que usa el calendario). */
  leadingPaid: number;
  nextRow?: LoanRow;
  lastRow: LoanRow;
  remainingTotal: Cents;
  remainingCapital?: Cents;
  remainingInterestAndTaxes?: Cents;
  originalCapital?: Cents;
  paidTotal: Cents;
  overdue: LoanRow[];
  firstMonth: MonthKey;
}

export function summarizeLoan(rows: LoanRow[], today: string): LoanSummary {
  let leadingPaid = 0;
  for (const r of rows) {
    if (r.status === 'pagada') leadingPaid++;
    else break;
  }
  const unpaid = rows.filter((r) => r.status !== 'pagada');
  const hasCapital = rows.every((r) => r.capital !== undefined);
  const remainingTotal = sum(unpaid.map((r) => r.total));
  const remainingCapital = hasCapital ? sum(unpaid.map((r) => r.capital)) : undefined;
  return {
    totalInstallments: rows[rows.length - 1].n,
    paidCount: rows.filter((r) => r.status === 'pagada').length,
    leadingPaid,
    nextRow: unpaid[0],
    lastRow: rows[rows.length - 1],
    remainingTotal,
    remainingCapital,
    remainingInterestAndTaxes: remainingCapital !== undefined ? remainingTotal - remainingCapital : undefined,
    originalCapital: hasCapital ? sum(rows.map((r) => r.capital)) : undefined,
    paidTotal: sum(rows.filter((r) => r.status === 'pagada').map((r) => r.total)),
    overdue: unpaid.filter((r) => r.dueDate < today),
    firstMonth: monthOf(rows[0].dueDate),
  };
}
