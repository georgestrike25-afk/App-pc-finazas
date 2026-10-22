import { addMonths, type MonthKey } from './dates';
import { occurrencesForMonth } from './expenses';
import { incomeNet } from './income';
import { sum, type Cents } from './money';
import type { DataSet } from './monthly';
import { buildSchedule, debtByEntity, entityGroup } from './obligations';
import type { Expense } from './types';

export interface CapacityMonth {
  month: MonthKey;
  income: Cents;
  fixed: Cents;
  /** true si los gastos fijos se estimaron con el promedio de los últimos meses. */
  fixedEstimated: boolean;
  debts: Cents;
  /** Ahorro posible gastando el máximo del presupuesto diario (el peor caso) y el mínimo (el mejor). */
  saveLow: Cents;
  saveHigh: Cents;
  /** Cuánto menos de deudas que el mes actual: plata que se libera. */
  freed: Cents;
  /** Deudas que terminan de pagarse el mes anterior (desde este mes ya no se pagan). */
  ended: string[];
}

export interface Capacity {
  income: Cents;
  incomeSource: 'configurado' | 'ultimo_cobro' | 'sin_dato';
  budget: { min: Cents; max: Cents };
  months: CapacityMonth[];
}

/** Gasto fijo: lo del hogar (tu parte), lo de la planilla compartida y lo que se repite todos los meses. */
const isFixed = (e: Expense) => e.kind === 'hogar' || e.frequency !== 'unica' || (e.linkedLineFingerprints ?? []).some((f) => f.startsWith('planilla|'));

/**
 * Cuánto se podría ahorrar cada mes: ingreso − gastos fijos − cuotas, préstamos y resúmenes − presupuesto
 * del día a día (entre el mínimo y el máximo). A medida que terminan las deudas, el ahorro posible sube.
 */
export function savingsCapacity(data: DataSet, today: MonthKey, count = 12): Capacity {
  const s = data.settings;
  const budget = s.dailyBudgetRange ?? { min: Math.min(60_000_000, s.dailyBudgetDefault), max: s.dailyBudgetDefault };
  const lastIncome = data.incomes.filter((i) => !i.deleted && i.status === 'confirmado').sort((a, b) => b.month.localeCompare(a.month))[0];
  const income = s.projectedMonthlyIncome || (lastIncome ? incomeNet(lastIncome) : 0);
  const incomeSource = s.projectedMonthlyIncome ? 'configurado' : lastIncome ? 'ultimo_cobro' : 'sin_dato';

  const fixedOf = (m: MonthKey) => {
    const occ = occurrencesForMonth(data.expenses.filter((e) => !e.deleted && isFixed(e)), m);
    return { total: sum(occ.map((o) => o.userShare)), n: occ.length };
  };
  // Promedio de los últimos 3 meses con gastos fijos cargados (para los meses que todavía no tienen).
  const past = Array.from({ length: 6 }, (_, i) => fixedOf(addMonths(today, -i))).filter((f) => f.n > 0).slice(0, 3);
  const avgFixed = past.length ? Math.round(sum(past.map((f) => f.total)) / past.length) : 0;

  const debts = debtByEntity(data.obligations, today, data);
  const debtIn = (m: MonthKey) => sum(debts.map((d) => d.byMonth[m] ?? 0));
  // Se proyecta desde el mes que viene (el actual ya tiene cuotas pagadas y el sueldo cobrado).
  const first = addMonths(today, 1);
  const base = debtIn(first);
  // Última cuota de cada deuda, para avisar cuándo termina.
  const lastOf = data.obligations
    .filter((o) => !o.deleted && o.status !== 'cancelada')
    .map((o) => ({ name: `${o.concept} (${entityGroup(o.entity)})`, last: buildSchedule(o, today).at(-1)?.month }))
    .filter((x): x is { name: string; last: MonthKey } => !!x.last);

  const months: CapacityMonth[] = [];
  for (let i = 0; i < count; i++) {
    const m = addMonths(first, i);
    const f = fixedOf(m);
    const fixed = f.n > 0 ? f.total : avgFixed;
    const d = debtIn(m);
    const free = income - fixed - d;
    months.push({
      month: m,
      income,
      fixed,
      fixedEstimated: f.n === 0 && avgFixed > 0,
      debts: d,
      saveLow: free - budget.max,
      saveHigh: free - budget.min,
      freed: Math.max(0, base - d),
      ended: lastOf.filter((x) => addMonths(x.last, 1) === m).map((x) => x.name),
    });
  }
  return { income, incomeSource, budget, months };
}
