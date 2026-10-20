import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { addMonths, monthDiff, monthOf } from '../domain/dates';
import { buildSchedule, entityGroup, reviseObligation } from '../domain/obligations';
import { normalizeText, uid } from '../domain/text';
import type { Cents } from '../domain/money';
import type { DocumentMeta, Obligation, ObligationType } from '../domain/types';
import type { PaymentPlan } from './paymentPlan';

export interface PlanCategory {
  name: string;
  include: boolean;
  type: ObligationType;
  concept: string;
  /** Importe por mes desde el primer mes con importe hasta el último. */
  amounts: Array<{ month: string; amount: Cents }>;
  existing?: Obligation;
}

export interface PlanReview {
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string };
  entity: string;
  plan: PaymentPlan;
  categories: PlanCategory[];
  warnings: string[];
  documentDuplicateOf?: DocumentMeta;
}

export function planFingerprint(entity: string, category: string) {
  return `plan|${normalizeText(entityGroup(entity))}|${normalizeText(category)}`;
}

function categoryAmounts(plan: PaymentPlan, cat: string) {
  const rows = plan.months.map((m) => ({ month: m.month, amount: Object.keys(m.parts).length ? m.parts[cat] ?? 0 : m.total }));
  while (rows.length && rows[0].amount === 0) rows.shift();
  while (rows.length && rows[rows.length - 1].amount === 0) rows.pop();
  // Completa meses intermedios faltantes con 0 para mantener el calendario mensual.
  const out: Array<{ month: string; amount: Cents }> = [];
  for (const r of rows) {
    while (out.length && monthDiff(out[out.length - 1].month, r.month) > 1) out.push({ month: addMonths(out[out.length - 1].month, 1), amount: 0 });
    out.push(r);
  }
  return out;
}

export async function buildPlanReview(plan: PaymentPlan, file: PlanReview['file'], db: FinanzasDB = getDb()): Promise<PlanReview> {
  const entity = plan.entity ?? '';
  const obs = (await db.obligations.toArray()).filter((o) => !o.deleted);
  const docs = (await db.documents.where('hash').equals(file.hash).toArray()).filter((d) => !d.deleted);
  const warnings = [...plan.warnings];
  const categories: PlanCategory[] = plan.categories.map((name): PlanCategory => {
    const isLoan = /pr[eé]stamo|cr[eé]dito/i.test(name) && !/tarjeta/i.test(name);
    const existing = obs.find((o) => o.fingerprint === planFingerprint(entity, name));
    return {
      name,
      include: true,
      type: isLoan ? 'prestamo' : 'compra_cuotas',
      concept: existing?.concept ?? `${entity || 'Entidad'} · ${isLoan ? 'Préstamos' : name === 'Tarjeta' ? 'Tarjeta de crédito' : name} (plan de pagos)`,
      amounts: categoryAmounts(plan, name),
      existing,
    };
  }).filter((c) => c.amounts.length);
  const others = obs.filter((o) => entity && entityGroup(o.entity) === entityGroup(entity) && !o.fingerprint?.startsWith('plan|') && o.status !== 'cancelada');
  if (others.length)
    warnings.push(`Ya hay ${others.length} deuda(s) de ${entityGroup(entity)} cargadas por separado (${others.map((o) => o.concept).join(', ')}). Si están incluidas en este plan, no las cuente dos veces: desmarque la categoría o cancele esas deudas.`);
  if (categories.some((c) => c.existing)) warnings.unshift('Este plan ya estaba cargado: se actualizará con los importes nuevos (los meses anteriores quedan como pagados).');
  if (docs.length) warnings.unshift('Este documento ya fue importado.');
  return { file, entity, plan, categories, warnings, documentDuplicateOf: docs[0] };
}

export async function commitPlanReview(r: PlanReview, blob: Blob | null, db: FinanzasDB = getDb()): Promise<{ created: number; updated: number }> {
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const today = monthOf(now);
  const documentId = uid();
  let created = 0;
  let updated = 0;
  await db.transaction('rw', [db.documents, db.blobs, db.obligations, db.audit], async () => {
    await db.documents.put({
      id: documentId, createdAt: now, updatedAt: now, deviceId, name: r.file.name.slice(0, 200), mime: r.file.mime, size: r.file.size, hash: r.file.hash, kind: r.file.kind,
      importedAt: now, entity: r.entity || undefined, hasBlob: !!blob && settings.storeDocumentBlobs, summary: `Plan de pagos: ${r.categories.filter((c) => c.include).length} deuda(s)`,
    });
    if (blob && settings.storeDocumentBlobs) await db.blobs.put({ id: documentId, blob });
    for (const c of r.categories) {
      if (!c.include || !c.amounts.length) continue;
      const fp = planFingerprint(r.entity, c.name);
      const first = c.amounts[0].month;
      if (c.existing) {
        const cur = (await db.obligations.get(c.existing.id)) ?? c.existing;
        // Las cuotas del plan anterior que vencían antes del primer mes del plan nuevo se consideran pagadas.
        const old = buildSchedule(cur, today).filter((i) => i.month < first);
        const paid = old.length;
        const overrides: Record<number, Cents> = {};
        old.forEach((i) => (overrides[i.n] = i.amount ?? 0));
        c.amounts.forEach((a, k) => (overrides[paid + k + 1] = a.amount));
        const next = reviseObligation(cur, {
          entity: r.entity || cur.entity, concept: c.concept, type: c.type, paidInstallments: paid, totalInstallments: paid + c.amounts.length,
          installmentAmount: c.amounts[0].amount, nextDueMonth: first, status: 'pendiente', documentId,
        }, first, 'Actualizado desde plan de pagos', now, today);
        next.installmentOverrides = overrides;
        await db.obligations.put({ ...next, deviceId });
        updated++;
      } else {
        const overrides: Record<number, Cents> = {};
        c.amounts.forEach((a, k) => (overrides[k + 1] = a.amount));
        const ob: Obligation = {
          id: uid(), createdAt: now, updatedAt: now, deviceId, entity: r.entity || 'Sin identificar', type: c.type, concept: c.concept,
          paidInstallments: 0, totalInstallments: c.amounts.length, installmentAmount: c.amounts[0].amount, nextDueMonth: first, frequency: 'mensual',
          status: 'pendiente', variableAmount: false, installmentOverrides: overrides, documentId, fingerprint: fp,
          notes: 'Importado de un plan de pagos estimado por el emisor (no incluye nuevos consumos).', revisions: [],
        };
        await db.obligations.put(ob);
        created++;
      }
    }
    await addAudit(db, 'importar', 'obligaciones', documentId, `Plan de pagos de ${r.entity || 'entidad'}: ${created} creada(s), ${updated} actualizada(s)`, deviceId);
  });
  notify();
  return { created, updated };
}
