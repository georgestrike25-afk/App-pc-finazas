import { getDb, type FinanzasDB } from '../db/db';
import { applyStatementPayment } from '../db/cardPayments';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { currentMonth, daysBetween, monthOf, type MonthKey } from '../domain/dates';
import { applyStatementInstallment, findLoanInstallment, findMatchingObligation, impliedStartMonth, markPaidThrough, obligationFingerprintKey } from '../domain/obligations';
import { monthLabel } from '../domain/dates';
import { formatARS } from '../domain/money';
import { incomeNet } from '../domain/income';
import { normalizeText, sha256Hex, uid } from '../domain/text';
import { reviseIncome } from '../domain/income';
import type { Cents } from '../domain/money';
import type {
  CardPayment,
  DocumentMeta,
  Expense,
  ExpenseKind,
  Income,
  LineFingerprint,
  Obligation,
  ObligationType,
  SancorCharge,
  Statement,
} from '../domain/types';
import { checkUpcoming, reconcile, type Confidence, type ItemKind, type ParsedDocument, type ParsedItem, type UpcomingInstallments } from './statementParser';

export type ReviewAction = 'gasto' | 'bonificacion' | 'cuota' | 'pago' | 'sancor' | 'ingreso' | 'vincular' | 'ignorar';

export interface DuplicateInfo {
  type: 'linea' | 'gasto_manual' | 'obligacion' | 'sancor' | 'prestamo' | 'resumen' | 'ingreso';
  /** Cuota del préstamo vinculada (débito de cuota en la cuenta). */
  installmentN?: number;
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
  nextClosingDate?: string;
  nextDueDate?: string;
  upcoming: UpcomingInstallments[];
  accountCheck?: ParsedDocument['accountCheck'];
  docType?: ParsedDocument['docType'];
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
    case 'bonificacion':
      return 'bonificacion';
    case 'ingreso':
      return 'ingreso';
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
  const statements = (await db.statements.toArray()).filter((s) => !s.deleted);
  const payments = (await db.cardPayments.toArray()).filter((s) => !s.deleted);
  const incomes = (await db.incomes.toArray()).filter((s) => !s.deleted);
  const isAccount = parsed.docType === 'cuenta';
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
    // En movimientos de cuenta cada línea va al mes de su fecha.
    const itemMonth = isAccount && p.date ? monthOf(p.date) : month;

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
      const s = sancor.find((c) => c.month === itemMonth && (c.chargeAmount === p.amount || !!c.coupons?.some((k) => k.amount === p.amount)));
      if (s) {
        duplicate = { type: 'sancor', targetId: s.id, label: 'Ya existe un cargo de Sancor Salud con ese cupón en el mes.' };
        action = 'vincular';
      }
    }
    if (!duplicate && p.kind === 'pago_prestamo' && p.amount !== undefined && p.date) {
      const li = findLoanInstallment(obligations, p.amount, p.date, today);
      if (li) {
        duplicate = {
          type: 'prestamo',
          targetId: li.ob.id,
          installmentN: li.n,
          label: `Cuota ${li.n}${li.ob.totalInstallments ? ` de ${li.ob.totalInstallments}` : ''} de "${li.ob.concept}"${li.paid ? ': ya figura pagada.' : ': se marcará como pagada.'}`,
        };
        action = li.paid ? 'ignorar' : 'vincular';
        include = !li.paid;
      } else {
        warnings.push('No coincide con ninguna cuota de los préstamos cargados. Importe el cronograma del préstamo o regístrelo como gasto.');
      }
    } else if (!duplicate && action === 'pago' && p.amount !== undefined && p.date) {
      const prev = payments.find((x) => x.amount === p.amount && Math.abs(daysBetween(x.date, p.date!)) <= 3);
      const st = statements.find((x) => x.total === p.amount);
      if (prev) {
        duplicate = { type: 'linea', label: 'Este pago de tarjeta ya está registrado.' };
        action = 'ignorar';
        include = false;
      } else if (st) {
        duplicate = { type: 'resumen', targetId: st.id, label: `Paga el resumen de ${st.entity} de ${monthLabel(st.month)} (${formatARS(st.total)}). No es un gasto nuevo: los consumos ya están registrados.` };
      } else {
        warnings.push('Pago de tarjeta: no es un gasto (cancela consumos del resumen). No se encontró un resumen cargado con ese total.');
      }
    } else if (!duplicate && action === 'ingreso' && p.amount !== undefined) {
      const inc = incomes.find((x) => x.month === itemMonth && x.status === 'confirmado' && (x.amountReceived === p.amount || x.extras.some((e) => e.amount === p.amount)));
      if (inc) {
        duplicate = { type: 'ingreso', targetId: inc.id, label: `Ya está registrado en el ingreso de ${monthLabel(itemMonth)}.` };
        action = 'ignorar';
        include = false;
      } else {
        const cur = incomes.find((x) => x.month === itemMonth && x.status === 'confirmado');
        warnings.push(cur ? `Se sumará como ingreso adicional al ingreso ya cargado de ${monthLabel(itemMonth)} (${formatARS(incomeNet(cur))}).` : `Se registrará como ingreso cobrado de ${monthLabel(itemMonth)}.`);
      }
    }
    if (p.cancelsOut) {
      include = false;
      action = 'ignorar';
    }
    if (isAccount && include && parsed.month && itemMonth !== parsed.month) {
      include = false;
      warnings.push(`Movimiento de ${monthLabel(itemMonth)}: no se incluye por defecto (márquelo si corresponde).`);
    }
    if (p.kind === 'credito' && !p.refinancing && !isAccount) warnings.push('Crédito: no se importa automáticamente. Regístrelo en Ingresos si corresponde.');
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
      nextClosingDate: parsed.nextClosingDate.value,
      nextDueDate: parsed.nextDueDate.value,
      upcoming: parsed.upcoming,
      accountCheck: parsed.accountCheck,
      docType: parsed.docType,
      currency: parsed.currency,
      registerStatement: !isAccount && (parsed.total.value !== undefined || !!parsed.dueDate.value),
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
  created: { gastos: number; cuotas: number; pagos: number; sancor: number; vinculados: number; resumen: number; ingresos: number };
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
  const created = { gastos: 0, cuotas: 0, pagos: 0, sancor: 0, vinculados: 0, resumen: 0, ingresos: 0 };

  await db.transaction('rw', [db.documents, db.blobs, db.expenses, db.obligations, db.cardPayments, db.sancor, db.statements, db.fingerprints, db.audit, db.incomes], async () => {
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

    const sancorThisImport = new Map<string, SancorCharge>();
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
          // En una cuenta el dinero ya salió (débito); en una tarjeta queda pendiente hasta pagar el resumen.
          paid: s.docType === 'cuenta',
          frequency: 'unica',
          paymentMethod: s.docType === 'cuenta' ? 'debito' : 'tarjeta',
          documentId,
          linkedLineFingerprints: [it.fingerprint],
          source: 'importado',
          notes: s.entity ? `Importado de ${s.entity}` : undefined,
        };
        await db.expenses.put(e);
        await fp(it, 'gasto', e.id);
        created.gastos++;
      } else if (it.action === 'bonificacion') {
        // Descuento o devolución: se registra como gasto negativo de la misma categoría (resta).
        const e: Expense = {
          ...base(),
          kind: it.expenseKind,
          category: it.category,
          concept: it.concept,
          date,
          month: it.month,
          totalAmount: -Math.abs(it.amount),
          userPct: it.expenseKind === 'hogar' ? it.userPct : 100,
          paid: s.docType === 'cuenta',
          frequency: 'unica',
          paymentMethod: s.docType === 'cuenta' ? 'debito' : 'tarjeta',
          documentId,
          linkedLineFingerprints: [it.fingerprint],
          source: 'importado',
          notes: `Bonificación${s.entity ? ` de ${s.entity}` : ''}`,
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
          dueDay: s.dueDate ? Number(s.dueDate.slice(8, 10)) : undefined,
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
      } else if (it.action === 'ingreso') {
        const cur = (await db.incomes.where('month').equals(it.month).toArray()).find((x) => !x.deleted);
        if (!cur) {
          const inc: Income = { ...base(), month: it.month, status: 'confirmado', amountReceived: it.amount, receivedDate: date, extras: [], deductions: [], notes: `Importado: ${it.concept}`, revisions: [] };
          await db.incomes.put(inc);
          await fp(it, 'ingreso', inc.id);
        } else {
          const changes: Partial<Income> =
            cur.status === 'estimado' || cur.amountReceived === 0
              ? { status: 'confirmado', amountReceived: it.amount, receivedDate: date, notes: [cur.notes, `Importado: ${it.concept}`].filter(Boolean).join(' · ') }
              : { extras: [...cur.extras, { concept: it.concept, amount: it.amount }] };
          await db.incomes.put({ ...reviseIncome(cur, changes, now), deviceId });
          await fp(it, 'ingreso', cur.id);
        }
        created.ingresos++;
      } else if (it.action === 'pago') {
        const linked = it.duplicate?.type === 'resumen' ? await db.statements.get(it.duplicate.targetId!) : undefined;
        const p: CardPayment = { ...base(), entity: linked?.entity || s.entity || 'Sin identificar', statementId: linked?.id, date, month: monthOf(date), amount: Math.abs(it.amount), source: 'importado', lineFingerprint: it.fingerprint };
        await db.cardPayments.put(p);
        await fp(it, 'pago', p.id);
        if (linked) await applyStatementPayment(db, linked, p.amount, now, deviceId);
        created.pagos++;
      } else if (it.action === 'sancor') {
        // Varios cupones en el mismo resumen (el tuyo y el de tu pareja) forman un solo cargo.
        const prev = sancorThisImport.get(it.month);
        const coupon = { amount: it.amount, ref: it.concept };
        if (prev) {
          prev.chargeAmount += it.amount;
          prev.coupons = [...(prev.coupons ?? []), coupon];
          await db.sancor.put(prev);
          await fp(it, 'sancor', prev.id);
        } else {
          const c: SancorCharge = { ...base(), month: it.month, chargeAmount: it.amount, coupons: [coupon], partnerPct: settings.sancorPartnerPct, statementId, documentId, lineFingerprint: it.fingerprint, received: [] };
          sancorThisImport.set(it.month, c);
          await db.sancor.put(c);
          await fp(it, 'sancor', c.id);
          created.sancor++;
        }
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
        } else if (it.duplicate.type === 'prestamo' && it.duplicate.installmentN) {
          const ob = await db.obligations.get(id);
          if (ob) await db.obligations.put({ ...markPaidThrough(ob, it.duplicate.installmentN, now, `Cuota ${it.duplicate.installmentN} debitada de la cuenta (${date})`), deviceId });
          await fp(it, 'cuota', id);
        }
        created.vinculados++;
      }
    }
    // Resumen sin nada para pagar (saldo a favor): sus cuotas del mes quedan cubiertas.
    if (statementId && s.total !== undefined && s.total <= 0) {
      const st = await db.statements.get(statementId);
      if (st) await applyStatementPayment(db, st, 0, now, deviceId);
    }
    await addAudit(db, 'importar', 'documentos', documentId, `Importación de "${doc.name}": ${created.gastos} gasto(s), ${created.cuotas} obligación(es), ${created.pagos} pago(s), ${created.sancor} cargo(s) Sancor, ${created.ingresos} ingreso(s), ${created.vinculados} vinculado(s)`, deviceId);
  });
  notify();
  return { documentId, created };
}

/** Tipo de línea a efectos de verificar la lectura contra los totales del documento. */
function verifyKind(it: ReviewItem): ItemKind {
  if (it.action === 'cuota' || (it.action === 'vincular' && it.duplicate?.type === 'obligacion')) return 'cuota';
  if (it.action === 'bonificacion') return 'bonificacion';
  if (it.action === 'pago') return 'pago';
  return it.parsedKind;
}

/** Verificaciones de la lectura: saldo del resumen y cuadro "Cuotas a vencer". */
export function verifyReview(r: ImportReview) {
  const rows = r.items.map((it) => ({
    kind: verifyKind(it),
    amount: it.amount,
    currency: it.currency,
    installment: it.installmentN && it.installmentTotal ? { n: it.installmentN, total: it.installmentTotal } : undefined,
  }));
  return {
    balance: reconcile(r.summary.previousBalance, r.summary.total, rows),
    upcoming: checkUpcoming(r.summary.upcoming, rows),
  };
}
