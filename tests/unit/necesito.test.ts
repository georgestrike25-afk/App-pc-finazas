import { describe, expect, it } from 'vitest';
import { ARCA_DEFAULT_MONTHLY, ARCA_FINGERPRINT, needForMonth } from '../../src/domain/necesito';
import { emptyData, expense, obligation } from './helpers';

const T = '2026-10-01T00:00:00.000Z';
const data = () => {
  const d = emptyData();
  d.obligations = [
    // Compra de la tarjeta (viene en el resumen) y un préstamo personal que se paga aparte.
    obligation({ id: 'c', entity: 'Banco Patagonia', type: 'compra_cuotas', concept: 'Compra', paidInstallments: 1, totalInstallments: 3, installmentAmount: 1000000, nextDueMonth: '2026-11', documentId: 'doc-visa' }),
    obligation({ id: 'p', entity: 'Banco Patagonia', type: 'prestamo', concept: 'Préstamo personal', loanNumber: '1', paidInstallments: 4, totalInstallments: 12, installmentAmount: 500000, nextDueMonth: '2026-11', dueDates: { 5: '2026-11-05' } }),
    // Cuota de octubre que nunca se marcó como pagada.
    obligation({ id: 'v', entity: 'Mercado Pago', type: 'prestamo', concept: 'Préstamo MP', paidInstallments: 0, totalInstallments: 3, installmentAmount: 700000, nextDueMonth: '2026-10', dueDay: 15 }),
    obligation({ id: 'a', entity: 'ARCA', type: 'otro', concept: 'ARCA · Monotributo', knownBalance: 50000000, fingerprint: ARCA_FINGERPRINT, paidInstallments: 0, status: 'pendiente' }),
  ];
  d.statements = [{ id: 's', createdAt: T, updatedAt: T, entity: 'Visa Banco Patagonia', month: '2026-11', dueDate: '2026-11-11', total: 6000000, currency: 'ARS', documentId: 'doc-visa' }];
  d.expenses = [
    { ...expense({ kind: 'personal', month: '2026-11', date: '2026-11-11', totalAmount: 250000, concept: 'Claro · línea celular', paymentMethod: 'otro' }), source: 'importado', paid: false, notes: 'Factura Claro · vence 11/11/2026' },
    { ...expense({ kind: 'personal', month: '2026-11', date: '2026-11-11', totalAmount: 99999, concept: 'Factura pagada', paymentMethod: 'otro' }), source: 'importado', paid: true, notes: 'Factura Claro' },
  ];
  return d;
};

describe('cuánto necesito este mes', () => {
  const n = needForMonth(data(), '2026-11', '2026-11');
  const g = (name: string) => n.groups.find((x) => x.group === name)!;

  it('el resumen por su total, el préstamo aparte, la factura sin pagar y lo vencido', () => {
    expect(g('Banco Patagonia').lines.map((l) => [l.label, l.amount])).toEqual([
      ['Préstamo personal', 500000],
      ['Resumen de la tarjeta', 6000000],
    ]);
    expect(g('Facturas de servicios').lines).toHaveLength(1);
    expect(g('Facturas de servicios').total).toBe(250000);
    expect(g('Mercado Pago').lines.map((l) => [!!l.overdue, l.amount])).toEqual([[true, 700000], [false, 700000]]); // lo vencido primero, después la de noviembre
    expect(n.overdue).toBe(700000);
    // 60.000 (resumen) + 5.000 (préstamo) + 2.500 (Claro) + 7.000 (vencido) + 7.000 (cuota de noviembre)
    expect(n.total).toBe(6000000 + 500000 + 250000 + 700000 + 700000);
  });

  it('ARCA va aparte: $ 100.000 por defecto, editable, y nunca más que lo que se debe', () => {
    expect(n.arca).toEqual({ balance: 50000000, plan: ARCA_DEFAULT_MONTHLY });
    expect(n.totalWithArca).toBe(n.total + 10000000);
    const d = data();
    d.settings = { ...d.settings, arcaMonthly: 30000000 };
    expect(needForMonth(d, '2026-11', '2026-11').arca!.plan).toBe(30000000);
    d.settings = { ...d.settings, arcaMonthly: 90000000 };
    expect(needForMonth(d, '2026-11', '2026-11').arca!.plan).toBe(50000000);
  });

  it('en otro mes no arrastra lo vencido y sin ARCA cargada no hay línea de ARCA', () => {
    const d = data();
    d.obligations = d.obligations.filter((o) => o.id !== 'a');
    const dic = needForMonth(d, '2026-12', '2026-11');
    expect(dic.overdue).toBe(0);
    expect(dic.arca).toBeUndefined();
    expect(dic.totalWithArca).toBe(dic.total);
  });
});
