import { DEFAULT_CATEGORIES } from '../importers/classify';
import { DEFAULT_SCENARIOS } from '../domain/savings';
import type { SavingsGoal, Settings } from '../domain/types';

export const SETTINGS_ID = 'app';
export const GOAL_ID = 'viaje-abril-2027';

/** Presupuesto cotidiano orientativo inicial: $700.000 (valor editable, NO es un gasto). */
export const INITIAL_DAILY_BUDGET = 700_000_00;

export function defaultSettings(nowIso: string): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: nowIso,
    // Fecha fija antigua: cualquier ajuste real del usuario (en cualquier dispositivo) gana en una fusión.
    updatedAt: '1970-01-01T00:00:00.000Z',
    dailyBudgetDefault: INITIAL_DAILY_BUDGET,
    dailyBudgetIsInitialValue: true,
    monthBudgets: {},
    defaultUserPct: 50,
    sancorPartnerPct: 50,
    projectedMonthlyIncome: 0,
    partnerName: 'Pareja',
    storeDocumentBlobs: true,
    categories: [...DEFAULT_CATEGORIES],
  };
}

/** Objetivo de viaje inicial: todos los importes en $0, editables. */
export function defaultGoal(nowIso: string): SavingsGoal {
  return {
    id: GOAL_ID,
    createdAt: nowIso,
    updatedAt: '1970-01-01T00:00:00.000Z',
    name: 'Viaje de abril de 2027',
    targetMonth: '2027-04',
    estimatedCost: 0,
    initialSaving: 0,
    plannedMonthlyContribution: 0,
    reserved: 0,
    reinvestPct: 0,
    contributions: [],
    scenarios: DEFAULT_SCENARIOS.map((s) => ({ ...s })),
  };
}
