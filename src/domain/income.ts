import { sum, type Cents } from './money';
import type { Income } from './types';

export function incomeNet(i: Pick<Income, 'amountReceived' | 'extras' | 'deductions'>): Cents {
  return i.amountReceived + sum(i.extras.map((e) => e.amount)) - sum(i.deductions.map((d) => d.amount));
}

function snapshot(i: Income): Omit<Income, 'revisions'> {
  const { revisions: _r, ...rest } = i;
  return structuredClone(rest);
}

/** Actualiza un ingreso conservando la versión anterior en su historial. */
export function reviseIncome(prev: Income, changes: Partial<Omit<Income, 'id' | 'revisions'>>, nowIso: string): Income {
  return {
    ...prev,
    ...changes,
    updatedAt: nowIso,
    revisions: [...(prev.revisions ?? []), { at: nowIso, snapshot: snapshot(prev) }],
  };
}
