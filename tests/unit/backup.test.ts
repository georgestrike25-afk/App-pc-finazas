import { describe, expect, it } from 'vitest';
import { freshDb, income } from './helpers';
import { buildBackup, parseBackup, restoreBackup, serializeBackup } from '../../src/backup/backup';
import { saveRecord, softDelete, loadDataSet } from '../../src/db/repo';
import { mergeTable } from '../../src/backup/merge';
import { safeJsonParse } from '../../src/backup/validate';
import type { Income } from '../../src/domain/types';

describe('copias de seguridad', () => {
  it('la base inicia vacía (sin datos financieros precargados)', async () => {
    const db = await freshDb();
    const data = await loadDataSet(db);
    expect(data.incomes.length + data.expenses.length + data.obligations.length + data.sancor.length + data.statements.length + data.cardPayments.length).toBe(0);
    expect(data.settings.dailyBudgetDefault).toBe(70000000);
    expect(data.settings.dailyBudgetIsInitialValue).toBe(true);
    expect(data.settings.projectedMonthlyIncome).toBe(0);
    const g = await db.goals.toArray();
    expect(g).toHaveLength(1);
    expect(g[0].initialSaving).toBe(0);
  });

  it('exporta y restaura (sin cifrar y cifrada)', async () => {
    const db = await freshDb();
    await saveRecord<Income>('incomes', income({ month: '2026-10', amountReceived: 123456 }), 'test', db);
    const backup = await buildBackup({}, db);
    const plain = await serializeBackup(backup);
    const enc = await serializeBackup(backup, 'clave-segura-123');
    expect(enc).not.toContain('123456');
    expect(JSON.parse(enc).encrypted).toBe(true);

    const db2 = await freshDb();
    await restoreBackup(await parseBackup(plain), 'reemplazar', db2);
    expect((await db2.incomes.toArray())[0].amountReceived).toBe(123456);

    const db3 = await freshDb();
    await expect(parseBackup(enc)).rejects.toThrow(/cifrada/);
    await expect(parseBackup(enc, 'otra-clave-999')).rejects.toThrow(/Contraseña incorrecta/);
    await restoreBackup(await parseBackup(enc, 'clave-segura-123'), 'reemplazar', db3);
    expect((await db3.incomes.toArray())[0].amountReceived).toBe(123456);
  });

  it('rechaza copias malformadas o manipuladas', async () => {
    await expect(parseBackup('no es json')).rejects.toThrow(/JSON/);
    await expect(parseBackup('{"format":"otra"}')).rejects.toThrow(/no es una copia/);
    const bad = { format: 'finanzas-personales-backup', version: 1, encrypted: false, data: { incomes: [{ id: 'x', updatedAt: '2026-01-01T00:00:00Z', month: '2026-13', amountReceived: 1, extras: [], deductions: [] }] } };
    await expect(parseBackup(JSON.stringify(bad))).rejects.toThrow(/mes inválido/);
    const bad2 = { ...bad, data: { incomes: [{ id: 'x', updatedAt: '2026-01-01T00:00:00Z', month: '2026-10', amountReceived: 1.5, extras: [], deductions: [] }] } };
    await expect(parseBackup(JSON.stringify(bad2))).rejects.toThrow(/importe inválido/);
    const polluted = safeJsonParse('{"__proto__":{"polluted":true},"a":1}') as Record<string, unknown>;
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(polluted)).toEqual(['a']);
  });

  it('fusión: último en escribir gana y las eliminaciones se propagan', () => {
    const a = { id: '1', createdAt: '', updatedAt: '2026-10-01T00:00:00Z', v: 1 };
    const b = { id: '1', createdAt: '', updatedAt: '2026-10-02T00:00:00Z', v: 2 };
    const c = { id: '2', createdAt: '', updatedAt: '2026-10-02T00:00:00Z', deleted: true };
    const r = mergeTable([a], [b, c]);
    expect(r.toPut).toEqual([b, c]);
    expect(mergeTable([b], [a]).toPut).toEqual([]);
  });

  it('fusiona dos dispositivos sin perder registros', async () => {
    const pc = await freshDb();
    const phone = await freshDb();
    const i1 = await saveRecord<Income>('incomes', income({ month: '2026-09', amountReceived: 1000 }), 't', pc);
    await saveRecord<Income>('incomes', income({ month: '2026-10', amountReceived: 2000 }), 't', phone);
    await restoreBackup(await parseBackup(await serializeBackup(await buildBackup({}, pc))), 'fusionar', phone);
    expect((await loadDataSet(phone)).incomes).toHaveLength(2);
    await softDelete('incomes', i1.id, 'borrar', phone);
    await restoreBackup(await parseBackup(await serializeBackup(await buildBackup({}, phone))), 'fusionar', pc);
    expect((await loadDataSet(pc)).incomes.map((i) => i.month)).toEqual(['2026-10']);
  });
});
