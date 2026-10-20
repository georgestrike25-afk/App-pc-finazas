import { describe, expect, it } from 'vitest';
import { parseStatementText } from '../../src/importers/statementParser';

const SAMPLE = `BANCO PATAGONIA - VISA
Resumen de cuenta
Cierre actual: 25/09/2026
Vencimiento actual: 06/10/2026
Próximo vencimiento: 06/11/2026
Saldo anterior 150.000,00
05/09/26 SU PAGO EN PESOS -150.000,00
08/09/26 COTO SUC 45 32.450,50
10/09/26 MERCADOLIBRE*TIENDA C.04/10 12.000,00
12/09/26 SANCOR SALUD 98.000,00
15/09/26 INTERESES FINANCIACION 1.250,00
Total a pagar 141.700,50
Pago mínimo 14.170,00`;

describe('intérprete de resúmenes', () => {
  const doc = parseStatementText(SAMPLE.split('\n').map((text) => ({ text })));

  it('detecta entidad, fechas y totales', () => {
    expect(doc.entity.value).toBe('Visa Banco Patagonia');
    expect(doc.closingDate.value).toBe('2026-09-25');
    expect(doc.dueDate.value).toBe('2026-10-06');
    expect(doc.month).toBe('2026-10');
    expect(doc.total.value).toBe(14170050);
    expect(doc.minimumPayment.value).toBe(1417000);
    expect(doc.previousBalance.value).toBe(15000000);
    expect(doc.decimalFormat).toBe('coma');
  });

  it('clasifica movimientos', () => {
    const kinds = doc.items.map((i) => [i.kind, i.amount]);
    expect(kinds).toEqual([
      ['pago', 15000000],
      ['consumo', 3245050],
      ['cuota', 1200000],
      ['sancor', 9800000],
      ['cargo', 125000],
    ]);
    const cuota = doc.items[2];
    expect(cuota.installment).toEqual({ n: 4, total: 10 });
    expect(cuota.concept).toContain('MERCADOLIBRE');
    expect(doc.items[1].suggestedCategory).toBe('Supermercado');
  });

  it('no convierte el total en una deuda y advierte', () => {
    expect(doc.items.find((i) => i.amount === 14170050)).toBeUndefined();
    expect(doc.warnings.join(' ')).toMatch(/no se convierte en una deuda/);
  });

  it('marca como dudosa una lectura OCR de baja confianza y no inventa campos', () => {
    const d = parseStatementText([{ text: '03/09/26 FARMACIA 1.234,00', ocrConfidence: 40 }]);
    expect(d.items[0].confidence).toBe('baja');
    expect(d.total.value).toBeUndefined();
    expect(d.dueDate.value).toBeUndefined();
    expect(d.undetermined).toContain('Fecha de vencimiento');
  });

  it('detecta movimientos en dólares', () => {
    const d = parseStatementText([{ text: '03/09/26 NETFLIX USD 9,99' }]);
    expect(d.items[0].currency).toBe('USD');
    expect(d.items[0].confidence).toBe('baja');
  });

  it('acepta cuota con formato "Cuota 3 de 12"', () => {
    const d = parseStatementText([{ text: '01/10/2026 PRESTAMO PERSONAL Cuota 3 de 12 45.000,00' }]);
    expect(d.items[0].kind).toBe('cuota');
    expect(d.items[0].installment).toEqual({ n: 3, total: 12 });
  });
});
