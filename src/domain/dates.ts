/** Mes contable con formato 'AAAA-MM'. */
export type MonthKey = string;

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function isMonthKey(v: unknown): v is MonthKey {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function monthOf(isoDate: string): MonthKey {
  return isoDate.slice(0, 7);
}

export function currentMonth(now: Date = new Date()): MonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function todayIso(now: Date = new Date()): string {
  return `${currentMonth(now)}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Cantidad de meses desde a hasta b (b - a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  const n = monthDiff(from, to);
  for (let i = 0; i <= n; i++) out.push(addMonths(from, i));
  return out;
}

export function monthLabel(month: MonthKey): string {
  if (!isMonthKey(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_ES[m - 1]} de ${y}`;
}

export function monthShort(month: MonthKey): string {
  if (!isMonthKey(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_ES[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000,
  );
}

const MONTH_ABBR: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

export interface ParsedDate {
  iso: string;
  /** true si el año no figuraba y fue inferido. */
  yearInferred: boolean;
}

/**
 * Interpreta fechas en formatos habituales de resúmenes argentinos:
 * 05/10/2026, 5-10-26, 05.10.26, 05 Oct 26, 05-oct-2026, 2026-10-05, 05/10 (sin año).
 */
export function parseDateEs(raw: string, fallbackYear?: number): ParsedDate | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return build(+m[1], +m[2], +m[3], false);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return build(normYear(m[3]), +m[2], +m[1], false);
  m = s.match(/^(\d{1,2})[\s/.-]*([a-záéíóú]{3})[a-záéíóú]*\.?[\s/.-]*(\d{2}|\d{4})?$/);
  if (m) {
    const mon = MONTH_ABBR[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '')];
    if (!mon) return null;
    if (m[3]) return build(normYear(m[3]), mon, +m[1], false);
    if (fallbackYear) return build(fallbackYear, mon, +m[1], true);
    return null;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/);
  if (m && fallbackYear) return build(fallbackYear, +m[2], +m[1], true);
  return null;
}

function normYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function build(y: number, m: number, d: number, yearInferred: boolean): ParsedDate | null {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isIsoDate(iso) || y < 1990 || y > 2100) return null;
  return { iso, yearInferred };
}
