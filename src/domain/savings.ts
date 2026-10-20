import { addMonths, monthDiff, type MonthKey } from './dates';
import { computeMonth, type DataSet } from './monthly';
import { percentOf, sum, type Cents } from './money';
import type { SavingsGoal, Scenario } from './types';

export const DEFAULT_SCENARIOS: Scenario[] = [
  { key: 'conservador', label: 'Conservador', incomeFactor: 0.9, expenseFactor: 1.1 },
  { key: 'intermedio', label: 'Intermedio', incomeFactor: 1, expenseFactor: 1 },
  { key: 'optimista', label: 'Optimista', incomeFactor: 1.05, expenseFactor: 0.95 },
];

export interface ProjectionMonth {
  month: MonthKey;
  income: Cents;
  incomeSource: 'confirmado' | 'estimado' | 'sin_dato';
  expenses: Cents;
  obligations: Cents;
  available: Cents;
  freed: Cents;
  contribution: Cents;
  contributionKind: 'real' | 'proyectado';
  /** El aporte planificado se redujo porque el saldo proyectado no alcanza. */
  capped: boolean;
  accumulated: Cents;
}

export interface Projection {
  scenario: Scenario;
  months: ProjectionMonth[];
  currentProgress: Cents;
  finalAccumulated: Cents;
  missing: Cents;
  reachable: boolean;
  /** Aporte mensual necesario desde el mes actual para llegar al objetivo. */
  requiredMonthly: Cents;
  monthsRemaining: number;
  warnings: string[];
}

export function goalProgress(goal: SavingsGoal): Cents {
  return goal.initialSaving + goal.reserved + sum(goal.contributions.map((c) => c.amount));
}

/**
 * Proyección acumulada mes a mes hasta el mes anterior al objetivo.
 * - Usa ingresos confirmados cuando existen; si no, la estimación del mes o la
 *   estimación general configurada, afectada por el factor del escenario.
 * - Las cuotas se restan solo en los meses en que corresponden.
 * - El dinero liberado por cuotas finalizadas NO se ahorra automáticamente: solo
 *   se suma el porcentaje de reinversión configurado.
 * - El aporte nunca supera el saldo disponible proyectado del mes.
 */
export function projectGoal(data: DataSet, goal: SavingsGoal, today: MonthKey, scenario: Scenario): Projection {
  const warnings: string[] = [];
  const monthsRemaining = Math.max(0, monthDiff(today, goal.targetMonth));
  const prior = sum(goal.contributions.filter((c) => c.month < today).map((c) => c.amount));
  let acc = goal.initialSaving + goal.reserved + prior;
  const baseObligations = computeMonth(data, today, today).sections.find((s) => s.key === 'obligaciones')!.total;
  const months: ProjectionMonth[] = [];

  for (let i = 0; i < monthsRemaining; i++) {
    const m = addMonths(today, i);
    const r = computeMonth(data, m, today);
    const get = (k: string) => r.sections.find((s) => s.key === k)!.total;
    const isFuture = m > today;
    const confirmedIncome = r.incomeStatus === 'confirmado';
    const rawIncome = confirmedIncome ? get('ingresos') : get('ingresos') + r.estimatedIncome;
    const income = confirmedIncome ? rawIncome : Math.round(rawIncome * scenario.incomeFactor);
    const nonObligation = get('fijos') + get('personales') + get('cotidiano');
    const expenses = isFuture ? Math.round(nonObligation * scenario.expenseFactor) : nonObligation;
    const obligations = get('obligaciones');
    const available = income - expenses - obligations;
    const freed = Math.max(0, baseObligations - obligations);

    const real = goal.contributions.filter((c) => c.month === m);
    let contribution: Cents;
    let capped = false;
    let kind: ProjectionMonth['contributionKind'] = 'proyectado';
    if (real.length) {
      contribution = sum(real.map((c) => c.amount));
      kind = 'real';
    } else {
      const planned = goal.plannedMonthlyContribution + percentOf(freed, goal.reinvestPct);
      contribution = Math.min(planned, Math.max(0, available));
      capped = contribution < planned;
    }
    acc += contribution;
    months.push({
      month: m,
      income,
      incomeSource: confirmedIncome ? 'confirmado' : r.estimatedIncome > 0 ? 'estimado' : 'sin_dato',
      expenses,
      obligations,
      available,
      freed,
      contribution,
      contributionKind: kind,
      capped,
      accumulated: acc,
    });
  }

  if (months.some((m) => m.incomeSource === 'sin_dato'))
    warnings.push('Hay meses sin ingreso cargado ni estimado: configure un ingreso mensual estimado para proyectar.');
  if (months.some((m) => m.capped))
    warnings.push('En algunos meses el saldo proyectado no alcanza para el aporte planificado.');
  if (goal.estimatedCost <= 0) warnings.push('Configure el costo estimado del viaje.');
  if (monthsRemaining === 0) warnings.push(`La fecha objetivo (${goal.targetMonth}) ya llegó o pasó.`);

  const currentProgress = goalProgress(goal);
  const missing = Math.max(0, goal.estimatedCost - currentProgress);
  const requiredMonthly = monthsRemaining > 0 ? Math.ceil(missing / monthsRemaining) : missing;
  return {
    scenario,
    months,
    currentProgress,
    finalAccumulated: acc,
    missing,
    reachable: goal.estimatedCost > 0 && acc >= goal.estimatedCost,
    requiredMonthly,
    monthsRemaining,
    warnings,
  };
}
