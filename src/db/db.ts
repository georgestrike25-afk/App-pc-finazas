import Dexie, { type Table } from 'dexie';
import type {
  AuditEntry,
  CardPayment,
  DocumentMeta,
  Expense,
  Income,
  LineFingerprint,
  Obligation,
  SancorCharge,
  SavingsGoal,
  Settings,
  Statement,
} from '../domain/types';

export interface BlobRow {
  id: string;
  blob: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class FinanzasDB extends Dexie {
  incomes!: Table<Income, string>;
  expenses!: Table<Expense, string>;
  obligations!: Table<Obligation, string>;
  statements!: Table<Statement, string>;
  cardPayments!: Table<CardPayment, string>;
  sancor!: Table<SancorCharge, string>;
  goals!: Table<SavingsGoal, string>;
  documents!: Table<DocumentMeta, string>;
  fingerprints!: Table<LineFingerprint, string>;
  audit!: Table<AuditEntry, string>;
  settings!: Table<Settings, string>;
  blobs!: Table<BlobRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'finanzas-personales') {
    super(name);
    this.version(1).stores({
      incomes: 'id, month, updatedAt',
      expenses: 'id, month, kind, updatedAt',
      obligations: 'id, fingerprint, updatedAt',
      statements: 'id, month, updatedAt',
      cardPayments: 'id, month, updatedAt',
      sancor: 'id, month, updatedAt',
      goals: 'id, updatedAt',
      documents: 'id, hash, updatedAt',
      fingerprints: 'id, fingerprint, updatedAt',
      audit: 'id, at, updatedAt',
      settings: 'id',
      blobs: 'id',
      meta: 'key',
    });
  }
}

let instance: FinanzasDB | null = null;

export function getDb(): FinanzasDB {
  if (!instance) instance = new FinanzasDB();
  return instance;
}

/** Solo para pruebas: usa una base aislada. */
export function setDb(db: FinanzasDB) {
  instance = db;
}
