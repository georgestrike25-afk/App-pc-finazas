import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyData, expense, freshDb } from './helpers';
import { getDb, setDb } from '../../src/db/db';
import { loadDataSet, saveRecord, softDelete } from '../../src/db/repo';
import { cashStatus } from '../../src/domain/cash';
import { codigoPareja, fijosDelMes, leerCodigoPareja, nuevoDoc, partes, planEspejo, saldo, unirDocs, type ParejaDoc, type ParejaGasto } from '../../src/domain/pareja';
import { aplicarEspejo, cambiarPareja, codigoDe, compartirConPareja, crearPareja, sinMandar, elegirYo, loadPareja, syncPareja, unirPareja } from '../../src/sync/pareja';
import type { Expense, Settings } from '../../src/domain/types';

const T = '2026-01-02T10:00:00.000Z';
const gasto = (p: Partial<ParejaGasto> & Pick<ParejaGasto, 'id' | 'paga' | 'total'>): ParejaGasto => ({
  createdAt: T,
  updatedAt: T,
  autor: p.paga,
  pctPaga: 50,
  concepto: 'Supermercado',
  fecha: '2026-11-02',
  mes: '2026-11',
  categoria: 'Gasto diario',
  ...p,
});
const doc = (gastos: ParejaGasto[] = []): ParejaDoc => ({ ...nuevoDoc({ a: 'Jorge', b: 'Antonella' }, T), gastos });
const ctx = { nowIso: '2026-11-02T12:00:00.000Z', mes: '2026-11', categories: ['Gasto diario'] };

describe('modo pareja: cuentas', () => {
  it('cada uno ve su mitad y el saldo de quién le debe a quién', () => {
    const d = doc([gasto({ id: 'g1', paga: 'b', total: 100_000 }), gasto({ id: 'g2', paga: 'a', total: 30_001 })]);
    expect(partes(d.gastos[1])).toEqual({ a: 15_001, b: 15_000 });
    // Jorge: le debe 50.000 por lo de Antonella; ella le debe 15.000 por lo suyo.
    expect(saldo(d, 'a').neto).toBe(15_000 - 50_000);
    expect(saldo(d, 'b').neto).toBe(35_000);
    // "Pagado": Jorge le pasa 35.000 y quedan a mano.
    d.pagos.push({ id: 'p1', createdAt: T, updatedAt: T, de: 'a', a: 'b', monto: 35_000, fecha: '2026-11-03', mes: '2026-11', medio: 'transferencia' });
    expect(saldo(d, 'a').neto).toBe(0);
    expect(saldo(d, 'b').neto).toBe(0);
  });

  it('la planilla del mes: pendientes, monto del mes pasado y lo que no se comparte solo lo ve quien paga', () => {
    const solo = doc();
    solo.items = solo.items.map((i) => (i.id === 'fijo-7' ? { ...i, paga: 'a', pctPaga: 100 } : i));
    expect(fijosDelMes(solo, '2026-11', 'b').map((f) => f.item.nombre)).not.toContain('Alquiler de consultorio');
    const d = doc([gasto({ id: 'g1', paga: 'b', total: 8_000, itemId: 'fijo-3', mes: '2026-10' }), gasto({ id: 'g2', paga: 'b', total: 40_000, itemId: 'fijo-1' })]);
    const jorge = fijosDelMes(d, '2026-11', 'a');
    expect(jorge.map((f) => f.item.nombre)).toContain('Alquiler de consultorio');
    expect(jorge.find((f) => f.item.nombre === 'Alquiler')?.gasto?.total).toBe(40_000);
    const gas = jorge.find((f) => f.item.nombre === 'Gas')!;
    expect(gas.gasto).toBeUndefined();
    expect(gas.anterior).toBe(8_000);
    expect(fijosDelMes(d, '2026-11', 'b').map((f) => f.item.nombre)).toContain('Alquiler de consultorio');
  });

  it('une dos versiones: gana el último cambio de cada gasto', () => {
    const a = doc([gasto({ id: 'g1', paga: 'a', total: 100 })]);
    const b = doc([gasto({ id: 'g1', paga: 'a', total: 200, updatedAt: '2026-11-03T00:00:00.000Z' }), gasto({ id: 'g2', paga: 'b', total: 50 })]);
    const u = unirDocs(a, b);
    expect(u.gastos.map((g) => [g.id, g.total])).toEqual([['g1', 200], ['g2', 50]]);
  });

  it('el código lleva todo lo necesario y rechaza otros códigos', () => {
    const cfg = { servidores: ['http://192.168.0.10:8797', 'http://192.168.0.5:8787'], space: 'pareja-abc123', token: 'tok', passphrase: 'frase-aleatoria' };
    expect(leerCodigoPareja(` ${codigoPareja(cfg)} `)).toEqual(cfg);
    expect(() => leerCodigoPareja('FP1-abc')).toThrow();
  });
});

describe('modo pareja: gastos en la app de cada uno', () => {
  it('lo que pagó Antonella le aparece a Jorge como su mitad, y no sale de su plata', () => {
    const d = doc([gasto({ id: 'g1', paga: 'b', total: 100_000 })]);
    const p = planEspejo(d, 'a', [], ctx);
    const e = p.put.find((x) => x.id === 'pareja-g1')!;
    expect(e).toMatchObject({ kind: 'hogar', totalAmount: 100_000, userPct: 50, paidBy: 'pareja', month: '2026-11' });
    // El consultorio (fijo) se carga solo este mes: es todo de Jorge y se lo debe a Antonella.
    expect(p.nuevos).toEqual([expect.objectContaining({ id: 'fijo-7-2026-11', paga: 'b', pctPaga: 0, total: 2_000_000 })]);
    expect(p.put.find((x) => x.id === 'pareja-fijo-7-2026-11')).toMatchObject({ totalAmount: 2_000_000, userPct: 100, paidBy: 'pareja' });
    expect(saldo({ ...d, gastos: [...d.gastos, ...p.nuevos] }, 'a').neto).toBe(-50_000 - 2_000_000);
    // En la app de Antonella no es gasto suyo (0 %), pero suma a lo que Jorge le debe.
    const pb = planEspejo(d, 'b', [], ctx);
    expect(pb.put.find((x) => x.id === 'pareja-fijo-7-2026-11')).toMatchObject({ userPct: 0, paidBy: 'usuario' });
  });

  it('es estable: una segunda pasada no cambia nada', () => {
    const d = doc([gasto({ id: 'g1', paga: 'b', total: 100_001 })]);
    const p = planEspejo(d, 'a', [], ctx);
    const again = planEspejo({ ...d, gastos: [...d.gastos, ...p.nuevos] }, 'a', p.put, { ...ctx, nowIso: '2026-11-02T13:00:00.000Z' });
    expect(again).toEqual({ put: [], gastos: [], nuevos: [], categorias: [] });
  });

  it('la obra social que paga Jorge con la tarjeta no se duplica en su app (llega con el resumen); a Antonella le aparece su mitad', () => {
    const d = doc([gasto({ id: 's1', paga: 'a', total: 280_000, itemId: 'fijo-6', concepto: 'Obra social (Sancor)' })]);
    expect(planEspejo(d, 'a', [], ctx).put.some((x) => x.id === 'pareja-s1')).toBe(false);
    expect(planEspejo(d, 'b', [], ctx).put.find((x) => x.id === 'pareja-s1')).toMatchObject({ userPct: 50, paidBy: 'pareja' });
  });

  it('borrar o editar el gasto desde Gastos vuelve a la pareja; borrar en la pareja lo saca de Gastos', () => {
    const d = doc([gasto({ id: 'g1', paga: 'a', total: 10_000 })]);
    const [e] = planEspejo(d, 'a', [], ctx).put.filter((x) => x.id === 'pareja-g1');
    const edit: Expense = { ...e, totalAmount: 12_000, updatedAt: '2026-11-02T14:00:00.000Z' };
    expect(planEspejo(d, 'a', [edit], ctx).gastos[0]).toMatchObject({ id: 'g1', total: 12_000 });
    const del: Expense = { ...e, deleted: true, updatedAt: '2026-11-02T14:00:00.000Z' };
    expect(planEspejo(d, 'a', [del], ctx).gastos[0]).toMatchObject({ id: 'g1', deleted: true });
    const d2 = doc([{ ...d.gastos[0], deleted: true, updatedAt: '2026-11-02T15:00:00.000Z' }]);
    expect(planEspejo(d2, 'a', [e], ctx).put.find((x) => x.id === 'pareja-g1')?.deleted).toBe(true);
  });

  it('plata hasta cobrar: lo que pagaste vos sale entero, lo que pagó ella no; los pagos entre ustedes salen y entran', () => {
    const settings: Settings = { ...emptyData().settings, cash: { amount: 1_000_000, setAt: '2026-11-01T00:00:00.000Z' } };
    const N = '2026-11-02T09:00:00.000Z';
    const mine = expense({ id: 'pareja-g1', kind: 'hogar', month: '2026-11', date: '2026-11-02', totalAmount: 100_000, userPct: 50, paidBy: 'usuario', createdAt: N });
    const hers = expense({ id: 'pareja-g2', kind: 'hogar', month: '2026-11', date: '2026-11-02', totalAmount: 60_000, userPct: 50, paidBy: 'pareja', createdAt: N });
    const pagos = [
      { id: 'p1', createdAt: N, updatedAt: N, de: 'b' as const, a: 'a' as const, monto: 50_000, fecha: '2026-11-03', mes: '2026-11', medio: 'transferencia' as const },
      { id: 'p2', createdAt: N, updatedAt: N, de: 'a' as const, a: 'b' as const, monto: 30_000, fecha: '2026-11-04', mes: '2026-11', medio: 'efectivo' as const },
    ];
    const c = cashStatus({ ...emptyData(), settings, expenses: [mine, hers], pareja: { yo: 'a', nombreOtro: 'Antonella', pagos } }, '2026-11-05')!;
    expect(c.spent).toBe(100_000 + 30_000);
    expect(c.returned).toBe(50_000);
    expect(c.items.some((i) => i.concept === 'Pago a Antonella')).toBe(true);
  });
});

const PORT = 19787 + Math.floor(Math.random() * 1000);
const TOKEN = 'token-de-prueba-pareja-0123456789';
let proc: ChildProcess;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'pareja-'));
  proc = spawn(process.execPath, ['sync-server/server.mjs'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SYNC_TOKEN: TOKEN, DATA_DIR: dataDir }, stdio: 'pipe' });
  await new Promise<void>((ok, fail) => {
    proc.stdout!.on('data', (d) => String(d).includes('Servidor') && ok());
    proc.on('exit', (c) => fail(new Error(`server exit ${c}`)));
  });
});
afterAll(() => {
  proc?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('modo pareja: dos celulares por la PC', () => {
  const url = `http://127.0.0.1:${PORT}`;

  it('el espacio de pareja queda atado al token con el que se creó y ese token no abre nada más', async () => {
    const tok = 'token-pareja-aleatorio-123456';
    const put = (t: string, sp = 'pareja-x1', v = 0) => fetch(`${url}/api/spaces/${sp}`, { method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'If-Match': String(v) }, body: JSON.stringify({ blob: '{"encrypted":true,"payload":"x"}' }) });
    expect((await fetch(`${url}/api/spaces/pareja-x1`, { headers: { Authorization: `Bearer ${tok}` } })).status).toBe(404);
    expect((await put(tok)).status).toBe(200);
    expect((await fetch(`${url}/api/health`, { headers: { Authorization: `Bearer ${tok}` } })).status).toBe(200);
    expect((await fetch(`${url}/api/spaces/pareja-x1`, { headers: { Authorization: `Bearer ${tok}` } })).status).toBe(200);
    expect((await put('otro-token-cualquiera-123456', 'pareja-x1', 1)).status).toBe(401);
    expect((await fetch(`${url}/api/spaces/hogar`, { headers: { Authorization: `Bearer ${tok}` } })).status).toBe(401);
    expect((await put(tok, 'hogar')).status).toBe(401);
  });

  it('Antonella anota, a Jorge le llega su mitad; Jorge marca Pagado y a ella le entra', async () => {
    const jorge = await freshDb();
    const st = await crearPareja({ yo: 'Jorge', otro: 'Antonella', servidores: [url] }, jorge);
    await syncPareja(fetch, jorge);
    const code = codigoDe(st);

    const anto = await freshDb();
    await unirPareja(leerCodigoPareja(code), anto);
    await syncPareja(fetch, anto);
    expect((await loadPareja(anto))!.doc.nombres).toMatchObject({ a: 'Jorge', b: 'Antonella' });
    setDb(anto);
    await elegirYo('b', anto);
    await cambiarPareja((d, yo) => ({ ...d, gastos: [...d.gastos, gasto({ id: 'super', paga: yo, autor: yo, total: 50_000, mes: '2026-11' })] }), anto);
    await syncPareja(fetch, anto);

    setDb(jorge);
    const nov = (await syncPareja(fetch, jorge)).novedades;
    expect(nov.map((n) => n.titulo.replace(/\s/g, ' '))).toEqual(['Antonella anotó Supermercado $ 500']);
    const e = (await loadDataSet(jorge)).expenses.find((x) => x.id === 'pareja-super')!;
    expect(e).toMatchObject({ totalAmount: 50_000, userPct: 50, paidBy: 'pareja' });
    expect(saldo((await loadPareja(jorge))!.doc, 'a', '2026-11').neto).toBe(-25_000);

    await cambiarPareja((d, yo) => ({ ...d, pagos: [...d.pagos, { id: 'pago1', createdAt: T, updatedAt: T, de: yo, a: 'b', monto: 25_000, fecha: '2026-11-03', mes: '2026-11', medio: 'transferencia' }] }), jorge);
    await syncPareja(fetch, jorge);
    setDb(anto);
    const nov2 = (await syncPareja(fetch, anto)).novedades;
    expect(nov2[0].titulo.replace(/\s/g, ' ')).toBe('Jorge marcó: te pasó $ 250');
    expect(saldo((await loadPareja(anto))!.doc, 'b', '2026-11').neto).toBe(0);
    expect((await loadDataSet(anto)).pareja?.pagos.length).toBe(1);

    // Jorge borra el gasto desde Gastos ("no era compartido"): a Antonella se le saca también.
    setDb(jorge);
    await softDelete('expenses', 'pareja-super', 'no era compartido', jorge);
    await aplicarEspejo(jorge);
    await syncPareja(fetch, jorge);
    setDb(anto);
    await syncPareja(fetch, anto);
    expect((await getDb().expenses.get('pareja-super'))?.deleted).toBe(true);
  });

  it('el consultorio se carga una sola vez por mes aunque se sincronice varias veces', async () => {
    const db = await freshDb();
    await crearPareja({ yo: 'Jorge', otro: 'Antonella' }, db);
    await aplicarEspejo(db);
    await aplicarEspejo(db);
    const fijos = (await db.expenses.toArray()).filter((e) => e.id.startsWith('pareja-fijo-7'));
    expect(fijos).toHaveLength(1);
    expect((await loadPareja(db))!.doc.gastos.filter((g) => g.itemId === 'fijo-7')).toHaveLength(1);
    expect(saldo((await loadPareja(db))!.doc, 'a').neto).toBe(-2_000_000);
  });

  it('pasa el consultorio de la primera versión (solo de Jorge, fuera del saldo) a "se lo debe a Antonella"', async () => {
    const db = await freshDb();
    await crearPareja({ yo: 'Jorge', otro: 'Antonella' }, db);
    await saveRecord<Expense>('expenses', { id: 'pareja-fijo-fijo-7-2026-10', kind: 'personal', category: 'Consultorio', concept: 'Alquiler de consultorio', date: '2026-10-01', month: '2026-10', totalAmount: 2_000_000, userPct: 100, paid: true, frequency: 'unica', paymentMethod: 'otro', source: 'manual' } as Expense, 't', db);
    // Planilla como la dejaba la versión anterior: al aplicarse, se corrige sola.
    await cambiarPareja((d) => ({ ...d, items: d.items.map((i) => (i.id === 'fijo-7' ? { ...i, paga: 'a', pctPaga: 100 } : i)) }), db);
    expect((await loadPareja(db))!.doc.items.find((i) => i.id === 'fijo-7')).toMatchObject({ paga: 'b', pctPaga: 0 });
    expect((await db.expenses.get('pareja-fijo-fijo-7-2026-10'))?.deleted).toBe(true);
  });
});

describe('modo pareja sin la PC: cada celular recibe al otro', () => {
  const start = async (port: number) => {
    const dir = mkdtempSync(join(tmpdir(), 'celu-'));
    const p = spawn(process.execPath, ['sync-server/server.mjs'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SYNC_TOKEN: `token-propio-del-celular-${port}`, DATA_DIR: dir }, stdio: 'pipe' });
    await new Promise<void>((ok, fail) => {
      p.stdout!.on('data', (d) => String(d).includes('Servidor') && ok());
      p.on('exit', (c) => fail(new Error(`server exit ${c}`)));
    });
    return { p, dir };
  };

  it('Antonella le deja el gasto al celular de Jorge y Jorge lo ve al abrir Brote, aunque ella ya no esté', async () => {
    const pj = PORT + 1500;
    const pa = PORT + 1600;
    const sj = await start(pj);
    const sa = await start(pa);
    try {
      const hostJ = { local: `http://127.0.0.1:${pj}`, publica: `http://localhost:${pj}` };
      const hostA = { local: `http://127.0.0.1:${pa}`, publica: `http://localhost:${pa}` };
      const jorge = await freshDb();
      const st = await crearPareja({ yo: 'Jorge', otro: 'Antonella' }, jorge);
      await syncPareja(fetch, jorge, hostJ);
      const code = codigoDe((await loadPareja(jorge))!, hostJ);
      expect(leerCodigoPareja(code).servidores).toEqual([hostJ.publica]);
      expect(st.cfg.servidores).toEqual([]);

      const anto = await freshDb();
      await unirPareja(leerCodigoPareja(code), anto);
      const r = await syncPareja(fetch, anto, hostA);
      expect(r.conectados).toEqual([hostJ.publica]);
      await elegirYo('b', anto);
      await cambiarPareja((d, yo) => ({ ...d, gastos: [...d.gastos, gasto({ id: 'luz', paga: yo, autor: yo, total: 70_000 })] }), anto);
      await syncPareja(fetch, anto, hostA);

      // Antonella se va (su celular deja de responder); Jorge abre Brote después.
      sa.p.kill();
      setDb(jorge);
      const rj = await syncPareja(fetch, jorge, hostJ);
      expect(rj.sinRespuesta).toEqual([hostA.publica]);
      expect(rj.novedades).toHaveLength(1);
      expect((await jorge.expenses.get('pareja-luz'))).toMatchObject({ totalAmount: 70_000, paidBy: 'pareja', userPct: 50 });
    } finally {
      sj.p.kill();
      sa.p.kill();
      rmSync(sj.dir, { recursive: true, force: true });
      rmSync(sa.dir, { recursive: true, force: true });
    }
  });
});

describe('compartir desde Gastos con el modo pareja activo', () => {
  it('el botón ½ o la tilde de compartido mandan el gasto a la pareja (y no queda duplicado)', async () => {
    const db = await freshDb();
    await crearPareja({ yo: 'Antonella', otro: 'Jorge' }, db);
    const e = await saveRecord<Expense>('expenses', expense({ kind: 'hogar', month: '2026-10', date: '2026-10-25', totalAmount: 30_000, userPct: 50, paidBy: 'usuario', concept: 'Verdulería' }), 't', db);
    expect(sinMandar((await loadDataSet(db)).expenses, '2026-10').map((x) => x.id)).toEqual([e.id]);
    expect(await compartirConPareja(e, db)).toBe(true);
    const st = (await loadPareja(db))!;
    const g = st.doc.gastos.find((x) => x.concepto === 'Verdulería')!;
    expect(g).toMatchObject({ paga: 'a', pctPaga: 50, total: 30_000 });
    const vivos = (await loadDataSet(db)).expenses.filter((x) => x.concept === 'Verdulería');
    expect(vivos.map((x) => x.id)).toEqual([`pareja-${g.id}`]);
    expect(sinMandar((await loadDataSet(db)).expenses, '2026-10')).toEqual([]);
    // Lo pagó la otra persona: le debés tu parte.
    const f = await saveRecord<Expense>('expenses', expense({ kind: 'hogar', month: '2026-10', date: '2026-10-26', totalAmount: 10_000, userPct: 50, paidBy: 'pareja', concept: 'Farmacia' }), 't', db);
    await compartirConPareja(f, db);
    expect((await loadPareja(db))!.doc.gastos.find((x) => x.concepto === 'Farmacia')).toMatchObject({ paga: 'b', pctPaga: 50 });
  });
});
