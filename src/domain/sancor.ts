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

/** Reintegros recibidos en un mes (por fecha de cobro), de todos los cargos. */
export function reimbursementsReceivedInMonth(charges: SancorCharge[], month: MonthKey) {
  return charges
    .filter((c) => !c.deleted)
    .flatMap((c) => c.received.filter((r) => monthOf(r.date) === month).map((r) => ({ charge: c, r })));
}
