import { describe, expect, it } from 'vitest';
import { parseMpStatement } from '../../src/importers/mpStatement';

// Resumen FICTICIO con el formato del PDF de la tarjeta de Mercado Pago (como lo lee el lector de PDF).
const LINES = [
  '¡Hola, Persona!', 'Este es tu resumen de octubre Tarjeta de crédito', 'Total a pagar Fecha de cierre', '50 5 de octubre', '$ 100.500', '00', 'US$ 0', 'Fecha de vencimiento', '25',
  'El mínimo a pagar es $ 20.000 13 de octubre', 'Consolidado', 'Saldo del periodo anterior $ 0,00', 'Consumos $ 99.000,00 US$ 0,00', 'Impuestos e intereses $ 1.500,50',
  'Total a pagar $ 100.500,50 US$ 0,00', 'DETALLE DE MOVIMIENTOS', 'Composición del saldo del periodo anterior', 'Fecha Descripción Pesos Dólares',
  '5/sep Total a pagar del periodo anterior $ 80.000,00', '10/sep Pago del resumen -$ 80.000,00', 'Subtotal $ 0,00 US$ 0,00', 'Consumos', 'Con tarjeta virtual',
  'Fecha Descripción Cuota Operación Pesos Dólares', '6/ago MERPAGO*TIENDA 2 de 2 111111 $ 30.000,00', '24/sep MERPAGO*LIBRERIA 1 de 3 222222 $ 40.000,00', '28/sep UBER *TRIP 333333 $ 29.000,00',
  'Subtotal $ 99.000,00 US$ 0,00', 'Impuestos e intereses1', '5/oct Impuesto al sello Córdoba $ 1.500,50', 'Subtotal $ 1.500,50 US$ 0,00',
  'Total a pagar $ 100.500,50 US$ 0,00', 'Cierre actual 5 de octubre Vencimiento actual 13 de octubre', 'Cierre próximo 5 de noviembre Vencimiento próximo 10 de noviembre',
].map((text) => ({ text }));

describe('resumen PDF de la tarjeta de Mercado Pago (ficticio)', () => {
  it('lee fechas, cuotas, cierre, vencimiento, mínimo y total', () => {
    const p = parseMpStatement(LINES, { today: '2026-11-06' })!;
    expect([p.entity.value, p.total.value, p.minimumPayment.value, p.closingDate.value, p.dueDate.value, p.month, p.previousBalance.value, p.nextClosingDate.value, p.nextDueDate.value]).toEqual([
      'Mercado Pago', 100_500_50, 20_000_25, '2026-10-05', '2026-10-13', '2026-10', 80_000_00, '2026-11-05', '2026-11-10',
    ]);
    expect(p.items.map((i) => [i.kind, i.date, i.concept, i.amount, i.installment ?? null])).toEqual([
      ['pago', '2026-09-10', 'Pago del resumen', 80_000_00, null],
      ['cuota', '2026-08-06', 'MERPAGO*TIENDA', 30_000_00, { n: 2, total: 2 }],
      ['cuota', '2026-09-24', 'MERPAGO*LIBRERIA', 40_000_00, { n: 1, total: 3 }],
      ['consumo', '2026-09-28', 'UBER *TRIP', 29_000_00, null],
      ['cargo', '2026-10-05', 'Impuesto al sello Córdoba', 1_500_50, null],
    ]);
    expect(p.items.find((i) => i.concept === 'UBER *TRIP')!.suggestedCategory).toBe('Transporte');
    expect(p.warnings).toHaveLength(1);
  });
  it('no toma otros documentos', () => {
    expect(parseMpStatement([{ text: 'Resumen de cuenta' }, { text: 'Total a pagar $ 1.000,00' }])).toBeNull();
  });
});
