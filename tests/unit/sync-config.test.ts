import { describe, expect, it } from 'vitest';
import { freshDb } from './helpers';
import { getSettings, saveRecord } from '../../src/db/repo';
import { mergeSettings } from '../../src/backup/merge';
import type { Settings } from '../../src/domain/types';

describe('sincronización: la configuración se fusiona ajuste por ajuste (ficticio)', () => {
  it('cada equipo cambia una cosa distinta: se conservan las dos, en los dos sentidos', async () => {
    const celu = await freshDb();
    const pc = await freshDb();
    const base = await getSettings(celu);
    await saveRecord<Settings>('settings', { ...base }, 'copia', pc); // la PC parte del mismo registro
    // El celular anota la plata; después la PC cambia el monto de ARCA.
    await saveRecord<Settings>('settings', { ...(await getSettings(celu)), cash: { amount: 500_000_00, setAt: '2026-11-05T10:00:00.000Z' } }, 'plata', celu);
    await new Promise((r) => setTimeout(r, 5));
    await saveRecord<Settings>('settings', { ...(await getSettings(pc)), arcaMonthly: 90_000_00 }, 'arca', pc);
    const a = await getSettings(celu);
    const b = await getSettings(pc);
    for (const m of [mergeSettings(a, b), mergeSettings(b, a)]) {
      expect(m.cash?.amount).toBe(500_000_00);
      expect(m.arcaMonthly).toBe(90_000_00);
    }
    // El mismo ajuste en los dos: gana el último.
    await new Promise((r) => setTimeout(r, 5));
    await saveRecord<Settings>('settings', { ...(await getSettings(celu)), arcaMonthly: 120_000_00 }, 'arca otra vez', celu);
    expect(mergeSettings(await getSettings(celu), await getSettings(pc)).arcaMonthly).toBe(120_000_00);
    expect(mergeSettings(await getSettings(pc), await getSettings(celu)).arcaMonthly).toBe(120_000_00);
  });
  it('sin marcas (versión anterior) gana el registro más nuevo, como siempre', () => {
    const viejo = { id: 'app', createdAt: 'x', updatedAt: '2026-11-01T00:00:00.000Z', partnerName: 'A' } as unknown as Settings;
    const nuevo = { id: 'app', createdAt: 'x', updatedAt: '2026-11-02T00:00:00.000Z', partnerName: 'B' } as unknown as Settings;
    expect(mergeSettings(viejo, nuevo).partnerName).toBe('B');
    expect(mergeSettings(nuevo, viejo).partnerName).toBe('B');
  });
});
