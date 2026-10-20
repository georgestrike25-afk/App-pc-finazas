import { describe, expect, it } from 'vitest';
import { detectDecimalFormat, formatARS, parseAmount, splitAmount } from '../../src/domain/money';
import { addMonths, monthDiff, parseDateEs } from '../../src/domain/dates';

describe('importes', () => {
  it('interpreta formatos argentinos y anglosajones', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('$ 12.345')).toBe(1234500);
    expect(parseAmount('1,234.56', 'punto')).toBe(123456);
    expect(parseAmount('1234,5')).toBe(123450);
    expect(parseAmount('-1.234,56')).toBe(-123456);
    expect(parseAmount('1.234,56-')).toBe(-123456);
    expect(parseAmount('(500,00)')).toBe(-50000);
    expect(parseAmount('700.000')).toBe(70000000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1.23.4')).toBeNull();
  });
  it('detecta el formato decimal del documento', () => {
    expect(detectDecimalFormat('Total 12.345,67 y 1.000,00')).toBe('coma');
    expect(detectDecimalFormat('Total 12,345.67 and 1,000.00')).toBe('punto');
  });
  it('formatea en pesos argentinos', () => {
    expect(formatARS(123456).replace(/\s/g, ' ')).toMatch(/\$ ?1\.234,56/);
  });
  it('divide sin perder centavos', () => {
    const [a, b] = splitAmount(1001, 50);
    expect(a + b).toBe(1001);
  });
});

describe('fechas', () => {
  it('suma meses y calcula diferencias', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthDiff('2026-10', '2027-04')).toBe(6);
  });
  it('interpreta fechas de resúmenes', () => {
    expect(parseDateEs('05/10/26')?.iso).toBe('2026-10-05');
    expect(parseDateEs('05-Oct-26')?.iso).toBe('2026-10-05');
    expect(parseDateEs('5 dic 2026')?.iso).toBe('2026-12-05');
    expect(parseDateEs('05/10', 2026)).toEqual({ iso: '2026-10-05', yearInferred: true });
    expect(parseDateEs('31/02/2026')).toBeNull();
  });
});
