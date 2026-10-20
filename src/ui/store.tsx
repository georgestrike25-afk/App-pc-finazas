import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb } from '../db/db';
import { getGoal, loadDataSet, subscribe } from '../db/repo';
import type { DataSet } from '../domain/monthly';
import type { AuditEntry, DocumentMeta, SavingsGoal } from '../domain/types';
import { currentMonth, type MonthKey } from '../domain/dates';

export interface AppData extends DataSet {
  goal: SavingsGoal;
  documents: DocumentMeta[];
  audit: AuditEntry[];
}

async function loadAll(): Promise<AppData> {
  const db = getDb();
  const [ds, goal, documents, audit] = await Promise.all([
    loadDataSet(db),
    getGoal(db),
    db.documents.toArray(),
    db.audit.orderBy('at').reverse().limit(500).toArray(),
  ]);
  return { ...ds, goal, documents: documents.filter((d) => !d.deleted), audit };
}

interface Ctx {
  data: AppData | null;
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  today: MonthKey;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children, toast }: { children: ReactNode; toast: Ctx['toast'] }) {
  const [data, setData] = useState<AppData | null>(null);
  const today = currentMonth();
  const [month, setMonth] = useState<MonthKey>(today);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadAll()
        .then((d) => alive && setData(d))
        .catch(() => toast('No se pudieron leer los datos locales.', 'error'));
    load();
    const unsub = subscribe(load);
    return () => {
      alive = false;
      unsub();
    };
  }, [toast]);
  return <AppCtx.Provider value={{ data, month, setMonth, today, toast }}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx & { data: AppData } {
  const c = useContext(AppCtx);
  if (!c || !c.data) throw new Error('Datos no cargados');
  return c as Ctx & { data: AppData };
}

export function useAppMaybe() {
  return useContext(AppCtx);
}
