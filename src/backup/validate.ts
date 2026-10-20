import { isIsoDate, isMonthKey } from '../domain/dates';
import { SYNC_TABLES, type SyncTable } from '../domain/types';

export const MAX_RECORDS_PER_TABLE = 100_000;

/** JSON.parse que descarta claves peligrosas (contaminación de prototipos). */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
}

const isInt = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v);
const isOptInt = (v: unknown) => v === undefined || v === null || isInt(v);
const isStr = (v: unknown) => typeof v === 'string';
const isOptStr = (v: unknown) => v === undefined || v === null || typeof v === 'string';
const isPct = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100;

type Check = (r: Record<string, unknown>) => string | null;

const CHECKS: Partial<Record<SyncTable, Check>> = {
  incomes: (r) =>
    !isMonthKey(r.month) ? 'mes inválido' : !isInt(r.amountReceived) ? 'importe inválido' : !Array.isArray(r.extras) || !Array.isArray(r.deductions) ? 'detalle inválido' : null,
  expenses: (r) =>
    !isMonthKey(r.month) ? 'mes inválido' : !isInt(r.totalAmount) ? 'importe inválido' : !isPct(r.userPct) ? 'porcentaje inválido' : !isStr(r.concept) ? 'concepto inválido' : null,
  obligations: (r) =>
    !isInt(r.paidInstallments) ? 'cuotas pagadas inválidas' : !isOptInt(r.installmentAmount) ? 'importe de cuota inválido' : r.nextDueMonth && !isMonthKey(r.nextDueMonth) ? 'mes inválido' : null,
  statements: (r) => (!isMonthKey(r.month) ? 'mes inválido' : !isOptInt(r.total) ? 'total inválido' : null),
  cardPayments: (r) => (!isIsoDate(r.date) ? 'fecha inválida' : !isInt(r.amount) ? 'importe inválido' : null),
  sancor: (r) => (!isMonthKey(r.month) ? 'mes inválido' : !isInt(r.chargeAmount) ? 'importe inválido' : !isPct(r.partnerPct) ? 'porcentaje inválido' : !Array.isArray(r.received) ? 'reintegros inválidos' : null),
  goals: (r) => (!isMonthKey(r.targetMonth) ? 'mes objetivo inválido' : !isInt(r.estimatedCost) ? 'costo inválido' : !Array.isArray(r.contributions) ? 'aportes inválidos' : null),
  documents: (r) => (!isStr(r.hash) ? 'hash inválido' : null),
  fingerprints: (r) => (!isStr(r.fingerprint) ? 'huella inválida' : null),
  settings: (r) => (!isInt(r.dailyBudgetDefault) ? 'presupuesto inválido' : null),
};

export interface BackupData {
  [table: string]: Record<string, unknown>[];
}

/** Valida estructura y tipos de los datos de una copia. Lanza un Error descriptivo. */
export function validateBackupData(data: unknown): BackupData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('La copia no contiene datos válidos.');
  const out: BackupData = {};
  for (const t of SYNC_TABLES) {
    const rows = (data as Record<string, unknown>)[t];
    if (rows === undefined) {
      out[t] = [];
      continue;
    }
    if (!Array.isArray(rows)) throw new Error(`Tabla ${t} inválida.`);
    if (rows.length > MAX_RECORDS_PER_TABLE) throw new Error(`Tabla ${t} demasiado grande.`);
    out[t] = rows.map((r, i) => {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`Registro ${i} de ${t} inválido.`);
      const rec = r as Record<string, unknown>;
      if (!isStr(rec.id) || !(rec.id as string).length || (rec.id as string).length > 200) throw new Error(`Registro ${i} de ${t}: identificador inválido.`);
      if (!isStr(rec.updatedAt) || Number.isNaN(Date.parse(rec.updatedAt as string))) throw new Error(`Registro ${i} de ${t}: fecha de actualización inválida.`);
      if (!isOptStr(rec.deviceId)) throw new Error(`Registro ${i} de ${t}: dispositivo inválido.`);
      if (!rec.deleted) {
        const err = CHECKS[t]?.(rec);
        if (err) throw new Error(`Registro ${i} de ${t}: ${err}.`);
      }
      return rec;
    });
  }
  return out;
}
