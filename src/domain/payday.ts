import { addMonths, type MonthKey } from './dates';
import type { Expense, Settings } from './types';

/**
 * Ciclo del día a día: va de un cobro al siguiente. El cobro es el N-ésimo día hábil del mes
 * (por defecto el 4.º), salvo que se indique la fecha exacta de ese mes. Un gasto de efectivo,
 * débito o transferencia hecho antes de cobrar cuenta en el ciclo anterior.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (isoDate: string, n: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function easter(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

const cache = new Map<number, Set<string>>();
/** Feriados y días no laborables nacionales que pueden caer en los primeros días de un mes. */
export function holidays(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const p = easter(y);
  const set = new Set<string>([
    iso(y, 1, 1), iso(y, 3, 24), iso(y, 4, 2), iso(y, 5, 1), iso(y, 5, 25), iso(y, 6, 20), iso(y, 7, 9), iso(y, 12, 8), iso(y, 12, 25),
    addDays(p, -48), addDays(p, -47), // Carnaval
    addDays(p, -3), addDays(p, -2), // Jueves y Viernes Santo
  ]);
  cache.set(y, set);
  return set;
}

export function isBusinessDay(date: string): boolean {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays(Number(date.slice(0, 4))).has(date);
}

/** N-ésimo día hábil de un mes ('YYYY-MM-DD'). */
export function nthBusinessDay(month: MonthKey, n: number): string {
  const [y, m] = month.split('-').map(Number);
  let d = iso(y, m, 1);
  let count = 0;
  for (let i = 0; i < 40; i++) {
    if (isBusinessDay(d)) count++;
    if (count >= Math.max(1, n)) return d;
    d = addDays(d, 1);
  }
  return iso(y, m, 1);
}

type PaydaySettings = Pick<Settings, 'paydayNth' | 'paydays'>;

/** Día de cobro de un mes: la fecha indicada para ese mes o el N-ésimo día hábil. */
export function paydayOf(month: MonthKey, s: PaydaySettings): string {
  return s.paydays?.[month] ?? nthBusinessDay(month, s.paydayNth ?? 4);
}

/** Mes cuyo ciclo contiene esa fecha: si todavía no cobraste este mes, sigue valiendo el ciclo anterior. */
export function cycleMonthOf(date: string, s: PaydaySettings): MonthKey {
  const m = date.slice(0, 7);
  return date >= paydayOf(m, s) ? m : addMonths(m, -1);
}

/** Desde el cobro de ese mes hasta el día anterior al cobro del mes siguiente. */
export function cycleRange(month: MonthKey, s: PaydaySettings): { from: string; to: string } {
  return { from: paydayOf(month, s), to: addDays(paydayOf(addMonths(month, 1), s), -1) };
}

/** Todas las fechas entre dos días, inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Gasto del día a día que cuenta por su fecha de cobro (efectivo, débito, transferencia): no el de tarjeta, que se imputa al mes del resumen. */
export function countsByCycle(e: Expense): boolean {
  return e.kind === 'cotidiano' && e.frequency === 'unica' && e.paymentMethod !== 'tarjeta' && !e.provisional && !!e.date;
}
