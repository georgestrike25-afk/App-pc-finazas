import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { monthOf, type MonthKey } from '../domain/dates';
import type { Cents } from '../domain/money';
import { normalizeText, uid } from '../domain/text';
import type { DocumentMeta, Expense, ExpenseKind } from '../domain/types';
import type { SourceLine } from './statementParser';

/**
 * Planilla de gastos compartidos (p. ej. exportada de Google Sheets):
 * una fila por mes y, por cada gasto, una columna por persona.
 *
 *   Mes      | Alquiler      | Luz           | … | Alquiler de consultorio | obra social
 *            | Anto | Jorge  | Anto | Jorge  | … | Jorge                   | Anto | Jorge
 *   Octubre  | 449.758 | 224.879 | …
 */
export interface SharedSheet {
  year: number;
  people: string[];
  groups: Array<{ name: string; people: string[] }>;
  /** Importe por gasto, persona y mes (solo celdas con importe distinto de cero). */
  values: Array<{ month: MonthKey; group: string; person: string; amount: Cents; raw: string }>;
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function monthNumber(s: string): number | null {
  return MONTHS[normalizeText(s).replace(/[^a-z]/g, '')] ?? null;
}

/**
 * Importe escrito a mano en una planilla, donde cada celda puede usar otro formato:
 * "$449,758.00", "$408.149,53", "$7981,9", "4.085,2", "$7,916", "36157,85".
 * Regla: si hay punto y coma, el último es el decimal; si hay uno solo, es decimal
 * salvo que lo sigan exactamente tres cifras (separador de miles).
 */
export function parseSheetAmount(raw: string): Cents | null {
  let s = raw.replace(/[\s$]|ARS/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let int = s;
  let dec = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const d = Math.max(lastDot, lastComma);
    int = s.slice(0, d);
    dec = s.slice(d + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && tail.length !== 3) {
      int = parts[0];
      dec = tail;
    }
  }
  int = int.replace(/[.,]/g, '');
  if (!/^\d+$/.test(int) || !/^\d{0,2}$/.test(dec)) return null;
  const cents = Number(int) * 100 + Number((dec + '00').slice(0, 2));
  return neg ? -cents : cents;
}

interface Pos {
  s: string;
  left: number;
  right: number;
}

/** Fragmentos de un renglón con su posición; un fragmento con varios importes se divide. */
function positions(l: SourceLine): Pos[] {
  const out: Pos[] = [];
  for (const c of l.cells ?? []) {
    const w = c.w ?? 0;
    const tokens = c.s.split(/\s+(?=[$(-]?\d)/).filter(Boolean);
    let acc = 0;
    for (const t of tokens) {
      const start = acc;
      acc += t.length + 1;
      out.push({ s: t, left: c.x + (w * start) / c.s.length, right: c.x + (w * Math.min(acc - 1, c.s.length)) / c.s.length });
    }
  }
  return out;
}

const center = (p: Pos) => (p.left + p.right) / 2;

export function detectSharedSheet(lines: SourceLine[], opts: { fileName?: string; fallbackYear: number }): SharedSheet | null {
  const withCells = lines.filter((l) => l.cells && l.cells.length >= 3);
  const dataIdx = withCells.map((l, i) => (monthNumber(l.cells![0].s) ? i : -1)).filter((i) => i >= 0);
  if (dataIdx.length < 2) return null;
  const first = dataIdx[0];
  // Encabezado de personas: nombres cortos que se repiten, sin importes.
  let peopleRow = -1;
  for (let i = first - 1; i >= Math.max(0, first - 3); i--) {
    const cells = withCells[i].cells!.map((c) => c.s.trim());
    if (cells.some((c) => parseSheetAmount(c) !== null)) continue;
    const counts = new Map<string, number>();
    cells.forEach((c) => counts.set(normalizeText(c), (counts.get(normalizeText(c)) ?? 0) + 1));
    const repeated = [...counts.values()].filter((n) => n >= 2).length;
    if (cells.length >= 3 && repeated >= 1 && counts.size <= 4) {
      peopleRow = i;
      break;
    }
  }
  if (peopleRow < 1) return null;
  const groupRow = withCells[peopleRow - 1];
  if (!/^mes$/i.test(groupRow.cells![0].s.trim())) return null;

  const labels = positions(withCells[peopleRow]);
  const groupHeads = positions(groupRow).slice(1);
  const people: string[] = [];
  for (const l of labels) if (!people.some((p) => normalizeText(p) === normalizeText(l.s))) people.push(l.s);
  if (people.length !== 2) return null;

  // Cada grupo empieza cuando el orden de las personas vuelve atrás (Anto, Jorge | Anto, Jorge | Jorge | …).
  const order = (s: string) => people.findIndex((p) => normalizeText(p) === normalizeText(s));
  const labelGroup: number[] = [];
  let g = 0;
  labels.forEach((l, i) => {
    if (i > 0 && order(l.s) <= order(labels[i - 1].s)) g++;
    labelGroup.push(g);
  });
  const nGroups = g + 1;
  if (groupHeads.length < nGroups) return null;
  const groups = Array.from({ length: nGroups }, (_, k) => ({ name: groupHeads[k].s.trim(), people: labels.filter((_, i) => labelGroup[i] === k).map((l) => l.s) }));

  // Los importes van alineados a la derecha y los nombres centrados sobre su columna:
  // cada importe pertenece al nombre más cercano a la izquierda de su borde derecho.
  const vals: Array<{ row: number; p: Pos }> = [];
  for (const i of dataIdx) for (const p of positions(withCells[i]).slice(1)) vals.push({ row: i, p });
  const centers = labels.map(center);
  // Después de la última persona puede haber columnas sin nombre (p. ej. "Total Mes"): no se leen.
  const gaps = centers.slice(1).map((c, i) => c - centers[i]);
  const lastCenter = centers[centers.length - 1];
  const extraHead = groupHeads.slice(nGroups).map(center).find((c) => c > lastCenter);
  const lastBound = Math.min(extraHead ?? Infinity, lastCenter + Math.max(...gaps, 0));
  const labelFor = (r: number) => {
    let best = -1;
    centers.forEach((c, i) => {
      if (c <= r + 2 && (best < 0 || c > centers[best])) best = i;
    });
    if (best === centers.length - 1 && r > lastBound) return -1;
    return best;
  };

  const yearM = (opts.fileName ?? '').match(/(20\d{2})/) ?? lines.map((l) => l.text).join(' ').match(/\b(20\d{2})\b/);
  const year = yearM ? Number(yearM[1]) : opts.fallbackYear;
  const warnings: string[] = [];
  if (!yearM) warnings.push(`La planilla no dice el año: se tomó ${year}.`);
  const values: SharedSheet['values'] = [];
  const seen = new Set<string>();
  for (const v of vals) {
    const li = labelFor(v.p.right);
    if (li < 0) continue;
    const amount = parseSheetAmount(v.p.s);
    if (amount === null) {
      warnings.push(`No se pudo leer "${v.p.s}" (${withCells[v.row].cells![0].s}).`);
      continue;
    }
    const m = monthNumber(withCells[v.row].cells![0].s)!;
    const month = `${year}-${String(m).padStart(2, '0')}`;
    const key = `${month}|${li}`;
    if (seen.has(key)) {
      warnings.push(`Dos importes en la misma columna en ${withCells[v.row].cells![0].s}: revisá la fila.`);
      continue;
    }
    seen.add(key);
    if (amount !== 0) values.push({ month, group: groups[labelGroup[li]].name, person: labels[li].s, amount, raw: v.p.s });
  }
  if (!values.length) return null;
  return { year, people, groups, values, warnings };
}

/** Convierte las filas de una planilla (CSV/XLSX) al formato de renglones con columnas. */
export function gridToLines(rows: string[][]): SourceLine[] {
  return rows.map((r) => ({
    text: r.filter(Boolean).join('  '),
    cells: r.map((s, i) => ({ x: i * 100, w: 100, s: String(s ?? '').trim() })).filter((c) => c.s),
  }));
}

// ---------------------------------------------------------------------------
// Revisión e incorporación

export interface SharedRow {
  key: string;
  include: boolean;
  month: MonthKey;
  group: string;
  concept: string;
  category: string;
  kind: ExpenseKind;
  total: Cents;
  /** Tu parte. */
  user: Cents;
  userPct: number;
  note?: string;
  existing?: Expense;
  fingerprint: string;
}

export interface SharedReview {
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string };
  sheet: SharedSheet;
  me: string | null;
  rows: SharedRow[];
  skipped: string[];
  warnings: string[];
  documentDuplicateOf?: DocumentMeta;
}

const isHealth = (g: string) => /obra social|sancor|prepaga|osde|swiss|galeno|medicus/i.test(g);

function categoryFor(g: string): string {
  const n = normalizeText(g);
  if (isHealth(g)) return 'Obra social';
  if (/alquiler/.test(n)) return 'Alquiler';
  if (/\bluz\b|electric|edenor|edesur|epe\b/.test(n)) return 'Electricidad';
  if (/\bgas\b/.test(n)) return 'Gas';
  if (/internet|wifi|fibra/.test(n)) return 'Internet';
  if (/telefon|celular/.test(n)) return 'Telefonía';
  if (/super|mercado/.test(n)) return 'Supermercado';
  return 'Servicios del hogar';
}

function prettyName(g: string): string {
  const t = g.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const sheetFingerprint = (group: string, month: MonthKey) => `planilla|${normalizeText(group)}|${month}`;

/** Quién es el usuario por defecto: la persona que no coincide con el nombre de la pareja. */
export function guessMe(people: string[], partnerName: string): string | null {
  const pn = normalizeText(partnerName);
  if (!pn || pn === 'pareja') return null;
  const match = people.findIndex((p) => {
    const n = normalizeText(p);
    return n === pn || pn.startsWith(n) || n.startsWith(pn);
  });
  return match >= 0 ? people[1 - match] : null;
}

/** Arma las filas a cargar según quién es el usuario en la planilla. */
export function sheetRows(sheet: SharedSheet, me: string, expenses: Expense[], today: MonthKey): { rows: SharedRow[]; skipped: string[] } {
  const isMe = (p: string) => normalizeText(p) === normalizeText(me);
  const rows: SharedRow[] = [];
  const skipped = new Set<string>();
  const months = [...new Set(sheet.values.map((v) => v.month))].sort();
  for (const g of sheet.groups) {
    const hasMe = g.people.some(isMe);
    const hasPartner = g.people.some((p) => !isMe(p));
    if (/^total/i.test(normalizeText(g.name))) continue;
    for (const month of months) {
      const mine = sheet.values.find((v) => v.group === g.name && v.month === month && isMe(v.person));
      const theirs = sheet.values.find((v) => v.group === g.name && v.month === month && !isMe(v.person));
      if (theirs && isHealth(g.name)) skipped.add(`${prettyName(g.name)} de ${theirs.person}: es lo que te devuelve de su cuota; la app ya lo toma del resumen de la tarjeta (reintegro de Sancor).`);
      if (!hasMe) {
        if (theirs) skipped.add(`${prettyName(g.name)}: solo tiene importes de ${theirs.person}.`);
        continue;
      }
      if (!mine) continue;
      const shared = hasPartner && !isHealth(g.name) && !!theirs && theirs.amount >= mine.amount;
      const total = shared ? theirs!.amount : mine.amount;
      const userPct = shared ? Math.round((mine.amount / total) * 1_000_000) / 10_000 : 100;
      const fingerprint = sheetFingerprint(g.name, month);
      const existing = expenses.find((e) => !e.deleted && e.linkedLineFingerprints?.includes(fingerprint));
      const concept = prettyName(g.name);
      const manual = !existing && expenses.find((e) => !e.deleted && e.month === month && e.source === 'manual' && normalizeText(e.concept).includes(normalizeText(concept).split(' ')[0]));
      let include = month <= today;
      let note: string | undefined;
      if (month > today) note = 'Mes que todavía no llegó: marcalo si querés cargarlo igual.';
      if (existing) {
        const same = existing.totalAmount === total && Math.abs(existing.userPct - userPct) < 0.001;
        include = !same && month <= today;
        note = same ? 'Ya estaba cargado.' : 'Ya estaba cargado con otro importe: se actualiza.';
      } else if (manual) {
        include = false;
        note = `Ya anotaste «${manual.concept}» en ese mes. Marcalo solo si es otro gasto.`;
      }
      // La obra social (Sancor) ya viene en el resumen de la tarjeta: cargarla también desde la planilla la contaría dos veces.
      if (isHealth(g.name) && !existing) {
        include = false;
        note = 'Ya viene en el resumen de la tarjeta (Sancor): no se carga para no contarla dos veces. Marcala solo si la pagás aparte.';
      }
      rows.push({
        key: `${g.name}|${month}`,
        include,
        month,
        group: g.name,
        concept,
        category: categoryFor(g.name),
        kind: shared ? 'hogar' : 'personal',
        total,
        user: mine.amount,
        userPct,
        note,
        existing,
        fingerprint,
      });
    }
  }
  rows.sort((a, b) => b.month.localeCompare(a.month) || a.concept.localeCompare(b.concept));
  return { rows, skipped: [...skipped] };
}

export async function buildSharedReview(sheet: SharedSheet, file: SharedReview['file'], db: FinanzasDB = getDb(), today: MonthKey = monthOf(nowIso())): Promise<SharedReview> {
  const settings = await getSettings(db);
  const docs = (await db.documents.where('hash').equals(file.hash).toArray()).filter((d) => !d.deleted);
  const me = guessMe(sheet.people, settings.partnerName);
  const expenses = await db.expenses.toArray();
  const r = me ? sheetRows(sheet, me, expenses, today) : { rows: [], skipped: [] };
  const warnings = [...sheet.warnings];
  if (docs.length) warnings.unshift('Este documento ya fue importado: lo que ya estaba cargado queda desmarcado.');
  return { file, sheet, me, rows: r.rows, skipped: r.skipped, warnings, documentDuplicateOf: docs[0] };
}

export async function setSharedMe(review: SharedReview, me: string, db: FinanzasDB = getDb(), today: MonthKey = monthOf(nowIso())): Promise<SharedReview> {
  const r = sheetRows(review.sheet, me, await db.expenses.toArray(), today);
  return { ...review, me, rows: r.rows, skipped: r.skipped };
}

export async function commitSharedReview(r: SharedReview, blob: Blob | null, db: FinanzasDB = getDb()): Promise<{ created: number; updated: number }> {
  if (!r.me) throw new Error('Elegí quién sos vos en la planilla.');
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const today = monthOf(now);
  const documentId = uid();
  const partner = r.sheet.people.find((p) => normalizeText(p) !== normalizeText(r.me!)) ?? '';
  let created = 0;
  let updated = 0;
  await db.transaction('rw', [db.documents, db.blobs, db.expenses, db.settings, db.audit], async () => {
    const rows = r.rows.filter((x) => x.include);
    await db.documents.put({
      id: documentId, createdAt: now, updatedAt: now, deviceId, name: r.file.name.slice(0, 200), mime: r.file.mime, size: r.file.size, hash: r.file.hash, kind: r.file.kind,
      importedAt: now, hasBlob: !!blob && settings.storeDocumentBlobs, summary: `Planilla de gastos compartidos: ${rows.length} gasto(s)`,
    });
    if (blob && settings.storeDocumentBlobs) await db.blobs.put({ id: documentId, blob });
    for (const x of rows) {
      const shared = x.kind === 'hogar';
      const base = {
        kind: x.kind, category: x.category, concept: x.concept, date: `${x.month}-01`, month: x.month, totalAmount: x.total, userPct: shared ? x.userPct : 100,
        paidBy: shared ? ('cada_uno' as const) : undefined, paid: x.month <= today, frequency: 'unica' as const, paymentMethod: 'transferencia' as const, documentId,
        linkedLineFingerprints: [x.fingerprint], source: 'importado' as const,
        notes: shared ? `De la planilla de gastos compartidos: ${partner} paga la factura y vos le pasás tu parte.` : 'De la planilla de gastos compartidos.',
      };
      const cur = x.existing ? await db.expenses.get(x.existing.id) : undefined;
      if (cur && !cur.deleted) {
        await db.expenses.put({ ...cur, ...base, id: cur.id, createdAt: cur.createdAt, updatedAt: now, deviceId });
        updated++;
      } else {
        await db.expenses.put({ id: uid(), createdAt: now, updatedAt: now, deviceId, ...base });
        created++;
      }
    }
    // Si la pareja todavía no tiene nombre, se toma el de la planilla.
    if (partner && normalizeText(settings.partnerName) === 'pareja') await db.settings.put({ ...settings, partnerName: partner, updatedAt: now, deviceId });
    await addAudit(db, 'importar', 'gastos', documentId, `Planilla de gastos compartidos: ${created} gasto(s) nuevo(s), ${updated} actualizado(s)`, deviceId);
  });
  notify();
  return { created, updated };
}
