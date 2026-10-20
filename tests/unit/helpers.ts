import { FinanzasDB } from '../../src/db/db';
import { setDb } from '../../src/db/db';
import { ensureInitialized } from '../../src/db/repo';
import { defaultSettings } from '../../src/db/defaults';
import type { DataSet } from '../../src/domain/monthly';
import type { Expense, Income, Obligation } from '../../src/domain/types';

let n = 0;
export async function freshDb(): Promise<FinanzasDB> {
  const db = new FinanzasDB(`test-${Date.now()}-${n++}`);
  setDb(db);
  await ensureInitialized(db);
  return db;
}

const T = '2026-01-01T00:00:00.000Z';
export function emptyData(): DataSet {
  return { incomes: [], expenses: [], obligations: [], statements: [], cardPayments: [], sancor: [], settings: defaultSettings(T) };
}

export function income(p: Partial<Income> & Pick<Income, 'month' | 'amountReceived'>): Income {
  return { id: `inc-${p.month}-${n++}`, createdAt: T, updatedAt: T, status: 'confirmado', extras: [], deductions: [], revisions: [], ...p };
}

export function expense(p: Partial<Expense> & Pick<Expense, 'month' | 'totalAmount' | 'kind'>): Expense {
  return {
    id: `exp-${n++}`,
    createdAt: T,
    updatedAt: T,
    category: 'Otros',
    concept: 'Gasto de prueba',
    date: `${p.month}-10`,
    userPct: 100,
    paid: true,
    frequency: 'unica',
    paymentMethod: 'efectivo',
    source: 'manual',
    ...p,
  };
}

export function obligation(p: Partial<Obligation>): Obligation {
  return {
    id: `ob-${n++}`,
    createdAt: T,
    updatedAt: T,
    entity: 'Banco de prueba',
    type: 'compra_cuotas',
    concept: 'Compra de prueba',
    paidInstallments: 0,
    frequency: 'mensual',
    status: 'pendiente',
    variableAmount: false,
    revisions: [],
    ...p,
  };
}
