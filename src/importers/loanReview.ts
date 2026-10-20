import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { monthOf, todayIso } from '../domain/dates';
import { reviseObligation } from '../domain/obligations';
import { normalizeText, uid } from '../domain/text';
import type { Cents } from '../domain/money';
import type { DocumentMeta, Obligation } from '../domain/types';
import { summarizeLoan, type LoanRow, type LoanSchedule, type LoanSummary } from './loanSchedule';

export interface LoanReview {
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string };
  entity: string;
  /** La entidad no figura en el documento: se sugiere y debe confirmarse. */
  entityInferred: boolean;
  concept: string;
  loanNumber?: string;
  rows: LoanRow[];
  warnings: string[];
  existing?: Obligation;
  documentDuplicateOf?: DocumentMeta;
}

export function loanFingerprint(loanNumber: string | undefined, concept: string) {
  return loanNumber ? `prestamo|${loanNumber}` : `prestamo|${normalizeText(concept)}`;
}

export async function buildLoanReview(s: LoanSchedule, file: LoanReview['file'], fullText: string, db: FinanzasDB = getDb()): Promise<LoanReview> {
  const concept = `Préstamo ${s.loanType}${s.loanNumber ? ` N.º ${s.loanNumber}` : ''}`;
  const fp = loanFingerprint(s.loanNumber, concept);
  const existing = (await db.obligations.where('fingerprint').equals(fp).toArray()).find((o) => !o.deleted);
  const docs = (await db.documents.where('hash').equals(file.hash).toArray()).filter((d) => !d.deleted);
  const explicit = /patagonia/i.test(fullText) ? 'Banco Patagonia' : /naranja/i.test(fullText) ? 'Naranja X' : /mercado/i.test(fullText) ? 'Mercado Pago' : '';
  const warnings = [...s.warnings];
  if (existing) warnings.unshift('Este préstamo ya está registrado: se actualizará con los datos del cronograma (cuotas pagadas e importes), sin duplicarlo.');
  if (docs.length) warnings.unshift('Este documento ya fue importado.');
  if (!explicit) warnings.push('El cronograma no indica la entidad: verifíquela.');
  return {
    file,
    entity: existing?.entity ?? (explicit || 'Banco Patagonia'),
    entityInferred: !existing && !explicit,
    concept: existing?.concept ?? concept,
    loanNumber: s.loanNumber,
    rows: s.rows,
    warnings,
    existing,
    documentDuplicateOf: docs[0],
  };
}

export function loanReviewSummary(r: LoanReview): LoanSummary {
  return summarizeLoan(r.rows, todayIso());
}

/** Convierte el cronograma en una obligación con el importe exacto de cada cuota. */
export function loanToObligationFields(r: LoanReview): Pick<
  Obligation,
  'entity' | 'type' | 'concept' | 'originalAmount' | 'knownBalance' | 'originDate' | 'paidInstallments' | 'totalInstallments' | 'installmentAmount' | 'nextDueMonth' | 'dueDay' | 'frequency' | 'status' | 'variableAmount' | 'installmentOverrides' | 'capitalByInstallment' | 'dueDates' | 'loanNumber' | 'fingerprint'
> {
  const sm = loanReviewSummary(r);
  const overrides: Record<number, Cents> = {};
  const capital: Record<number, Cents> = {};
  const dates: Record<number, string> = {};
  for (const row of r.rows) {
    overrides[row.n] = row.total;
    if (row.capital !== undefined) capital[row.n] = row.capital;
    dates[row.n] = row.dueDate;
  }
  const next = r.rows.find((x) => x.n === sm.leadingPaid + 1);
  const done = sm.leadingPaid >= sm.totalInstallments;
  return {
    entity: r.entity || 'Sin identificar',
    type: 'prestamo',
    concept: r.concept,
    originalAmount: sm.originalCapital,
    knownBalance: sm.remainingCapital,
    originDate: r.rows[0].dueDate,
    paidInstallments: sm.leadingPaid,
    totalInstallments: sm.totalInstallments,
    installmentAmount: next?.total ?? r.rows[r.rows.length - 1].total,
    nextDueMonth: next ? monthOf(next.dueDate) : monthOf(r.rows[r.rows.length - 1].dueDate),
    dueDay: Number((next ?? r.rows[0]).dueDate.slice(8, 10)),
    frequency: 'mensual',
    status: done ? 'pagada' : 'pendiente',
    variableAmount: false,
    installmentOverrides: overrides,
    capitalByInstallment: Object.keys(capital).length ? capital : undefined,
    dueDates: dates,
    loanNumber: r.loanNumber,
    fingerprint: loanFingerprint(r.loanNumber, r.concept),
  };
}

export async function commitLoanReview(r: LoanReview, blob: Blob | null, db: FinanzasDB = getDb()): Promise<{ obligationId: string; updated: boolean }> {
  if (!r.rows.length) throw new Error('El cronograma no tiene cuotas.');
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const fields = loanToObligationFields(r);
  const documentId = uid();
  let obligationId = r.existing?.id ?? uid();
  const updated = !!r.existing;
  await db.transaction('rw', [db.documents, db.blobs, db.obligations, db.audit], async () => {
    const doc: DocumentMeta = {
      id: documentId,
      createdAt: now,
      updatedAt: now,
      deviceId,
      name: r.file.name.slice(0, 200),
      mime: r.file.mime,
      size: r.file.size,
      hash: r.file.hash,
      kind: r.file.kind,
      importedAt: now,
      entity: fields.entity,
      hasBlob: !!blob && settings.storeDocumentBlobs,
      summary: `Cronograma: ${fields.paidInstallments}/${fields.totalInstallments} cuotas pagadas`,
    };
    await db.documents.put(doc);
    if (blob && settings.storeDocumentBlobs) await db.blobs.put({ id: documentId, blob });
    if (r.existing) {
      const cur = (await db.obligations.get(r.existing.id)) ?? r.existing;
      const next = reviseObligation(cur, { ...fields, documentId }, fields.nextDueMonth ?? monthOf(now), 'Actualizado desde cronograma', now, monthOf(now));
      // El cronograma es la fuente exacta: sus importes reemplazan a los anteriores.
      next.installmentOverrides = fields.installmentOverrides;
      obligationId = cur.id;
      await db.obligations.put({ ...next, deviceId });
    } else {
      const ob: Obligation = { id: obligationId, createdAt: now, updatedAt: now, deviceId, ...fields, documentId, revisions: [] };
      await db.obligations.put(ob);
    }
    await addAudit(db, 'importar', 'obligaciones', obligationId, `${updated ? 'Actualización' : 'Alta'} de "${fields.concept}" desde cronograma (${fields.paidInstallments}/${fields.totalInstallments} pagadas)`, deviceId);
  });
  notify();
  return { obligationId, updated };
}
