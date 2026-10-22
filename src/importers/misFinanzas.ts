import type { Cents } from '../domain/money';
import { normalizeText } from '../domain/text';
import { suggestCategory } from './classify';
import type { ParsedDocument, ParsedItem } from './statementParser';

/**
 * Historial de la app "Mis Finanzas" (registro de gastos diarios desde notificaciones):
 * - copia de seguridad JSON (mis_finanzas_AAAA-MM-DD.json): { version, creado, movimientos: [...] }
 * - exportación CSV/Excel: Fecha;Tipo;Categoría;Descripción;Cuenta;Monto
 */
export interface MfMovement {
  /** dd/mm/aaaa o aaaa-mm-dd */
  date: string;
  tipo: 'INGRESO' | 'GASTO' | 'TRANSFERENCIA_PROPIA';
  category: string;
  description: string;
  account: string;
  amount: Cents;
  installment?: { n: number; total: number };
}

const isoFromMs = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Copia de seguridad JSON de Mis Finanzas. */
export function readMisFinanzasJson(text: string): MfMovement[] | null {
  let o: unknown;
  try {
    o = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  const r = o as { version?: number; creado?: number; movimientos?: unknown[] };
  if (!r || typeof r !== 'object' || !Array.isArray(r.movimientos) || typeof r.creado !== 'number') return null;
  const out: MfMovement[] = [];
  for (const m of r.movimientos as Array<Record<string, unknown>>) {
    if (typeof m.fecha !== 'number' || typeof m.montoCentavos !== 'number' || typeof m.tipo !== 'string') continue;
    if (!['INGRESO', 'GASTO', 'TRANSFERENCIA_PROPIA'].includes(m.tipo)) continue;
    out.push({
      date: isoFromMs(m.fecha),
      tipo: m.tipo as MfMovement['tipo'],
      category: String(m.categoria ?? ''),
      description: String(m.descripcion ?? '').trim(),
      account: String(m.cuenta ?? ''),
      amount: Math.abs(Math.round(m.montoCentavos)),
      installment: typeof m.cuotaNumero === 'number' && typeof m.cuotaTotal === 'number' ? { n: m.cuotaNumero, total: m.cuotaTotal } : undefined,
    });
  }
  return out;
}

const TIPO: Record<string, MfMovement['tipo']> = { ingreso: 'INGRESO', gasto: 'GASTO', 'entre mis cuentas': 'TRANSFERENCIA_PROPIA' };

/** Exportación CSV o Excel de Mis Finanzas (encabezado Fecha;Tipo;Categoría;Descripción;Cuenta;Monto). */
export function readMisFinanzasRows(rows: unknown[][]): MfMovement[] | null {
  const head = (rows[0] ?? []).map((c) => normalizeText(String(c ?? '')).replace(/^﻿/, ''));
  const want = ['fecha', 'tipo', 'categoria', 'descripcion', 'cuenta', 'monto'];
  if (want.some((w, i) => head[i] !== w)) return null;
  const out: MfMovement[] = [];
  for (const r of rows.slice(1)) {
    const tipo = TIPO[normalizeText(String(r[1] ?? ''))];
    if (!tipo) continue;
    const date = parseDate(r[0]);
    const amount = parseAmountMf(r[5]);
    if (!date || amount === null) continue;
    let description = String(r[3] ?? '').trim();
    let installment: MfMovement['installment'];
    const c = description.match(/\s*\(cuota (\d+)\/(\d+)\)$/i);
    if (c) {
      installment = { n: Number(c[1]), total: Number(c[2]) };
      description = description.slice(0, c.index).trim();
    }
    out.push({ date, tipo, category: String(r[2] ?? ''), description, account: String(r[4] ?? ''), amount: Math.abs(amount), installment });
  }
  return out;
}

function parseDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) return isoFromMs(v.getTime());
  const m = String(v ?? '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

function parseAmountMf(v: unknown): Cents | null {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').trim().replace(/\s|\$/g, '');
  const m = s.match(/^(-?)(\d+(?:\.\d{3})*)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  const cents = Number(m[2].replace(/\./g, '')) * 100 + Number(((m[3] ?? '') + '00').slice(0, 2));
  return m[1] ? -cents : cents;
}

/** Arma el documento para la pantalla de revisión (cada movimiento en el mes de su fecha). */
export function misFinanzasToParsed(movs: MfMovement[]): ParsedDocument {
  const items: ParsedItem[] = movs
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m, index): ParsedItem => {
      const sug = suggestCategory(`${m.category} ${m.description}`);
      const warnings: string[] = [];
      let kind: ParsedItem['kind'] = m.tipo === 'GASTO' ? 'consumo' : m.tipo === 'INGRESO' ? 'ingreso' : 'transferencia';
      if (m.tipo === 'TRANSFERENCIA_PROPIA') warnings.push('Movimiento entre tus cuentas: no es ingreso ni gasto.');
      if (m.tipo === 'INGRESO') warnings.push('Ingreso registrado en Mis Finanzas: no se carga por defecto (el sueldo ya llega con los movimientos del banco). Marcalo si querés sumarlo.');
      if (m.installment) {
        kind = 'transferencia';
        warnings.push(`Cuota ${m.installment.n}/${m.installment.total}: las cuotas llegan con el resumen de la tarjeta, no se cargan desde acá.`);
      }
      return {
        index,
        kind,
        date: m.date,
        dateConfidence: 'alta',
        concept: m.description || m.category || 'Sin descripción',
        amount: m.amount,
        amountConfidence: 'alta',
        currency: 'ARS',
        installment: m.installment,
        suggestedCategory: m.category && m.category !== 'Otros' ? m.category : sug.category,
        suggestedKind: 'cotidiano',
        confidence: 'alta',
        warnings,
        sourceLine: `${m.date} · ${m.tipo} · ${m.category} · ${m.description} · ${m.account} · ${(m.amount / 100).toFixed(2)}`,
        account: m.account,
      };
    });
  const last = items.at(-1)?.date?.slice(0, 7);
  return {
    docType: 'historial',
    entity: { value: 'Mis Finanzas', confidence: 'alta' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: { confidence: 'baja' },
    minimumPayment: { confidence: 'baja' },
    closingDate: { confidence: 'baja' },
    dueDate: { confidence: 'baja' },
    previousBalance: { confidence: 'baja' },
    nextClosingDate: { confidence: 'baja' },
    nextDueDate: { confidence: 'baja' },
    upcoming: [],
    month: last,
    items,
    warnings: ['Historial de Mis Finanzas: cada gasto va al mes de su fecha. Lo que ya está cargado (por resúmenes, extractos o a mano) queda desmarcado para no contarlo dos veces.'],
    undetermined: [],
    lineCount: items.length,
  };
}
