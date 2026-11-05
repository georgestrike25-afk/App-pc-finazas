import { addMonths, daysBetween } from './dates';
import { splitShared } from './expenses';
import { sum, type Cents } from './money';
import type { DataSet } from './monthly';
import { paydayOf } from './payday';
import type { Contribution, Expense } from './types';

export interface CashStatus {
  start: Cents;
  spent: Cents;
  /** Lo que te devolvieron (p. ej. tu pareja, su parte de Sancor) desde que anotaste tu plata. */
  returned: Cents;
  /** Ingresos que anotaste después de anotar tu plata (no el sueldo: con el sueldo se vuelve a anotar la plata). */
  ingresos: Cents;
  /** Sueldo cargado después de anotar tu plata: entra entero (lo que ya pagaste se va descontando). */
  salary: Cents;
  left: Cents;
  /** Gastos que se descontaron (para mostrarlos). */
  items: Array<{ concept: string; amount: Cents; date: string }>;
  /** Días que faltan contando hoy (si se indicó hasta cuándo). */
  days?: number;
  perDay?: Cents;
  /** Hasta cuándo te tiene que alcanzar: si cargaste un sueldo nuevo, hasta el cobro siguiente. */
  until?: string;
}

/** Lo que sale de tu bolsillo por un gasto: tu parte si es compartido. */
const outOfPocket = (e: Expense) => (e.kind === 'hogar' ? splitShared(e.totalAmount, e.userPct).user : e.totalAmount);

/**
 * "Plata hasta cobrar": desde el momento en que el usuario anotó cuánto tenía, se descuentan
 * los gastos que anota o que detecta la app (efectivo, débito, transferencias, billeteras) y
 * los pagos de resumen. Las compras con tarjeta de crédito no: se pagan con el resumen.
 */
/** Factura de un servicio subida y todavía sin pagar: no baja tu plata hasta que la marques como pagada. */
const isUnpaidBill = (e: Expense) => e.source === 'importado' && /^Factura /.test(e.notes ?? '') && !e.paid;

export function cashStatus(data: Pick<DataSet, 'expenses' | 'cardPayments' | 'settings'> & Partial<Pick<DataSet, 'sancor' | 'incomes'>> & { goal?: { contributions: Contribution[] } }, todayIso: string): CashStatus | null {
  const c = data.settings.cash;
  if (!c) return null;
  const since = c.setAt.slice(0, 10);
  // Un pago marcado después cuenta desde que se marcó (paidAt), aunque su vencimiento sea otro día.
  const counted = data.expenses.filter((e) => !e.deleted && !isUnpaidBill(e) && (e.paidAt ?? e.createdAt) > c.setAt && (!!e.paidAt || e.date >= since) && e.paymentMethod !== 'tarjeta' && !e.provisional && !e.cashAdjust);
  // Lo que separaste para ahorrar (viaje) también sale de tu plata.
  const saved = (data.goal?.contributions ?? []).filter((x) => x.at && x.at > c.setAt && x.date >= since);
  const payments = data.cardPayments.filter((p) => !p.deleted && p.createdAt > c.setAt && p.date >= since);
  const items = [
    ...counted.map((e) => ({ concept: e.concept, amount: outOfPocket(e), date: e.date })),
    ...payments.map((p) => ({ concept: `Pago del resumen de ${p.entity}`, amount: p.amount, date: p.date })),
    ...saved.map((x) => ({ concept: 'Ahorro para el viaje', amount: x.amount, date: x.date })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const spent = sum(items.map((i) => i.amount));
  // Lo que te devuelve tu pareja (Sancor) después de anotar tu plata: vuelve a tu bolsillo.
  const back = (data.sancor ?? []).filter((x) => !x.deleted).flatMap((x) => x.received.filter((r) => r.date > since || (r.date === since && (r.at ?? '') > c.setAt)));
  // Lo que te devolvieron por gastos que te reintegran (p. ej. el hospital) después de anotar tu plata.
  const refunded = sum((data.expenses ?? []).filter((e) => !e.deleted && e.refund?.status === 'devuelto' && (e.refund.receivedAt ?? '') > c.setAt).map((e) => e.refund!.receivedAmount ?? e.refund!.amount));
  const returned = sum(back.map((r) => r.amount)) + refunded;
  // Otros ingresos anotados después (widget "+ Ingreso", Ingresos → ingresos adicionales). Los anotados
  // antes de que existiera la fecha de cada renglón cuentan si el registro del mes se creó después.
  const ingresos = sum(
    (data.incomes ?? [])
      .filter((i) => !i.deleted)
      .flatMap((i) => i.extras.filter((x) => x.amount > 0 && (x.at ? x.at > c.setAt : i.createdAt > c.setAt)).map((x) => x.amount)),
  );
  // El sueldo cargado después de anotar tu plata entra entero; lo que vas pagando se descuenta de ahí.
  const paychecks = (data.incomes ?? []).filter((i) => !i.deleted && i.status === 'confirmado' && i.amountReceived > 0 && !!i.salaryAt && i.salaryAt > c.setAt);
  const salary = sum(paychecks.map((i) => i.amountReceived));
  let until = c.until;
  if (paychecks.length) {
    const next = paydayOf(addMonths(paychecks.map((i) => i.month).sort().at(-1)!, 1), data.settings);
    if (!until || until < next) until = next;
  }
  const left = c.amount - spent + returned + ingresos + salary;
  const days = until && until >= todayIso ? daysBetween(todayIso, until) + 1 : undefined;
  return { start: c.amount, spent, returned, ingresos, salary, left, items, days, perDay: days ? Math.floor(Math.max(0, left) / days) : undefined, until };
}
