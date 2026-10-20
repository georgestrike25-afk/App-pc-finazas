import { monthOf, type MonthKey } from './dates';
import { occurrencesForMonth } from './expenses';
import { incomeNet } from './income';
import { sum, type Cents } from './money';
import { installmentsForMonth, obligationIssues } from './obligations';
import { reimbursementsReceivedInMonth, sancorSummary } from './sancor';
import type { CardPayment, Expense, Income, Obligation, SancorCharge, Settings, Statement } from './types';

export interface DataSet {
  incomes: Income[];
  expenses: Expense[];
  obligations: Obligation[];
  statements: Statement[];
  cardPayments: CardPayment[];
  sancor: SancorCharge[];
  settings: Settings;
}

export interface CalcLine {
  label: string;
  amount: Cents;
  estimated?: boolean;
  note?: string;
  ref?: { table: string; id: string };
}

export interface CalcSection {
  key: 'ingresos' | 'fijos' | 'personales' | 'cotidiano' | 'obligaciones';
  title: string;
  sign: 1 | -1;
  lines: CalcLine[];
  total: Cents;
}

export interface MonthlyResult {
  month: MonthKey;
  sections: CalcSection[];
  /** Ingresos cobrados − fijos − personales − cotidiano − obligaciones. */
  available: Cents;
  /** Igual que available pero usando ingreso estimado si no hay cobrado. */
  projectedAvailable: Cents;
  incomeStatus: 'confirmado' | 'estimado' | 'sin_cargar';
  estimatedIncome: Cents;
  hasEstimates: boolean;
  info: {
    cardPayments: CardPayment[];
    cardPaymentsTotal: Cents;
    statements: Statement[];
    statementsTotal: Cents;
    sancorExpected: Cents;
    sancorReceived: Cents;
    sancorPending: Cents;
    dailyBudget: Cents;
    dailyRegistered: Cents;
    dailyEstimatedRemainder: Cents;
    dailyMode: 'real' | 'estimado';
    dailyBudgetIsInitialValue: boolean;
  };
  warnings: string[];
}

export function budgetForMonth(settings: Settings, month: MonthKey, today: MonthKey) {
  const mb = settings.monthBudgets?.[month];
  return {
    amount: mb?.amount ?? settings.dailyBudgetDefault,
    mode: mb?.mode ?? (month >= today ? 'estimado' : 'real'),
    isInitialValue: !mb && settings.dailyBudgetIsInitialValue,
  } as const;
}

/**
 * Calculadora mensual transparente. Reglas para evitar dobles cómputos:
 * - Los consumos con tarjeta se imputan como gasto una sola vez (en su mes de imputación).
 * - Los pagos de resumen NO se restan: cancelan consumos ya imputados (se muestran como información).
 * - El total de un resumen es informativo: no se convierte en deuda.
 * - El cargo de Sancor se resta completo; el reintegro esperado se muestra aparte y
 *   solo el reintegro efectivamente recibido suma como ingreso.
 * - El presupuesto cotidiano solo completa la parte aún no registrada (nunca se suma
 *   junto con los mismos gastos reales).
 */
export function computeMonth(data: DataSet, month: MonthKey, today: MonthKey): MonthlyResult {
  const warnings: string[] = [];
  const live = <T extends { deleted?: boolean }>(xs: T[]) => xs.filter((x) => !x.deleted);
  const incomes = live(data.incomes).filter((i) => i.month === month);
  const confirmed = incomes.filter((i) => i.status === 'confirmado');
  const estimatedRecs = incomes.filter((i) => i.status === 'estimado');

  // 1. Ingresos cobrados
  const incomeLines: CalcLine[] = confirmed.map((i) => ({
    label: `Ingreso cobrado${i.receivedDate ? ` (${i.receivedDate.split('-').reverse().join('/')})` : ''}`,
    amount: incomeNet(i),
    note: i.extras.length || i.deductions.length ? 'Neto: principal + adicionales − deducciones' : undefined,
    ref: { table: 'incomes', id: i.id },
  }));
  const sancorLive = live(data.sancor);
  for (const { charge, r } of reimbursementsReceivedInMonth(sancorLive, month)) {
    incomeLines.push({
      label: 'Reintegro Sancor Salud recibido',
      amount: r.amount,
      note: `Corresponde al cargo de ${charge.month}`,
      ref: { table: 'sancor', id: charge.id },
    });
  }
  const incomeStatus = confirmed.length ? 'confirmado' : estimatedRecs.length ? 'estimado' : 'sin_cargar';
  const estimatedIncome = estimatedRecs.length
    ? sum(estimatedRecs.map(incomeNet))
    : data.settings.projectedMonthlyIncome;
  if (incomeStatus === 'sin_cargar') warnings.push('El ingreso de este mes todavía no fue cargado.');
  if (incomeStatus === 'estimado')
    warnings.push('El ingreso de este mes es una estimación: no se incluye como ingreso cobrado.');

  // 2-4. Gastos
  const occ = occurrencesForMonth(live(data.expenses), month);
  const fixedLines: CalcLine[] = occ
    .filter((o) => o.kind === 'hogar')
    .map((o) => ({
      label: `${o.concept} (${o.userPct} % de ${fmtShort(o.total)})`,
      amount: o.userShare,
      estimated: o.estimated,
      note: o.estimated ? 'Gasto recurrente: importe del mes no confirmado' : undefined,
      ref: { table: 'expenses', id: o.expenseId },
    }));
  const sancorMonth = sancorLive.filter((c) => c.month === month);
  for (const c of sancorMonth) {
    fixedLines.push({
      label: 'Sancor Salud (cargo total en tarjeta)',
      amount: c.chargeAmount,
      note: `Reintegro esperado de la pareja: ${fmtShort(sancorSummary(c).expected)} (se muestra aparte)`,
      ref: { table: 'sancor', id: c.id },
    });
  }
  const personalLines: CalcLine[] = occ
    .filter((o) => o.kind === 'personal')
    .map((o) => ({ label: o.concept, amount: o.userShare, estimated: o.estimated, ref: { table: 'expenses', id: o.expenseId } }));

  const dailyOcc = occ.filter((o) => o.kind === 'cotidiano');
  const dailyRegistered = sum(dailyOcc.map((o) => o.userShare));
  const budget = budgetForMonth(data.settings, month, today);
  const remainder = budget.mode === 'estimado' ? Math.max(0, budget.amount - dailyRegistered) : 0;
  const dailyLines: CalcLine[] = dailyOcc.map((o) => ({
    label: `${o.concept} (${o.category})`,
    amount: o.userShare,
    estimated: o.estimated,
    ref: { table: 'expenses', id: o.expenseId },
  }));
  if (remainder > 0) {
    dailyLines.push({
      label: 'Presupuesto cotidiano aún no registrado (estimación)',
      amount: remainder,
      estimated: true,
      note: `Presupuesto ${fmtShort(budget.amount)} − registrado ${fmtShort(dailyRegistered)}`,
    });
  }
  if (budget.mode === 'real' && dailyRegistered === 0 && month < today)
    warnings.push('No hay gastos cotidianos registrados para este mes.');
  if (dailyRegistered > budget.amount && budget.amount > 0)
    warnings.push('Los gastos cotidianos registrados superan el presupuesto del mes.');

  // 5. Obligaciones financieras
  const obs = live(data.obligations);
  const inst = installmentsForMonth(obs, month, today);
  const obligationLines: CalcLine[] = inst.map((i) => ({
    label: `${i.entity ? `${i.entity} · ` : ''}${i.concept} — cuota ${i.n}${i.total ? `/${i.total}` : ''}`,
    amount: i.amount ?? 0,
    estimated: i.estimated,
    note:
      i.amount === undefined
        ? 'Importe desconocido: complete el dato'
        : i.status === 'vencida'
          ? 'Cuota vencida sin registrar pago'
          : i.status === 'pagada'
            ? 'Pagada'
            : undefined,
    ref: { table: 'obligations', id: i.obligationId },
  }));
  if (inst.some((i) => i.amount === undefined)) warnings.push('Hay cuotas sin importe: el resultado está incompleto.');
  for (const ob of obs) {
    const iss = obligationIssues(ob).filter((x) => x.code === 'sin_total' || x.code === 'sin_vencimiento' || x.code === 'por_confirmar');
    if (iss.length && inst.some((i) => i.obligationId === ob.id))
      warnings.push(`${ob.concept}: ${iss.map((x) => x.message).join(' ')}`);
  }

  const sections: CalcSection[] = [
    mk('ingresos', 'Ingresos cobrados', 1, incomeLines),
    mk('fijos', 'Gastos fijos atribuibles al usuario', -1, fixedLines),
    mk('personales', 'Gastos personales', -1, personalLines),
    mk('cotidiano', 'Gastos cotidianos imputados', -1, dailyLines),
    mk('obligaciones', 'Obligaciones financieras del mes', -1, obligationLines),
  ];
  const outflows = sum(sections.filter((s) => s.sign === -1).map((s) => s.total));
  const incomeTotal = sections[0].total;
  const available = incomeTotal - outflows;
  const projectedAvailable = (incomeStatus === 'confirmado' ? incomeTotal : incomeTotal + estimatedIncome) - outflows;

  // Información separada (no interviene en el saldo)
  const cardPayments = live(data.cardPayments).filter((p) => p.month === month);
  const statements = live(data.statements).filter((s) => s.month === month);
  let sExpected = 0;
  let sReceived = 0;
  let sPending = 0;
  for (const c of sancorMonth) {
    const s = sancorSummary(c);
    sExpected += s.expected;
    sReceived += s.received;
    sPending += s.pending;
  }
  if (sPending > 0) warnings.push('Hay reintegros de Sancor Salud pendientes de cobro (no incluidos en el saldo).');

  const hasEstimates = sections.some((s) => s.lines.some((l) => l.estimated));
  return {
    month,
    sections,
    available,
    projectedAvailable,
    incomeStatus,
    estimatedIncome,
    hasEstimates,
    info: {
      cardPayments,
      cardPaymentsTotal: sum(cardPayments.map((p) => p.amount)),
      statements,
      statementsTotal: sum(statements.map((s) => s.total)),
      sancorExpected: sExpected,
      sancorReceived: sReceived,
      sancorPending: sPending,
      dailyBudget: budget.amount,
      dailyRegistered,
      dailyEstimatedRemainder: remainder,
      dailyMode: budget.mode,
      dailyBudgetIsInitialValue: budget.isInitialValue,
    },
    warnings,
  };
}

function mk(key: CalcSection['key'], title: string, sign: 1 | -1, lines: CalcLine[]): CalcSection {
  return { key, title, sign, lines, total: sum(lines.map((l) => l.amount)) };
}

function fmtShort(c: Cents): string {
  return `$${(c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Utilidad para listar meses con datos (para historial y gráficos). */
export function monthsWithData(data: DataSet): MonthKey[] {
  const set = new Set<MonthKey>();
  data.incomes.filter((i) => !i.deleted).forEach((i) => set.add(i.month));
  data.expenses.filter((e) => !e.deleted).forEach((e) => set.add(e.month));
  data.sancor.filter((s) => !s.deleted).forEach((s) => set.add(s.month));
  data.cardPayments.filter((p) => !p.deleted).forEach((p) => set.add(monthOf(p.date)));
  return [...set].sort();
}
