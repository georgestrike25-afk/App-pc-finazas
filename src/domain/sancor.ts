import { monthOf, type MonthKey } from './dates';
import { percentOf, sum, type Cents } from './money';
import type { SancorCharge } from './types';

export const SANCOR_PATTERN = /sancor/i;

export interface SancorSummary {
  /** Lo que exige la tarjeta: nunca se reduce por reintegros. */
  cardAmount: Cents;
  /** Reintegro que corresponde recuperar según el acuerdo. */
  expected: Cents;
  received: Cents;
  pending: Cents;
  /** Costo neto estimado del usuario si se cobra todo lo esperado. */
  netEstimated: Cents;
  /** Costo neto con lo efectivamente recibido hasta hoy. */
  netWithReceived: Cents;
}

export function sancorSummary(c: SancorCharge): SancorSummary {
  const expected = percentOf(c.chargeAmount, c.partnerPct);
  const received = sum(c.received.map((r) => r.amount));
  return {
    cardAmount: c.chargeAmount,
    expected,
    received,
    pending: Math.max(0, expected - received),
    netEstimated: c.chargeAmount - expected,
    netWithReceived: c.chargeAmount - received,
  };
}

/** Cupones del cargo (los cargos viejos o manuales son un solo cupón). */
export function chargeCoupons(c: SancorCharge): Array<{ amount: Cents; ref?: string }> {
  return c.coupons?.length ? c.coupons : [{ amount: c.chargeAmount }];
}

/** Si lo que devuelve la pareja es exactamente uno de los cupones, cuál (para explicarlo). */
export function partnerCoupon(c: SancorCharge): { amount: Cents; ref?: string } | undefined {
  const cs = chargeCoupons(c);
  if (cs.length < 2) return undefined;
  const expected = percentOf(c.chargeAmount, c.partnerPct);
  return cs.find((k) => Math.abs(k.amount - expected) <= 1);
}

/** Porcentaje exacto para que la pareja devuelva un cupón entero. */
export function pctForCoupon(c: SancorCharge, amount: Cents): number {
  return c.chargeAmount > 0 ? Math.round((amount / c.chargeAmount) * 1_000_000) / 10_000 : 0;
}

/**
 * Los cupones de Sancor de un mismo resumen forman un solo cargo: la tarjeta cobra
 * los dos y la pareja devuelve su parte del total. Devuelve qué cargos unir.
 */
export function couponMerges(charges: SancorCharge[]): Array<{ keep: SancorCharge; merged: SancorCharge; remove: SancorCharge[] }> {
  const groups = new Map<string, SancorCharge[]>();
  for (const c of charges) {
    if (c.deleted) continue;
    const src = c.statementId ?? c.documentId;
    if (!src) continue;
    const k = `${c.month}|${src}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: Array<{ keep: SancorCharge; merged: SancorCharge; remove: SancorCharge[] }> = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    // Elección determinística: dos dispositivos que unen por separado llegan al mismo resultado.
    const [keep, ...rest] = [...g].sort((a, b) => a.id.localeCompare(b.id));
    const coupons = g.flatMap(chargeCoupons);
    out.push({
      keep,
      remove: rest,
      merged: { ...keep, chargeAmount: sum(coupons.map((k) => k.amount)), coupons, received: g.flatMap((c) => c.received), notes: keep.notes ?? rest.find((c) => c.notes)?.notes },
    });
  }
  return out;
}

/** Reintegros recibidos en un mes (por fecha de cobro), de todos los cargos. */
export function reimbursementsReceivedInMonth(charges: SancorCharge[], month: MonthKey) {
  return charges
    .filter((c) => !c.deleted)
    .flatMap((c) => c.received.filter((r) => monthOf(r.date) === month).map((r) => ({ charge: c, r })));
}
