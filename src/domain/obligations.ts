import { addMonths, monthDiff, type MonthKey } from './dates';
import { sum, type Cents } from './money';
import { conceptSimilarity, normalizeText } from './text';
import type { Frequency, Obligation, ObligationStatus } from './types';

export interface Installment {
  obligationId: string;
  n: number;
  total?: number;
  month: MonthKey;
  amount?: Cents;
  estimated: boolean;
  status: 'pagada' | 'pendiente' | 'vencida' | 'cancelada';
  concept: string;
  entity: string;
}

export const FREQ_STEP: Record<Exclude<Frequency, 'unica'>, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  anual: 12,
};

export const OBLIGATION_TYPE_LABEL: Record<Obligation['type'], string> = {
  compra_cuotas: 'Compra en cuotas',
  plan_v: 'Plan V',
  prestamo: 'Préstamo',
  financiacion: 'Financiación de línea de crédito',
  refinanciacion: 'Refinanciación',
  otro: 'Otra obligación',
};

export interface ObligationIssue {
  code: 'sin_total' | 'sin_importe' | 'sin_vencimiento' | 'por_confirmar' | 'variable';
  message: string;
}

/** Datos faltantes o inciertos que impiden una proyección exacta. */
export function obligationIssues(ob: Obligation): ObligationIssue[] {
  const issues: ObligationIssue[] = [];
  if (!ob.totalInstallments)
    issues.push({ code: 'sin_total', message: 'Falta la cantidad total de cuotas: solo se proyecta la próxima cuota.' });
  if (ob.installmentAmount === undefined)
    issues.push({ code: 'sin_importe', message: 'Falta el importe de la cuota.' });
  if (!ob.nextDueMonth)
    issues.push({ code: 'sin_vencimiento', message: 'Falta el mes de vencimiento de la próxima cuota.' });
  if (ob.status === 'por_confirmar')
    issues.push({ code: 'por_confirmar', message: 'Obligación por confirmar: la proyección es estimada.' });
  if (ob.variableAmount)
    issues.push({ code: 'variable', message: 'Importe variable: las cuotas futuras son estimadas.' });
  return issues;
}

/**
 * Genera el calendario de cuotas de una obligación.
 * - Las cuotas 1..paidInstallments figuran como pagadas.
 * - La cuota paidInstallments+1 vence en nextDueMonth; las siguientes, según la frecuencia.
 * - Si la obligación fue cancelada desde un mes, las cuotas desde ese mes quedan canceladas
 *   (los meses anteriores no se modifican).
 */
export function buildSchedule(ob: Obligation, today: MonthKey): Installment[] {
  if (ob.deleted) return [];
  const step = FREQ_STEP[ob.frequency] ?? 1;
  const out: Installment[] = [];
  const base = {
    obligationId: ob.id,
    total: ob.totalInstallments,
    concept: ob.concept,
    entity: ob.entity,
  };
  const amountFor = (n: number): { amount?: Cents; estimated: boolean } => {
    const ov = ob.installmentOverrides?.[n];
    if (ov !== undefined) return { amount: ov, estimated: false };
    return {
      amount: ob.installmentAmount,
      estimated: ob.variableAmount || ob.installmentAmount === undefined || ob.status === 'por_confirmar',
    };
  };

  if (ob.nextDueMonth) {
    for (let n = 1; n <= ob.paidInstallments; n++) {
      out.push({
        ...base,
        n,
        month: addMonths(ob.nextDueMonth, -(ob.paidInstallments - n + 1) * step),
        ...amountFor(n),
        estimated: false,
        status: 'pagada',
      });
    }
  }
  if (!ob.nextDueMonth) return out;

  const lastN = ob.totalInstallments ?? ob.paidInstallments + 1;
  for (let n = ob.paidInstallments + 1; n <= lastN; n++) {
    const month = addMonths(ob.nextDueMonth, (n - ob.paidInstallments - 1) * step);
    const a = amountFor(n);
    let status: Installment['status'];
    if (ob.status === 'pagada') status = 'pagada';
    else if (ob.status === 'cancelada' || (ob.cancelledFrom && month >= ob.cancelledFrom)) status = 'cancelada';
    else if (month < today) status = 'vencida';
    else status = 'pendiente';
    out.push({ ...base, n, month, ...a, estimated: a.estimated || !ob.totalInstallments, status });
  }
  return out;
}

/** Cuotas que corresponden a un mes (excluye canceladas). */
export function installmentsForMonth(obs: Obligation[], month: MonthKey, today: MonthKey): Installment[] {
  return obs.flatMap((o) => buildSchedule(o, today)).filter((i) => i.month === month && i.status !== 'cancelada');
}

/** Cuotas aún no pagadas (pendientes o vencidas). */
export function pendingInstallments(ob: Obligation, today: MonthKey): Installment[] {
  return buildSchedule(ob, today).filter((i) => i.status === 'pendiente' || i.status === 'vencida');
}

export function futureInstallmentCount(ob: Obligation, today: MonthKey): number {
  return pendingInstallments(ob, today).length;
}

/** Saldo pendiente calculado a partir de las cuotas no pagadas. */
export function computedBalance(ob: Obligation, today: MonthKey): { amount: Cents; estimated: boolean; complete: boolean } {
  const p = pendingInstallments(ob, today);
  return {
    amount: sum(p.map((i) => i.amount)),
    estimated: p.some((i) => i.estimated),
    complete: !!ob.totalInstallments && p.every((i) => i.amount !== undefined),
  };
}

export function derivedStatus(ob: Obligation, today: MonthKey): ObligationStatus {
  if (ob.status === 'cancelada' || ob.status === 'pagada') return ob.status;
  if (ob.totalInstallments && ob.paidInstallments >= ob.totalInstallments) return 'pagada';
  const sched = buildSchedule(ob, today);
  if (sched.length && sched.every((i) => i.status === 'cancelada' || i.status === 'pagada')) return 'cancelada';
  if (sched.some((i) => i.status === 'vencida')) return 'vencida';
  return ob.status;
}

function snapshot(ob: Obligation): Omit<Obligation, 'revisions'> {
  const { revisions: _r, ...rest } = ob;
  return structuredClone(rest);
}

/**
 * Modifica una obligación conservando el historial. Las cuotas impagas de
 * meses anteriores a `effectiveFrom` conservan su importe original (se fijan
 * como importes específicos) para no alterar meses anteriores de forma silenciosa.
 */
export function reviseObligation(
  ob: Obligation,
  changes: Partial<Omit<Obligation, 'id' | 'revisions'>>,
  effectiveFrom: MonthKey,
  reason: string,
  nowIso: string,
  today: MonthKey,
): Obligation {
  const overrides: Record<number, Cents> = { ...(ob.installmentOverrides ?? {}) };
  const amountChanges =
    'installmentAmount' in changes || 'variableAmount' in changes || 'nextDueMonth' in changes || 'frequency' in changes;
  if (amountChanges) {
    for (const inst of buildSchedule(ob, today)) {
      if (inst.month < effectiveFrom && inst.amount !== undefined && overrides[inst.n] === undefined) {
        overrides[inst.n] = inst.amount;
      }
    }
  }
  return {
    ...ob,
    ...changes,
    installmentOverrides: { ...overrides, ...(changes.installmentOverrides ?? {}) },
    updatedAt: nowIso,
    revisions: [...(ob.revisions ?? []), { at: nowIso, reason, effectiveFrom, snapshot: snapshot(ob) }],
  };
}

/** Cancela una obligación desde un mes: las cuotas anteriores no se modifican. */
export function cancelObligation(ob: Obligation, fromMonth: MonthKey, nowIso: string, today: MonthKey): Obligation {
  return reviseObligation(ob, { cancelledFrom: fromMonth }, fromMonth, `Cancelación desde ${fromMonth}`, nowIso, today);
}

/** Registra el pago de la próxima cuota. */
export function payNextInstallment(ob: Obligation, nowIso: string, amount?: Cents): Obligation {
  if (!ob.nextDueMonth) return ob;
  const n = ob.paidInstallments + 1;
  const step = FREQ_STEP[ob.frequency] ?? 1;
  const overrides = { ...(ob.installmentOverrides ?? {}) };
  if (amount !== undefined) overrides[n] = amount;
  else if (ob.installmentAmount !== undefined && overrides[n] === undefined) overrides[n] = ob.installmentAmount;
  const paid = n;
  const done = ob.totalInstallments !== undefined && paid >= ob.totalInstallments;
  return {
    ...ob,
    paidInstallments: paid,
    nextDueMonth: addMonths(ob.nextDueMonth, step),
    installmentOverrides: overrides,
    status: done ? 'pagada' : ob.status === 'vencida' ? 'pendiente' : ob.status,
    updatedAt: nowIso,
    revisions: [...(ob.revisions ?? []), { at: nowIso, reason: `Pago de cuota ${n}`, snapshot: snapshot(ob) }],
  };
}

export function obligationFingerprintKey(entity: string, concept: string, total: number | undefined, amount: Cents | undefined, startMonth: MonthKey | undefined): string {
  return [normalizeText(entity), normalizeText(concept), total ?? '?', amount ?? '?', startMonth ?? '?'].join('|');
}

export interface InstallmentCandidate {
  entity: string;
  concept: string;
  n: number;
  total: number;
  amount: Cents;
  /** Mes en que vence la cuota n (mes del resumen). */
  dueMonth: MonthKey;
}

/** Mes de la cuota 1 implicado por una cuota n que vence en dueMonth. */
export function impliedStartMonth(c: { n: number; dueMonth: MonthKey }, step = 1): MonthKey {
  return addMonths(c.dueMonth, -(c.n - 1) * step);
}

/**
 * Busca una obligación existente que corresponda a la misma compra en cuotas
 * (por ejemplo, la cuota 5/10 de un resumen posterior a la cuota 4/10 ya importada).
 */
export function findMatchingObligation(obs: Obligation[], c: InstallmentCandidate): Obligation | undefined {
  const entity = normalizeText(c.entity);
  const start = impliedStartMonth(c);
  let best: { ob: Obligation; score: number } | undefined;
  for (const ob of obs) {
    if (ob.deleted || ob.status === 'cancelada') continue;
    if (entity && normalizeText(ob.entity) && normalizeText(ob.entity) !== entity) continue;
    if (ob.totalInstallments !== c.total) continue;
    if (!ob.nextDueMonth) continue;
    const step = FREQ_STEP[ob.frequency] ?? 1;
    const obStart = addMonths(ob.nextDueMonth, -ob.paidInstallments * step);
    if (Math.abs(monthDiff(obStart, start)) > 1) continue;
    const sim = normalizeText(ob.concept) === normalizeText(c.concept) ? 1 : conceptSimilarity(ob.concept, c.concept);
    if (sim < 0.5) continue;
    const ref = ob.installmentAmount ?? 0;
    const amountOk = ref === 0 || Math.abs(ref - c.amount) <= Math.max(100, Math.abs(ref) * 0.15);
    if (!amountOk) continue;
    const score = sim + (ref === c.amount ? 0.5 : 0);
    if (!best || score > best.score) best = { ob, score };
  }
  return best?.ob;
}

/**
 * Aplica la información de un resumen posterior a una obligación existente
 * sin duplicar cuotas: si el importe de la cuota n difiere, se registra como
 * importe específico (interés variable, ajuste).
 */
export function applyStatementInstallment(ob: Obligation, c: InstallmentCandidate, nowIso: string, markPreviousPaid: boolean): Obligation {
  const step = FREQ_STEP[ob.frequency] ?? 1;
  let next: Obligation = { ...ob, installmentOverrides: { ...(ob.installmentOverrides ?? {}) } };
  if (ob.installmentAmount !== undefined && c.amount !== ob.installmentAmount) {
    next.installmentOverrides![c.n] = c.amount;
  }
  if (markPreviousPaid && c.n - 1 > ob.paidInstallments) {
    next.paidInstallments = c.n - 1;
    next.nextDueMonth = c.dueMonth;
  }
  // Realinea el calendario si el resumen indica otro mes para la cuota n.
  const expectedMonth = next.nextDueMonth ? addMonths(next.nextDueMonth, (c.n - next.paidInstallments - 1) * step) : undefined;
  if (expectedMonth && expectedMonth !== c.dueMonth && c.n > next.paidInstallments) {
    next.nextDueMonth = addMonths(c.dueMonth, -(c.n - next.paidInstallments - 1) * step);
  }
  next = {
    ...next,
    updatedAt: nowIso,
    revisions: [...(ob.revisions ?? []), { at: nowIso, reason: `Actualizada desde resumen: cuota ${c.n}/${c.total}`, snapshot: snapshot(ob) }],
  };
  return next;
}

export interface ObligationProgress {
  /** Número de la próxima cuota a pagar (la "cuota en la que vas"). */
  currentN?: number;
  total?: number;
  paid: number;
  remainingCount: number;
  remainingTotal: Cents;
  remainingCapital?: Cents;
  remainingInterest?: Cents;
  nextAmount?: Cents;
  nextDueDate?: string;
  nextDueMonth?: MonthKey;
  lastDueDate?: string;
  lastDueMonth?: MonthKey;
  paidPct?: number;
  overdueCount: number;
}

/** Resumen de avance de una obligación: cuota actual, cuánto falta y cuándo termina. */
export function obligationProgress(ob: Obligation, today: MonthKey): ObligationProgress {
  const sched = buildSchedule(ob, today);
  const pending = sched.filter((i) => i.status === 'pendiente' || i.status === 'vencida');
  const next = pending[0];
  const last = sched.filter((i) => i.status !== 'cancelada').at(-1);
  const cap = ob.capitalByInstallment;
  const hasCap = !!cap && pending.every((i) => cap[i.n] !== undefined);
  const remainingTotal = sum(pending.map((i) => i.amount));
  const remainingCapital = hasCap ? sum(pending.map((i) => cap![i.n])) : undefined;
  const totalCap = cap ? sum(Object.values(cap)) : undefined;
  return {
    currentN: next?.n,
    total: ob.totalInstallments,
    paid: sched.filter((i) => i.status === 'pagada').length,
    remainingCount: pending.length,
    remainingTotal,
    remainingCapital,
    remainingInterest: remainingCapital !== undefined ? remainingTotal - remainingCapital : undefined,
    nextAmount: next?.amount,
    nextDueDate: next ? ob.dueDates?.[next.n] : undefined,
    nextDueMonth: next?.month,
    lastDueDate: last ? ob.dueDates?.[last.n] : undefined,
    lastDueMonth: last?.month,
    paidPct: remainingCapital !== undefined && totalCap ? Math.round(((totalCap - remainingCapital) / totalCap) * 1000) / 10 : ob.totalInstallments ? Math.round((sched.filter((i) => i.status === 'pagada').length / ob.totalInstallments) * 1000) / 10 : undefined,
    overdueCount: pending.filter((i) => i.status === 'vencida').length,
  };
}
