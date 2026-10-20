import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { currentMonth, daysBetween, monthOf, type MonthKey } from '../domain/dates';
import { applyStatementInstallment, findMatchingObligation, obligationFingerprintKey, impliedStartMonth } from '../domain/obligations';
import { normalizeText, sha256Hex, uid } from '../domain/text';
import type { Cents } from '../domain/money';
import type {
  CardPayment,
  DocumentMeta,
  Expense,
  ExpenseKind,
  LineFingerprint,
  Obligation,
  ObligationType,
  SancorCharge,
  Statement,
} from '../domain/types';
import type { Confidence, ParsedDocument, ParsedItem } from './statementParser';

export type ReviewAction = 'gasto' | 'cuota' | 'pago' | 'sancor' | 'vincular' | 'ignorar';

export interface DuplicateInfo {
  type: 'linea' | 'gasto_manual' | 'obligacion' | 'sancor';
  targetId?: string;
  label: string;
}

export interface ReviewItem {
  key: string;
  include: boolean;
  action: ReviewAction;
  parsedKind: ParsedItem['kind'];
  date?: string;
  month: MonthKey;
  concept: string;
  amount?: Cents;
  currency: 'ARS' | 'USD';
  installmentN?: number;
  installmentTotal?: number;
  expenseKind: ExpenseKind;
  category: string;
  userPct: number;
  confidence: Confidence;
  warnings: string[];
  needsReview: boolean;
  reviewed: boolean;
  fingerprint: string;
  duplicate?: DuplicateInfo;
  sourceLine: string;
  obligationType: ObligationType;
}

export interface ReviewSummary {
  entity: string;
  entityConfidence: Confidence;
  closingDate?: string;
  dueDate?: string;
  month?: MonthKey;
  total?: Cents;
  minimumPayment?: Cents;
  previousBalance?: Cents;
  currency: ParsedDocument['currency'];
  registerStatement: boolean;
}

export interface ImportReview {
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string };
  documentDuplicateOf?: DocumentMeta;
  summary: ReviewSummary;
  items: ReviewItem[];
  warnings: string[];
  undetermined: string[];
  ocrUsed: boolean;
}

export function guessObligationType(concept: string): ObligationType {
  const n = normalizeText(concept);
  if (/\bplan v\b/.test(n)) return 'plan_v';
  if (/refinanc/.test(n)) return 'refinanciacion';
  if (/prestamo|adelanto/.test(n)) return 'prestamo';
  if (/financiacion|plan de pagos/.test(n)) return 'financiacion';
  return 'compra_cuotas';
}

export async function lineFingerprint(entity: string, it: { date?: string; concept: string; amount?: Cents; installmentN?: number; installmentTotal?: number }, occurrence = 0) {
  const key = [normalizeText(entity), it.date ?? '?', normalizeText(it.concept), it.amount ?? '?', `${it.installmentN ?? ''}/${it.installmentTotal ?? ''}`, occurrence || ''].join('|');
  return sha256Hex(key);
}

function defaultAction(k: ParsedItem['kind']): ReviewAction {
  switch (k) {
    case 'consumo':
    case 'cargo':
      return 'gasto';
    case 'cuota':
      return 'cuota';
    case 'pago':
      return 'pago';
    case 'sancor':
      return 'sancor';
    default:
      return 'ignorar';
  }
}

/** Construye la pantalla de revisión. No escribe nada en la base. */
export async function buildReview(
  parsed: ParsedDocument,
  file: ImportReview['file'],
  ocrUsed: boolean,
  db: FinanzasDB = getDb(),
  today: MonthKey = currentMonth(),
): Promise<ImportReview> {
  const settings = await getSettings(db);
  const docs = (await db.documents.where('hash').equals(file.hash).toArray()).filter((d) => !d.deleted);
  const entity = parsed.entity.value ?? '';
  const month = parsed.month ?? today;
  const fps = new Set((await db.fingerprints.toArray()).filter((f) => !f.deleted).map((f) => f.fingerprint));
  const expenses = (await db.expenses.toArray()).filter((e) => !e.deleted && e.source === 'manual');
  const obligations = (await db.obligations.toArray()).filter((o) => !o.deleted);
  const sancor = (await db.sancor.toArray()).filter((s) => !s.deleted);
  const usedManual = new Set<string>();
  const seen = new Map<string, number>();

  const items: ReviewItem[] = [];
  for (const p of parsed.items) {
    const base = {
      date: p.date,
      concept: p.concept,
      amount: p.amount,
      installmentN: p.installment?.n,
      installmentTotal: p.installment?.total,
    };
    const rawKey = JSON.stringify(base);
    const occ = seen.get(rawKey) ?? 0;
    seen.set(rawKey, occ + 1);
    const fingerprint = await lineFingerprint(entity, base, occ);
    const warnings = [...p.warnings];
    let action = defaultAction(p.kind);
    let include = action !== 'ignorar';
    let duplicate: DuplicateInfo | undefined;
    const itemMonth = month;

    if (fps.has(fingerprint)) {
      duplicate = { type: 'linea', label: 'Esta línea ya fue importada anteriormente.' };
      include = false;
      action = 'ignorar';
    } else if (action === 'gasto' && p.amount !== undefined && p.date) {
      const m = expenses.find(
        (e) => !usedManual.has(e.id) && e.totalAmount === p.amount && Math.abs(daysBetween(e.date, p.date!)) <= 5 && !(e.linkedLineFingerprints?.length) && (e.paymentMethod === 'tarjeta' || e.paymentMethod === 'otro'),
      );
      if (m) {
        usedManual.add(m.id);
        duplicate = { type: 'gasto_manual', targetId: m.id, label: `Coincide con el gasto cargado manualmente "${m.concept}" (${m.date}).` };
        action = 'vincular';
      }
    } else if (action === 'cuota' && p.installment && p.amount !== undefined) {
      const ob = findMatchingObligation(obligations, { entity, concept: p.concept, n: p.installment.n, total: p.installment.total, amount: p.amount, dueMonth: itemMonth });
      if (ob) {
        duplicate = { type: 'obligacion', targetId: ob.id, label: `Corresponde a la obligación existente "${ob.concept}" (no se duplicarán cuotas).` };
        action = 'vincular';
      }
    } else if (action === 'sancor' && p.amount !== undefined) {
      const s = sancor.find((c) => c.month === itemMonth && c.chargeAmount === p.amount);
      if (s) {
        duplicate = { type: 'sancor', targetId: s.id, label: 'Ya existe un cargo de Sancor Salud con ese importe en el mes.' };
        action = 'vincular';
      }
    }
    if (p.kind === 'credito') warnings.push('Crédito o devolución: no se importa automáticamente. Regístrelo en Ingresos si corresponde.');
    const needsReview = p.confidence === 'baja' || p.amount === undefined || p.currency === 'USD';
    if (p.currency === 'USD') include = false;
    items.push({
      key: `${p.index}`,
      include,
      action,
      parsedKind: p.kind,
      date: p.date,
      month: itemMonth,
      concept: p.concept,
      amount: p.amount,
      currency: p.currency,
      installmentN: p.installment?.n,
      installmentTotal: p.installment?.total,
      expenseKind: p.suggestedKind,
      category: p.suggestedCategory,
      userPct: p.suggestedKind === 'hogar' ? settings.defaultUserPct : 100,
      confidence: p.confidence,
      warnings,
      needsReview,
      reviewed: false,
      fingerprint,
      duplicate,
      sourceLine: p.sourceLine,
      obligationType: guessObligationType(p.concept),
    });
  }
  const warnings = [...parsed.warnings];
  if (docs.length) warnings.unshift('Este documento ya fue importado. Puede cancelar, revisar o importarlo deliberadamente (las líneas ya registradas se omiten).');
  if (!parsed.month) warnings.push('No se pudo determinar el mes del resumen: verifique el mes de imputación.');
  return {
    file,
    documentDuplicateOf: docs[0],
    summary: {
      entity,
      entityConfidence: parsed.entity.confidence,
      closingDate: parsed.closingDate.value,
      dueDate: parsed.dueDate.value,
      month: parsed.month,
      total: parsed.total.value,
      minimumPayment: parsed.minimumPayment.value,
      previousBalance: parsed.previousBalance.value,
      currency: parsed.currency,
      registerStatement: parsed.total.value !== undefined || !!parsed.dueDate.value,
    },
    items,
    warnings,
    undetermined: parsed.undetermined,
    ocrUsed,
  };
}

export interface CommitIssue {
  key: string;
  message: string;
}

/** Verifica que no se incorporen datos dudosos sin revisar. */
export function validateReview(r: ImportReview): CommitIssue[] {
  const issues: CommitIssue[] = [];
  for (const it of r.items) {
    if (!it.include || it.action === 'ignorar') continue;
    if (it.amount === undefined || !Number.isFinite(it.amount)) issues.push({ key: it.key, message: `"${it.concept}": falta el importe.` });
    else if (it.amount <= 0 && it.action !== 'vincular') issues.push({ key: it.key, message: `"${it.concept}": el importe debe ser mayor a cero.` });
    if (it.currency === 'USD') issues.push({ key: it.key, message: `"${it.concept}": importe en dólares. Conviértalo a pesos y márquelo como revisado.` });
    if (it.needsReview && !it.reviewed) issues.push({ key: it.key, message: `"${it.concept}": lectura dudosa pendiente de corrección. Revise y marque "Revisado".` });
    if (it.action === 'vincular' && !it.duplicate?.targetId) issues.push({ key: it.key, message: `"${it.concept}": no hay registro para vincular.` });
    if (it.action === 'cuota' && it.installmentN && it.installmentTotal && it.installmentN > it.installmentTotal)
      issues.push({ key: it.key, message: `"${it.concept}": la cuota actual supera el total.` });
  }
  return issues;
}

export interface CommitResult {
  documentId: string;
  created: { gastos: number; cuotas: number; pagos: number; sancor: number; vinculados: number; resumen: number };
}

/** Incorpora definitivamente los datos revisados, en una única transacción. */
export async function commitReview(r: ImportReview, blob: Blob | null, db: FinanzasDB = getDb(), opts: { markPreviousPaid?: boolean } = {}): Promise<CommitResult> {
  const issues = validateReview(r);
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const base = () => ({ id: uid(), createdAt: now, updatedAt: now, deviceId });
  const s = r.summary;
  const documentId = uid();
  const created = { gastos: 0, cuotas: 0, pagos: 0, sancor: 0, vinculados: 0, resumen: 0 };

  await db.transaction('rw', [db.documents, db.blobs, db.expenses, db.obligations, db.cardPayments, db.sancor, db.statements, db.fingerprints, db.audit], async () => {
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
      entity: s.entity || undefined,
      hasBlob: !!blob && settings.storeDocumentBlobs,
      summary: `${r.items.filter((i) => i.include).length} línea(s) incorporadas`,
    };
    await db.documents.put(doc);
    if (blob && settings.storeDocumentBlobs) await db.blobs.put({ id: documentId, blob });

    let statementId: string | undefined;
    if (s.registerStatement) {
      const st: Statement = {
        ...base(),
        entity: s.entity || 'Sin identificar',
        closingDate: s.closingDate,
        dueDate: s.dueDate,
        month: s.month ?? (s.dueDate ? monthOf(s.dueDate) : currentMonth()),
        total: s.total,
        minimumPayment: s.minimumPayment,
        currency: s.currency,
        documentId,
      };
      statementId = st.id;
      await db.statements.put(st);
      created.resumen++;
    }

    const fp = async (it: ReviewItem, targetType: LineFingerprint['targetType'], targetId?: string) => {
      await db.fingerprints.put({ ...base(), fingerprint: it.fingerprint, documentId, targetType, targetId });
    };

    for (const it of r.items) {
      if (!it.include || it.action === 'ignorar' || it.amount === undefined) continue;
      const date = it.date ?? `${it.month}-01`;
      if (it.action === 'gasto') {
        const e: Expense = {
          ...base(),
          kind: it.expenseKind,
          category: it.category,
          concept: it.concept,
          date,
          month: it.month,
          totalAmount: it.amount,
          userPct: it.expenseKind === 'hogar' ? it.userPct : 100,
          paid: false,
          frequency: 'unica',
          paymentMethod: 'tarjeta',
          documentId,
          linkedLineFingerprints: [it.fingerprint],
          source: 'importado',
          notes: s.entity ? `Importado de ${s.entity}` : undefined,
        };
        await db.expenses.put(e);
        await fp(it, 'gasto', e.id);
        created.gastos++;
      } else if (it.action === 'cuota') {
        const hasInst = !!(it.installmentN && it.installmentTotal);
        const start = hasInst ? impliedStartMonth({ n: it.installmentN!, dueMonth: it.month }) : undefined;
        const ob: Obligation = {
          ...base(),
          entity: s.entity || 'Sin identificar',
          type: it.obligationType,
          concept: it.concept,
          originDate: it.date,
          paidInstallments: hasInst ? it.installmentN! - 1 : 0,
          totalInstallments: hasInst ? it.installmentTotal : undefined,
          installmentAmount: it.amount,
          nextDueMonth: it.month,
          frequency: 'mensual',
          status: hasInst ? 'pendiente' : 'por_confirmar',
          variableAmount: false,
          documentId,
          fingerprint: obligationFingerprintKey(s.entity, it.concept, it.installmentTotal, it.amount, start),
          notes: hasInst ? undefined : 'Complete la cuota actual y el total de cuotas.',
          revisions: [],
        };
        await db.obligations.put(ob);
        await fp(it, 'cuota', ob.id);
        created.cuotas++;
      } else if (it.action === 'pago') {
        const p: CardPayment = { ...base(), entity: s.entity || 'Sin identificar', statementId, date, month: monthOf(date), amount: Math.abs(it.amount), source: 'importado', lineFingerprint: it.fingerprint };
        await db.cardPayments.put(p);
        await fp(it, 'pago', p.id);
        created.pagos++;
      } else if (it.action === 'sancor') {
        const c: SancorCharge = { ...base(), month: it.month, chargeAmount: it.amount, partnerPct: settings.sancorPartnerPct, statementId, documentId, lineFingerprint: it.fingerprint, received: [] };
        await db.sancor.put(c);
        await fp(it, 'sancor', c.id);
        created.sancor++;
      } else if (it.action === 'vincular' && it.duplicate?.targetId) {
        const id = it.duplicate.targetId;
        if (it.duplicate.type === 'gasto_manual') {
          const e = await db.expenses.get(id);
          if (e) await db.expenses.put({ ...e, linkedLineFingerprints: [...(e.linkedLineFingerprints ?? []), it.fingerprint], documentId: e.documentId ?? documentId, updatedAt: now, deviceId });
          await fp(it, 'gasto', id);
        } else if (it.duplicate.type === 'obligacion') {
          const ob = await db.obligations.get(id);
          if (ob && it.installmentN && it.installmentTotal)
            await db.obligations.put({
              ...applyStatementInstallment(ob, { entity: s.entity, concept: it.concept, n: it.installmentN, total: it.installmentTotal, amount: it.amount, dueMonth: it.month }, now, !!opts.markPreviousPaid),
              deviceId,
            });
          await fp(it, 'cuota', id);
        } else if (it.duplicate.type === 'sancor') {
          await fp(it, 'sancor', id);
        }
        created.vinculados++;
      }
    }
    await addAudit(db, 'importar', 'documentos', documentId, `Importación de "${doc.name}": ${created.gastos} gasto(s), ${created.cuotas} obligación(es), ${created.pagos} pago(s), ${created.sancor} cargo(s) Sancor, ${created.vinculados} vinculado(s)`, deviceId);
  });
  notify();
  return { documentId, created };
}
