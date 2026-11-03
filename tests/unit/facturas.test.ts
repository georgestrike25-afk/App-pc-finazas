import { describe, expect, it } from 'vitest';
import { checkBill, commitBill, detectBill, type ServiceBill } from '../../src/importers/facturas';
import { loadDataSet } from '../../src/db/repo';
import { debtByEntity, monthToPay } from '../../src/domain/obligations';
import { monthChecklist } from '../../src/domain/checklist';
import { freshDb } from './helpers';

const L = (t: string[]) => t.map((text) => ({ text }));
// PDF FICTICIO de la cuenta corriente de monotributistas (con las tildes separadas, como sale del PDF real).
const arca = (total: string, fecha: string) =>
  L(['CCMA', 'ARCA', 'Tipo de Contribuyente:', 'MONOTRIBUTISTA', `Ú LTIMA DEUDA CALCULADA FECHA DE C Á LCULO: ${fecha}`, 'PER Í ODO TOTAL CALCULADO 01/2024 - 11/2026', `Total Saldo Deudor: ${total} Total Saldo Acreedor: 0.00`, 'Obligaci ó n Mensual: 1,000.00 Obligaci ó n Mensual: 0.00', 'Accesorios: 234.56 Accesorios: 0.00']);
// Factura FICTICIA de Claro (texto como lo lee el OCR).
const CLARO = L(['Claro AMX ARGENTINA SA', 'FACTURA DE SERVICIOS', 'Factura N* 1111-22223333', 'Fecha de Factura 19/10/2026', 'Total a pagar Vencimiento Cuenta', '$1.234,56 11/11/2026 999', 'Período de facturación desde: 20/09/2026 hasta: 19/10/2026', 'Telefonía Móvil', 'TOTAL A PAGAR $1.234,56']);
const meta = (hash: string) => ({ name: `${hash}.pdf`, size: 1, mime: 'application/pdf', kind: 'pdf' as const, hash });

describe('ARCA (monotributo)', () => {
  it('lee el saldo deudor, cuotas e intereses y la fecha', () => {
    expect(detectBill(arca('1,234.56', '03/11/2026'))).toEqual({ kind: 'arca', total: 123456, capital: 100000, interest: 23456, date: '2026-11-03', period: '01/2024 - 11/2026' });
  });

  it('queda como saldo en Deudas y cada PDF nuevo lo actualiza (sin duplicar ni volver atrás)', async () => {
    const db = await freshDb();
    await commitBill(detectBill(arca('1,234.56', '03/11/2026'))!, meta('a'), null, {}, db);
    const nuevo = detectBill(arca('900.00', '03/12/2026'))!;
    expect((await checkBill(nuevo, db)).existing?.knownBalance).toBe(123456);
    expect((await commitBill(nuevo, meta('b'), null, {}, db)).updated).toBe(true);
    await commitBill(detectBill(arca('1,234.56', '03/11/2026'))!, meta('c'), null, {}, db); // uno viejo no pisa
    const data = await loadDataSet(db);
    expect(data.obligations).toHaveLength(1);
    const debts = debtByEntity(data.obligations, '2026-12', data);
    expect(debts[0]).toMatchObject({ group: 'ARCA', remaining: 90000 });
    expect(debts[0].items[0].balance).toBe(90000);
    // Sin cuotas fijas: no aparece en lo que se paga en el mes.
    expect(monthToPay(debts, '2026-12', data.statements)).toEqual([]);
  });
});

describe('factura de Claro', () => {
  it('lee total, vencimiento, período y número', () => {
    expect(detectBill(CLARO)).toMatchObject({ kind: 'servicio', provider: 'Claro', concept: 'Claro · línea celular', total: 123456, due: '2026-11-11', invoice: '1111-22223333', periodFrom: '2026-09-20', periodTo: '2026-10-19' });
  });

  it('se anota como gasto, queda pendiente hasta pagarla y no se repite', async () => {
    const db = await freshDb();
    const b = detectBill(CLARO) as ServiceBill;
    await commitBill(b, meta('f1'), null, { paid: false }, db);
    expect((await checkBill(b, db)).alreadyImported).toBe(true);
    await commitBill(b, meta('f2'), null, { paid: false }, db);
    const data = await loadDataSet(db);
    expect(data.expenses).toHaveLength(1);
    expect(data.expenses[0]).toMatchObject({ month: '2026-11', category: 'Telefonía', kind: 'personal', totalAmount: 123456, paid: false });
    const item = monthChecklist(data, '2026-11', '2026-11-03').find((i) => i.key.startsWith('factura-'))!;
    expect(item).toMatchObject({ done: false, detail: 'Vence el 11/11/2026.', payExpenseId: data.expenses[0].id });
    data.expenses[0] = { ...data.expenses[0], paid: true };
    expect(monthChecklist(data, '2026-11', '2026-11-03').find((i) => i.key.startsWith('factura-'))!.done).toBe(true);
  });
});
