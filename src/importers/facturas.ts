import { getDb, type FinanzasDB } from '../db/db';
import { addAudit, getDeviceId, getSettings, notify, nowIso } from '../db/repo';
import { monthOf } from '../domain/dates';
import { detectDecimalFormat, parseAmount, type Cents } from '../domain/money';
import { uid } from '../domain/text';
import type { DocumentMeta, Expense, Obligation } from '../domain/types';
import type { SourceLine } from './statementParser';

/**
 * Documentos que no son resúmenes de tarjeta:
 * - ARCA, "Cuenta corriente monotributistas" (CCMA): el saldo deudor total, que se actualiza cada vez
 *   que se sube (no tiene cuotas fijas);
 * - factura de un servicio (Claro): un gasto fijo del mes con su vencimiento.
 */

export interface ArcaDebt {
  kind: 'arca';
  total: Cents;
  capital?: Cents;
  interest?: Cents;
  /** Fecha del cálculo de la deuda ('YYYY-MM-DD'). */
  date: string;
  period?: string;
}
export interface ServiceBill {
  kind: 'servicio';
  provider: string;
  concept: string;
  category: string;
  total: Cents;
  due: string;
  invoice?: string;
  periodFrom?: string;
  periodTo?: string;
}
export type BillDoc = ArcaDebt | ServiceBill;

const isoFrom = (d: string) => {
  const m = d.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return undefined;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

export function detectBill(lines: SourceLine[]): BillDoc | null {
  // Algunos PDF separan las letras con tilde ("C Á LCULO", "Obligaci ó n"): se vuelven a juntar.
  const text = lines.map((l) => l.text ?? '').join('\n').replace(/[ \t]+/g, ' ').replace(/(\p{L}) ([ÁÉÍÓÚÑáéíóúñ]) ?(?=\p{L})/gu, '$1$2').replace(/(\p{L}) ([ÁÉÍÓÚÑáéíóúñ])(?!\p{L})/gu, '$1$2');
  // ARCA: cuenta corriente de monotributistas.
  if (/ARCA|AFIP/.test(text) && /monotribut/i.test(text) && /total saldo deudor/i.test(text)) {
    const fmt = detectDecimalFormat(text);
    const num = (re: RegExp) => {
      const m = text.match(re);
      return m ? parseAmount(m[1], fmt) ?? undefined : undefined;
    };
    const total = num(/total saldo deudor:?\s*\$?\s*([\d.,]+)/i);
    const date = isoFrom(text.match(/fecha de c[aá]lculo:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? '');
    if (total === undefined || !date) return null;
    return {
      kind: 'arca',
      total,
      capital: num(/saldo deudor:?\s*[\d.,]+[\s\S]{0,120}?obligaci[oó]n mensual:?\s*\$?\s*([\d.,]+)/i),
      interest: num(/saldo deudor:?\s*[\d.,]+[\s\S]{0,200}?accesorios:?\s*\$?\s*([\d.,]+)/i),
      date,
      period: text.match(/per[ií]odo total calculado\s*(\d{2}\/\d{4}\s*-\s*\d{2}\/\d{4})/i)?.[1]?.replace(/\s+/g, ' '),
    };
  }
  // Claro: factura de servicios.
  if (/claro/i.test(text) && /factura/i.test(text) && /total a pagar/i.test(text)) {
    const total = text.match(/total a pagar:?\s*\$\s*([\d.]+,\d{2})/i)?.[1] ?? text.match(/total a pagar[\s\S]{0,80}?\$\s*([\d.]+,\d{2})/i)?.[1];
    const due = isoFrom(text.match(/vence:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? text.match(/vencimiento[\s\S]{0,80}?(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? '');
    const amount = total ? parseAmount(total) : null;
    if (amount == null || !due) return null;
    const per = text.match(/per[ií]odo de facturaci[oó]n desde:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*hasta:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const movil = /telefon[ií]a m[oó]vil|l[ií]nea/i.test(text);
    return {
      kind: 'servicio',
      provider: 'Claro',
      concept: movil ? 'Claro · línea celular' : 'Claro',
      category: 'Telefonía',
      total: amount,
      due,
      invoice: text.match(/factura\s*n\S?\s*(\d{3,5}-\d{5,})/i)?.[1],
      periodFrom: per ? isoFrom(per[1]) : undefined,
      periodTo: per ? isoFrom(per[2]) : undefined,
    };
  }
  return null;
}

export const ARCA_FINGERPRINT = 'arca|monotributo';
export const billFingerprint = (b: ServiceBill) => `factura|${b.provider.toLowerCase()}|${b.invoice ?? `${b.due}|${b.total}`}`;

export interface BillCheck {
  /** ARCA: deuda ya cargada (se actualiza). Factura: ya importada (no se repite). */
  existing?: Obligation;
  alreadyImported?: boolean;
}

export async function checkBill(b: BillDoc, db: FinanzasDB = getDb()): Promise<BillCheck> {
  if (b.kind === 'arca') return { existing: (await db.obligations.where('fingerprint').equals(ARCA_FINGERPRINT).toArray()).find((o) => !o.deleted) };
  const fp = billFingerprint(b);
  return { alreadyImported: (await db.fingerprints.toArray()).some((f) => !f.deleted && f.fingerprint === fp) };
}

/** Guarda el documento: ARCA actualiza el saldo de la deuda; la factura se anota como gasto del mes. */
export async function commitBill(
  b: BillDoc,
  file: { name: string; size: number; mime: string; kind: DocumentMeta['kind']; hash: string },
  blob: Blob | null,
  opts: { paid?: boolean } = {},
  db: FinanzasDB = getDb(),
): Promise<{ updated: boolean }> {
  const settings = await getSettings(db);
  const deviceId = await getDeviceId(db);
  const now = nowIso();
  const documentId = uid();
  const base = { createdAt: now, updatedAt: now, deviceId };
  let updated = false;
  await db.transaction('rw', [db.documents, db.blobs, db.obligations, db.expenses, db.fingerprints, db.audit], async () => {
    const doc: DocumentMeta = {
      id: documentId,
      ...base,
      name: file.name.slice(0, 200),
      mime: file.mime,
      size: file.size,
      hash: file.hash,
      kind: file.kind,
      importedAt: now,
      entity: b.kind === 'arca' ? 'ARCA' : b.provider,
      hasBlob: !!blob && settings.storeDocumentBlobs,
      summary: b.kind === 'arca' ? `Deuda ARCA al ${b.date.split('-').reverse().join('/')}` : `Factura ${b.provider}${b.invoice ? ` N.º ${b.invoice}` : ''}`,
    };
    await db.documents.put(doc);
    if (blob && settings.storeDocumentBlobs) await db.blobs.put({ id: documentId, blob });

    if (b.kind === 'arca') {
      const notes = [b.capital !== undefined && b.interest !== undefined ? `Cuotas ${fmt(b.capital)} + intereses ${fmt(b.interest)}` : '', b.period ? `períodos ${b.period}` : '', `saldo al ${b.date.split('-').reverse().join('/')}`].filter(Boolean).join(' · ');
      const cur = (await db.obligations.where('fingerprint').equals(ARCA_FINGERPRINT).toArray()).find((o) => !o.deleted);
      // Solo se reemplaza con un cálculo igual o más nuevo (subir uno viejo no pisa el saldo actual).
      if (cur && (cur.originDate ?? '') > b.date) return;
      const ob: Obligation = {
        ...(cur ?? { id: uid(), createdAt: now, revisions: [], paidInstallments: 0, frequency: 'mensual', variableAmount: true }),
        updatedAt: now,
        deviceId,
        entity: 'ARCA',
        type: 'otro',
        concept: 'ARCA · Monotributo',
        knownBalance: b.total,
        originDate: b.date,
        status: b.total > 0 ? 'pendiente' : 'pagada',
        fingerprint: ARCA_FINGERPRINT,
        documentId,
        notes,
      };
      updated = !!cur;
      await db.obligations.put(ob);
      await addAudit(db, 'importar', 'obligaciones', ob.id, `${updated ? 'Actualización' : 'Alta'} de la deuda con ARCA: ${fmt(b.total)} al ${b.date.split('-').reverse().join('/')}`, deviceId);
      return;
    }

    const fp = billFingerprint(b);
    if ((await db.fingerprints.toArray()).some((f) => !f.deleted && f.fingerprint === fp)) return;
    const e: Expense = {
      id: uid(),
      ...base,
      kind: 'personal',
      category: b.category,
      concept: b.concept,
      date: b.due,
      month: monthOf(b.due),
      totalAmount: b.total,
      userPct: 100,
      paid: !!opts.paid,
      frequency: 'unica',
      paymentMethod: 'otro',
      documentId,
      source: 'importado',
      notes: `Factura ${b.provider}${b.invoice ? ` N.º ${b.invoice}` : ''}${b.periodFrom && b.periodTo ? ` · período ${b.periodFrom.split('-').reverse().join('/')} al ${b.periodTo.split('-').reverse().join('/')}` : ''} · vence ${b.due.split('-').reverse().join('/')}`,
    };
    await db.expenses.put(e);
    await db.fingerprints.put({ id: uid(), ...base, fingerprint: fp, documentId, targetType: 'gasto', targetId: e.id });
    await addAudit(db, 'importar', 'gastos', e.id, `Factura ${b.provider}: ${fmt(b.total)} (vence ${b.due.split('-').reverse().join('/')})`, deviceId);
  });
  notify();
  return { updated };
}

const fmt = (c: Cents) => (c / 100).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
