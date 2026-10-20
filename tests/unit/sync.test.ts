import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshDb, income } from './helpers';
import { saveRecord, loadDataSet } from '../../src/db/repo';
import { syncNow, checkServer, makePairingCode, parsePairingCode } from '../../src/sync/syncClient';
import type { Income } from '../../src/domain/types';

const PORT = 18787 + Math.floor(Math.random() * 1000);
const TOKEN = 'token-de-prueba-0123456789';
let proc: ChildProcess;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'sync-'));
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

describe('sincronización entre dispositivos (servidor autohospedado)', () => {
  const cfg = { serverUrl: `http://127.0.0.1:${PORT}`, space: 'hogar-prueba', token: TOKEN, passphrase: 'frase-larga-de-prueba' };

  it('rechaza tokens inválidos y datos sin cifrar', async () => {
    expect(await checkServer({ serverUrl: cfg.serverUrl, token: 'malo' })).toBe(false);
    expect(await checkServer(cfg)).toBe(true);
    const r = await fetch(`${cfg.serverUrl}/api/spaces/hogar-prueba`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'If-Match': '0' }, body: JSON.stringify({ blob: '{"format":"x","encrypted":false}' }) });
    expect(r.status).toBe(400);
  });

  it('PC y celular convergen al mismo estado', async () => {
    const pc = await freshDb();
    const phone = await freshDb();
    await saveRecord<Income>('incomes', income({ month: '2026-09', amountReceived: 111 }), 't', pc);
    await saveRecord<Income>('incomes', income({ month: '2026-10', amountReceived: 222 }), 't', phone);

    const a = await syncNow(cfg, pc);
    expect(a.pulled).toBe(false);
    const b = await syncNow(cfg, phone);
    expect(b.pulled).toBe(true);
    expect(b.incorporated).toBeGreaterThan(0);
    await syncNow(cfg, pc);

    const pcI = (await loadDataSet(pc)).incomes.map((i) => i.amountReceived).sort();
    const phI = (await loadDataSet(phone)).incomes.map((i) => i.amountReceived).sort();
    expect(pcI).toEqual([111, 222]);
    expect(phI).toEqual([111, 222]);
  });

  it('el servidor solo almacena datos cifrados', async () => {
    const r = await fetch(`${cfg.serverUrl}/api/spaces/hogar-prueba`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await r.json();
    expect(body.blob).not.toContain('amountReceived');
    expect(JSON.parse(body.blob).encrypted).toBe(true);
  });

  it('una frase incorrecta no corrompe los datos', async () => {
    const other = await freshDb();
    await expect(syncNow({ ...cfg, passphrase: 'frase-equivocada-xx' }, other)).rejects.toThrow(/Contraseña incorrecta/);
  });

  it('detecta conflictos de versión (control optimista)', async () => {
    const r = await fetch(`${cfg.serverUrl}/api/spaces/hogar-prueba`, { method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'If-Match': '0' }, body: JSON.stringify({ blob: '{"encrypted":true,"payload":"x"}' }) });
    expect(r.status).toBe(409);
  });

  it('sin cambios no vuelve a descargar ni subir datos', async () => {
    const cfg2 = { ...cfg, space: 'espacio-quieto' };
    const db = await freshDb();
    await saveRecord<Income>('incomes', income({ month: '2026-08', amountReceived: 5 }), 't', db);
    const first = await syncNow(cfg2, db);
    expect(first.pushed).toBe(true);
    const calls: string[] = [];
    const spy: typeof fetch = async (u, init) => {
      calls.push(`${init?.method ?? 'GET'} ${String(u)}`);
      return fetch(u, init);
    };
    const again = await syncNow(cfg2, db, spy);
    expect(again).toMatchObject({ pulled: false, pushed: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/known=1$/);
    // Un cambio local sí se sube
    await saveRecord<Income>('incomes', income({ month: '2026-09', amountReceived: 6 }), 't', db);
    expect((await syncNow(cfg2, db)).pushed).toBe(true);
  });

  it('un dispositivo que solo recibe cambios no los reenvía', async () => {
    const cfg3 = { ...cfg, space: 'espacio-receptor' };
    const a = await freshDb();
    const b = await freshDb();
    await saveRecord<Income>('incomes', income({ month: '2026-07', amountReceived: 7 }), 't', a);
    await syncNow(cfg3, a);
    const r = await syncNow(cfg3, b);
    expect(r).toMatchObject({ pulled: true, pushed: false });
    expect((await loadDataSet(b)).incomes).toHaveLength(1);
  });
});

describe('código de emparejamiento', () => {
  it('codifica y decodifica dirección, espacio y token', () => {
    const p = { serverUrl: 'http://192.168.0.10:8787', space: 'hogar', token: 'abc-123_XYZ' };
    const code = makePairingCode(p);
    expect(code).toMatch(/^FP1-[A-Za-z0-9_-]+$/);
    expect(parsePairingCode(code)).toEqual(p);
    expect(() => parsePairingCode('cualquier cosa')).toThrow(/inválido/);
  });
});
