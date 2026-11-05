import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, dropUndonePayments, getDeviceId, notify, nowIso } from '../db/repo';
import { addMonths, monthOf, todayIso, type MonthKey } from '../domain/dates';
import { sum, type Cents } from '../domain/money';
import { buildSchedule, cancelObligation, reviseObligation } from '../domain/obligations';
import { debtPaymentExpense } from '../domain/payments';
import { uid } from '../domain/text';
import type { DocumentMeta, Obligation } from '../domain/types';
import type { MpCardMonth, MpCredit, MpScreens } from './mercadoPago';
import { planFingerprint } from './planReview';

/**
 * Revisión de las pantallas de Mercado Pago: cada crédito queda como una deuda aparte con sus cuotas pagadas,
 * reemplaza a "Préstamos (plan de pagos)" (que los juntaba a todos) y la tarjeta toma el total de cada mes.
 * Muestra qué tenía la app antes, para ver qué estaba marcado como pagado.
 */

export const mpCreditFingerprint = (c: MpCredit) => `mp|credito|${c.requestedOn}`;
const ENTITY = 'Mercado Pago';

export interface MpCreditRow extends MpCredit {
  concept: string;
  existing?: Obligation;
}
export interface MpCardRow extends MpCardMonth {
  /** Lo que figuraba en la app para ese mes. */
  before?: { amount: Cents; paid: boolean };
}
export interface MpReview {
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string };
  today: MonthKey;
  credits: MpCreditRow[];
  card: MpCardRow[];
  /** "Préstamos (plan de pagos)": se reemplaza por los créditos. */
  loansPlan?: { ob: Obligation; month?: { amount: Cents; paid: boolean } };
  cardPlan?: Obligation;
  /** Cuotas de los créditos que Mercado Pago ya cobró este mes y que la app no tenía como pagadas. */
  unpaidInApp?: Cents;
  payMonth: boolean;
  warnings: string[];
}

const dmy = (iso: string) => iso.split('-').reverse().join('/');
const conceptOf = (c: MpCredit) => (/pr[eé]stamo/i.test(c.name) ? `${c.name} del ${dmy(c.requestedOn)}` : c.name);

export async function buildMpReview(s: MpScreens, file: MpReview['file'], today: MonthKey = monthOf(todayIso()), db: FinanzasDB = getDb()): Promise<MpReview> {
  const obs = (await db.obligations.toArray()).filter((o) => !o.deleted);
  const credits = s.credits.map((c): MpCreditRow => {
    const existing = obs.find((o) => o.fingerprint === mpCreditFingerprint(c));
    return { ...c, concept: existing?.concept ?? conceptOf(c), existing };
  });
  const active = (o: Obligation) => o.status !== 'cancelada' && (!o.cancelledFrom || o.cancelledFrom > today);
  const lp = credits.length ? obs.find((o) => o.fingerprint === planFingerprint(ENTITY, 'Préstamos') && active(o)) : undefined;
  const lpMonth = lp && buildSchedule(lp, today).find((i) => i.month === today);
  const cardPlan = obs.find((o) => o.fingerprint === planFingerprint(ENTITY, 'Tarjeta'));
  const cardSched = cardPlan ? buildSchedule(cardPlan, today) : [];
  const card = s.card.map((m): MpCardRow => {
    const i = cardSched.find((x) => x.month === m.month);
    return { ...m, before: i ? { amount: i.amount ?? 0, paid: i.status === 'pagada' } : undefined };
  });
  // Cuotas de este mes que Mercado Pago ya cobró (la próxima vence el mes que viene).
  const paidThisMonth = sum(credits.filter((c) => c.nextN > 1 && c.due && monthOf(c.due) === addMonths(today, 1)).map((c) => c.installment));
  const unpaidInApp = lp && lpMonth && lpMonth.status !== 'pagada' && paidThisMonth > 0 ? paidThisMonth : undefined;
  const warnings = [...s.warnings];
  if (card.some((m) => m.month > today)) warnings.push('El total de los meses que todavía no cerraron es "hasta hoy": puede subir si comprás algo más con la tarjeta.');
  return { file, today, credits, card, loansPlan: lp ? { ob: lp, month: lpMonth ? { amount: lpMonth.amount ?? 0, paid: lpMonth.status === 'pagada' } : undefined } : undefined, cardPlan, unpaidInApp, payMonth: false, warnings };
}

export async function commitMpReview(r: MpReview, db: FinanzasDB = getDb()): Promise<{ created: number; updated: number }> {
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  // El mismo video subido otra vez usa el mismo documento (si no, la limpieza de duplicados borraría lo actualizado).
  const sameDoc = (await db.documents.where('hash').equals(r.file.hash).toArray()).find((d) => !d.deleted);
  const documentId = sameDoc?.id ?? uid();
  const base = { createdAt: now, updatedAt: now, deviceId };
  let created = 0;
  let updated = 0;
  const lowered: Array<[Obligation, Obligation]> = [];
  await db.transaction('rw', [db.documents, db.obligations, db.expenses, db.audit], async () => {
    if (!sameDoc) await db.documents.put({
      id: documentId, ...base, name: r.file.name.slice(0, 200), mime: r.file.mime, size: r.file.size, hash: r.file.hash, kind: r.file.kind,
      importedAt: now, entity: ENTITY, hasBlob: false,
      summary: [r.credits.length ? `${r.credits.length} crédito(s)` : '', r.card.length ? `tarjeta ${r.card.map((m) => m.month).join(', ')}` : ''].filter(Boolean).join(' · ') + ' (Mercado Pago)',
    });

    for (const c of r.credits) {
      const next = c.due ? monthOf(c.due) : addMonths(r.today, 1);
      const fields = {
        entity: ENTITY, type: 'prestamo' as const, concept: c.concept, originalAmount: c.requested, knownBalance: c.remaining, originDate: c.requestedOn,
        paidInstallments: c.nextN - 1, totalInstallments: c.totalN, installmentAmount: c.installment, nextDueMonth: next, dueDay: c.due ? Number(c.due.slice(8, 10)) : undefined,
        frequency: 'mensual' as const, status: 'pendiente' as const, variableAmount: false, fingerprint: mpCreditFingerprint(c), documentId,
      };
      const cur = c.existing && (await db.obligations.get(c.existing.id));
      if (cur && !cur.deleted) {
        const nx = { ...reviseObligation(cur, fields, next, 'Actualizado desde Mercado Pago', now, r.today), deviceId };
        nx.installmentOverrides = undefined;
        await db.obligations.put(nx);
        if (nx.paidInstallments < cur.paidInstallments) lowered.push([cur, nx]);
        updated++;
      } else {
        await db.obligations.put({ id: uid(), ...base, ...fields, revisions: [], notes: 'Crédito de Mercado Pago (leído de la app de Mercado Pago).' });
        created++;
      }
    }

    // El plan de pagos juntaba todos los préstamos: desde este mes van los créditos uno por uno.
    if (r.loansPlan && r.credits.length) {
      const cur = (await db.obligations.get(r.loansPlan.ob.id)) ?? r.loansPlan.ob;
      await db.obligations.put({ ...cancelObligation(cur, r.today, now, r.today), deviceId, notes: `${cur.notes ? `${cur.notes} ` : ''}Reemplazado por los créditos de Mercado Pago uno por uno.` });
      updated++;
    }

    // Tarjeta: cada mes con su total; los meses anteriores quedan pagados y los que muestra el video, sin pagar.
    if (r.card.length) {
      const first = r.card[0].month;
      const cur = r.cardPlan && (await db.obligations.get(r.cardPlan.id));
      if (cur && !cur.deleted) {
        const old = buildSchedule(cur, r.today).filter((i) => i.month < first);
        const overrides: Record<number, Cents> = {};
        old.forEach((i) => (overrides[i.n] = i.amount ?? 0));
        r.card.forEach((m, k) => (overrides[old.length + k + 1] = m.total));
        const nx = { ...reviseObligation(cur, { paidInstallments: old.length, totalInstallments: old.length + r.card.length, installmentAmount: r.card[0].total, nextDueMonth: first, dueDay: Number(r.card[0].due.slice(8, 10)), status: 'pendiente', cancelledFrom: undefined, documentId }, first, 'Actualizado desde Mercado Pago (tarjeta)', now, r.today), deviceId };
        nx.installmentOverrides = overrides;
        await db.obligations.put(nx);
        if (nx.paidInstallments < cur.paidInstallments) lowered.push([cur, nx]);
        updated++;
      } else {
        const overrides: Record<number, Cents> = {};
        r.card.forEach((m, k) => (overrides[k + 1] = m.total));
        await db.obligations.put({
          id: uid(), ...base, entity: ENTITY, type: 'compra_cuotas', concept: 'Mercado Pago · Tarjeta de crédito', paidInstallments: 0, totalInstallments: r.card.length,
          installmentAmount: r.card[0].total, nextDueMonth: first, dueDay: Number(r.card[0].due.slice(8, 10)), frequency: 'mensual', status: 'pendiente', variableAmount: false,
          installmentOverrides: overrides, documentId, fingerprint: planFingerprint(ENTITY, 'Tarjeta'), revisions: [],
          notes: 'Total de cada mes leído de la app de Mercado Pago. Cuando tengas el resumen, subilo.',
        });
        created++;
      }
    }

    if (r.payMonth && r.unpaidInApp) await db.expenses.put({ ...debtPaymentExpense(`Cuotas de los créditos de Mercado Pago (${r.today.split('-').reverse().join('/')})`, r.unpaidInApp, todayIso(), now, deviceId), documentId });
    await addAudit(db, 'importar', 'obligaciones', documentId, `Mercado Pago: ${created} deuda(s) nueva(s), ${updated} actualizada(s)`, deviceId);
  });
  // Si algo quedó con menos cuotas pagadas (p. ej. la tarjeta marcada por error), su pago deja de bajar la plata.
  for (const [a, b] of lowered) await dropUndonePayments(a, b, db);
  notify();
  return { created, updated };
}
