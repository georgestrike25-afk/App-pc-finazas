import { describe, expect, it } from 'vitest';
import { monthChecklist } from '../../src/domain/checklist';
import { emptyData, obligation } from './helpers';

describe('lista de "Este mes": cuotas de préstamos', () => {
  const data = () => ({ ...emptyData(), obligations: [obligation({ id: 'p', type: 'prestamo', concept: 'Préstamo de prueba', paidInstallments: 2, totalInstallments: 12, installmentAmount: 1000000, nextDueMonth: '2026-11', dueDates: { 3: '2026-11-05' } })] });

  it('antes del vencimiento queda pendiente (no pagada) y se puede marcar', () => {
    const it = monthChecklist(data(), '2026-11', '2026-11-03').find((i) => i.key === 'cuota-p')!;
    expect(it.title).toMatch(/^Pagar la cuota 3 de Préstamo de prueba \(\$\s10\.000,00\)$/);
    expect(it).toMatchObject({ done: false, detail: 'Vence el 05/11/2026.', payInstallment: { obligationId: 'p', n: 3 } });
  });

  it('solo con el pago registrado queda tildada', () => {
    const d = data();
    d.obligations[0] = { ...d.obligations[0], paidInstallments: 3, nextDueMonth: '2026-12' };
    expect(monthChecklist(d, '2026-11', '2026-11-03').find((i) => i.key === 'cuota-p')).toMatchObject({ done: true, title: 'Cuota 3 de Préstamo de prueba pagada' });
  });
});
