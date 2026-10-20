import { addMonths, monthOf, parseDateEs, type MonthKey } from '../domain/dates';
import { detectDecimalFormat, parseAmount, type Cents, type DecimalFormat } from '../domain/money';
import { normalizeText } from '../domain/text';
import { detectEntity, suggestCategory } from './classify';
import type { ExpenseKind } from '../domain/types';

export type Confidence = 'alta' | 'media' | 'baja';
export type ItemKind = 'consumo' | 'cuota' | 'pago' | 'cargo' | 'sancor' | 'credito' | 'desconocido';

export interface SourceLine {
  text: string;
  /** Confianza de OCR 0-100, si corresponde. */
  ocrConfidence?: number;
  page?: number;
}

export interface Field<T> {
  value?: T;
  confidence: Confidence;
  source?: string;
}

export interface ParsedItem {
  index: number;
  kind: ItemKind;
  date?: string;
  dateConfidence: Confidence;
  concept: string;
  amount?: Cents;
  amountConfidence: Confidence;
  currency: 'ARS' | 'USD';
  installment?: { n: number; total: number };
  installmentConfidence?: Confidence;
  suggestedCategory: string;
  suggestedKind: ExpenseKind;
  confidence: Confidence;
  warnings: string[];
  sourceLine: string;
  page?: number;
}

export interface ParsedDocument {
  entity: Field<string>;
  currency: 'ARS' | 'USD' | 'mixta';
  decimalFormat: DecimalFormat;
  total: Field<Cents>;
  minimumPayment: Field<Cents>;
  closingDate: Field<string>;
  dueDate: Field<string>;
  previousBalance: Field<Cents>;
  /** Mes de imputación sugerido (mes de vencimiento). */
  month?: MonthKey;
  items: ParsedItem[];
  warnings: string[];
  undetermined: string[];
  lineCount: number;
}

const DATE_TOKEN =
  /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}[\s.-]?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:[\s.-]?\d{2,4})?)(?=\s|$)/i;
const AMOUNT_TOKEN = /\(?-?\s?(?:\$|ARS|U\$S|US\$|USD)?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?-?\)?|\(?-?\d+[.,]\d{2}-?\)?/gi;
const INSTALLMENT_EXPLICIT = /(?:\bc(?:uota)?\.?\s?|\bcuota\s+)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
const INSTALLMENT_BARE = /(?<![\d/.-])(\d{1,2})\s?\/\s?(\d{1,2})(?![\d/.-])/;

const RE_PAYMENT = /\b(su pago|pago recibido|pago en pesos|pago en dolares|pago tarjeta|gracias por su pago|pago de resumen|pago resumen)\b/;
const RE_CHARGE = /\b(interes(es)?|iva|impuesto|imp\.?|sellos|percepcion|perc\.?|comision|cargo|mantenimiento|seguro de vida|punitorio|db\.? ?rg|rg ?\d{4}|ganancias|bienes personales)\b/;
const RE_OBLIG = /\b(plan v|prestamo|refinanc\w*|financiacion|plan de pagos|adelanto)\b/;
const RE_CREDIT = /\b(devolucion|reintegro|bonificacion|anulacion|credito|contracargo)\b/;

const RE_TOTAL = /\b(total a pagar|saldo actual|saldo total|total del resumen|total resumen|importe total|saldo a pagar|total a abonar)\b/;
const RE_MIN = /\b(pago minimo|minimo a pagar|pago min)\b/;
const RE_CLOSING = /\b(cierre actual|fecha de cierre|cierre)\b/;
const RE_DUE = /\b(vencimiento actual|fecha de vencimiento|vencimiento|vto)\b/;
const RE_NEXT = /\b(proximo|prox|siguiente)\b/;
const RE_PREV = /\b(saldo anterior)\b/;

function lowerOf(c: Confidence, d: Confidence): Confidence {
  const rank = { alta: 2, media: 1, baja: 0 };
  return rank[c] <= rank[d] ? c : d;
}

function ocrConf(line: SourceLine): Confidence {
  if (line.ocrConfidence === undefined) return 'alta';
  if (line.ocrConfidence >= 80) return 'alta';
  if (line.ocrConfidence >= 60) return 'media';
  return 'baja';
}

function findAmounts(s: string): Array<{ raw: string; index: number }> {
  const out: Array<{ raw: string; index: number }> = [];
  for (const m of s.matchAll(AMOUNT_TOKEN)) {
    const raw = m[0].trim();
    if (!/\d/.test(raw)) continue;
    out.push({ raw, index: m.index ?? 0 });
  }
  return out;
}

function firstDateIn(text: string, year?: number): { iso: string; inferred: boolean } | undefined {
  const re = /(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s.-]?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?[\s.-]?\d{2,4})/gi;
  for (const m of text.matchAll(re)) {
    const d = parseDateEs(m[1], year);
    if (d) return { iso: d.iso, inferred: d.yearInferred };
  }
  return undefined;
}

function lastAmountIn(text: string, fmt: DecimalFormat): Cents | undefined {
  const am = findAmounts(text.replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g, ' '));
  for (let i = am.length - 1; i >= 0; i--) {
    const v = parseAmount(am[i].raw, fmt);
    if (v !== null && /[.,]\d{2}\)?-?$/.test(am[i].raw)) return v;
  }
  for (let i = am.length - 1; i >= 0; i--) {
    const v = parseAmount(am[i].raw, fmt);
    if (v !== null) return v;
  }
  return undefined;
}

/**
 * Interpreta el texto de un resumen o listado de movimientos. El texto se trata
 * exclusivamente como datos: nunca se ejecuta ni se interpreta como instrucción.
 */
export function parseStatementText(lines: SourceLine[], opts: { fallbackYear?: number } = {}): ParsedDocument {
  const clean = lines
    .map((l) => ({ ...l, text: (l.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text.length > 0)
    .slice(0, 20000);
  const fullText = clean.map((l) => l.text).join('\n');
  const fmt = detectDecimalFormat(fullText);
  const ent = detectEntity(fullText);
  const warnings: string[] = [];
  const undetermined: string[] = [];

  const doc: ParsedDocument = {
    entity: { value: ent.entity, confidence: ent.confidence },
    currency: 'ARS',
    decimalFormat: fmt,
    total: { confidence: 'baja' },
    minimumPayment: { confidence: 'baja' },
    closingDate: { confidence: 'baja' },
    dueDate: { confidence: 'baja' },
    previousBalance: { confidence: 'baja' },
    items: [],
    warnings,
    undetermined,
    lineCount: clean.length,
  };

  // Primera pasada: datos del resumen (fechas de cierre/vencimiento, totales).
  const summaryLineIdx = new Set<number>();
  clean.forEach((l, idx) => {
    const n = normalizeText(l.text);
    const c = ocrConf(l);
    if (RE_NEXT.test(n) && (RE_CLOSING.test(n) || RE_DUE.test(n))) {
      summaryLineIdx.add(idx);
      return;
    }
    if (RE_PREV.test(n)) {
      const v = lastAmountIn(l.text, fmt);
      if (v !== undefined && doc.previousBalance.value === undefined) doc.previousBalance = { value: v, confidence: c, source: l.text };
      summaryLineIdx.add(idx);
      return;
    }
    if (RE_MIN.test(n)) {
      const v = lastAmountIn(l.text, fmt);
      if (v !== undefined && doc.minimumPayment.value === undefined) doc.minimumPayment = { value: v, confidence: c, source: l.text };
      summaryLineIdx.add(idx);
      return;
    }
    if (RE_TOTAL.test(n)) {
      const v = lastAmountIn(l.text, fmt);
      if (v !== undefined && doc.total.value === undefined) doc.total = { value: v, confidence: c, source: l.text };
      summaryLineIdx.add(idx);
      return;
    }
    if (RE_CLOSING.test(n) && !RE_DUE.test(n)) {
      const d = firstDateIn(l.text);
      if (d && doc.closingDate.value === undefined) doc.closingDate = { value: d.iso, confidence: c, source: l.text };
      summaryLineIdx.add(idx);
      return;
    }
    if (RE_DUE.test(n)) {
      const d = firstDateIn(l.text);
      if (d && doc.dueDate.value === undefined) doc.dueDate = { value: d.iso, confidence: c, source: l.text };
      summaryLineIdx.add(idx);
    }
  });

  const refDate = doc.dueDate.value ?? doc.closingDate.value;
  const fallbackYear = refDate ? Number(refDate.slice(0, 4)) : opts.fallbackYear;
  doc.month = doc.dueDate.value ? monthOf(doc.dueDate.value) : doc.closingDate.value ? addMonths(monthOf(doc.closingDate.value), 1) : undefined;
  if (!doc.dueDate.value && doc.closingDate.value)
    warnings.push('No se encontró la fecha de vencimiento: el mes de imputación se estimó como el mes siguiente al cierre.');

  // Segunda pasada: movimientos.
  clean.forEach((l, idx) => {
    if (summaryLineIdx.has(idx)) return;
    const item = parseMovementLine(l, idx, fmt, fallbackYear, refDate);
    if (item) doc.items.push(item);
  });

  const usd = doc.items.filter((i) => i.currency === 'USD').length;
  doc.currency = usd === 0 ? 'ARS' : usd === doc.items.length ? 'USD' : 'mixta';
  if (usd) warnings.push(`${usd} movimiento(s) en dólares: requieren conversión manual a pesos antes de importarlos.`);
  if (!doc.entity.value) undetermined.push('Entidad financiera');
  if (doc.total.value === undefined) undetermined.push('Total del resumen');
  if (doc.minimumPayment.value === undefined) undetermined.push('Pago mínimo');
  if (!doc.closingDate.value) undetermined.push('Fecha de cierre');
  if (!doc.dueDate.value) undetermined.push('Fecha de vencimiento');
  if (!doc.items.length) warnings.push('No se detectaron movimientos. Puede cargarlos manualmente.');
  if (doc.total.value !== undefined)
    warnings.push('El total del resumen se registra solo como información: no se convierte en una deuda nueva.');
  if (doc.items.some((i) => i.confidence === 'baja'))
    warnings.push('Hay datos con lectura dudosa: quedaron pendientes de corrección.');
  return doc;
}

function parseMovementLine(
  l: SourceLine,
  idx: number,
  fmt: DecimalFormat,
  fallbackYear: number | undefined,
  refDate: string | undefined,
): ParsedItem | null {
  let text = l.text;
  const dm = text.match(DATE_TOKEN);
  if (!dm) return null;
  const pd = parseDateEs(dm[1], fallbackYear);
  if (!pd) return null;
  let date = pd.iso;
  let dateConfidence: Confidence = pd.yearInferred ? 'media' : 'alta';
  // Fechas sin año posteriores al vencimiento corresponden al año anterior (resumen de enero, consumo de diciembre).
  if (pd.yearInferred && refDate && date > refDate) {
    date = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
  }
  text = text.slice(dm[0].length).trim();

  const amounts = findAmounts(text);
  if (!amounts.length) return null;
  const last = amounts[amounts.length - 1];
  const amountRaw = last.raw;
  const parsed = parseAmount(amountRaw, fmt);
  if (parsed === null) return null;
  let concept = text.slice(0, last.index).trim();
  const warnings: string[] = [];

  let installment: ParsedItem['installment'];
  let installmentConfidence: Confidence | undefined;
  const ie = concept.match(INSTALLMENT_EXPLICIT);
  const ib = ie ? null : concept.match(INSTALLMENT_BARE);
  const im = ie ?? ib;
  if (im) {
    const n = Number(im[1]);
    const total = Number(im[2]);
    if (n >= 1 && total >= 2 && n <= total && total <= 99) {
      installment = { n, total };
      installmentConfidence = ie ? 'alta' : 'media';
      concept = (concept.slice(0, im.index) + ' ' + concept.slice((im.index ?? 0) + im[0].length)).trim();
    }
  }
  // Quita números de comprobante y marcadores sueltos al inicio del concepto.
  concept = concept.replace(/^[*#\-\s]+/, '').replace(/^\d{4,}\s+/, '').replace(/\s+[*#]+\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  // Columna adicional de importe (pesos/dólares): se quita del concepto.
  concept = concept.replace(/\s-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}-?$/, '').trim();

  const n = normalizeText(`${concept}`);
  const lineNorm = normalizeText(l.text);
  const currency: 'ARS' | 'USD' = /\b(usd|u\$s|us\$|dolar|dolares)\b/i.test(l.text) || /u\$s|us\$/i.test(l.text) ? 'USD' : 'ARS';

  let kind: ItemKind = 'consumo';
  if (RE_PAYMENT.test(lineNorm)) kind = 'pago';
  else if (/sancor/.test(lineNorm)) kind = 'sancor';
  else if (installment) kind = 'cuota';
  else if (RE_CHARGE.test(n)) kind = 'cargo';
  else if (RE_OBLIG.test(n)) kind = 'cuota';
  else if (parsed < 0 || RE_CREDIT.test(n)) kind = 'credito';

  let amount = parsed;
  if (kind === 'pago' || kind === 'credito') amount = Math.abs(parsed);

  let amountConfidence: Confidence = /[.,]\d{2}\)?-?$/.test(amountRaw) ? 'alta' : 'media';
  if (fmt === 'coma' && /^\d+\.\d{2}$/.test(amountRaw.replace(/[$\s-]/g, ''))) {
    amountConfidence = 'baja';
    warnings.push('Separador decimal ambiguo en el importe.');
  }
  if (amountConfidence === 'media') warnings.push('El importe no tiene decimales: verifique que sea correcto.');
  if (!concept) {
    warnings.push('No se pudo determinar el concepto.');
  }
  if (dateConfidence === 'media') warnings.push('El año de la fecha fue inferido del resumen.');
  if (installmentConfidence === 'media') warnings.push('Número de cuota inferido (sin indicador "C." o "Cuota").');
  if (currency === 'USD') warnings.push('Importe en dólares: conviértalo a pesos o descarte la línea.');
  if (kind === 'cuota' && !installment) warnings.push('Obligación sin número de cuota: complete cuota actual y total.');

  const oc = ocrConf(l);
  if (oc !== 'alta') warnings.push(`Lectura OCR con confianza ${oc} (${Math.round(l.ocrConfidence ?? 0)} %).`);
  let confidence: Confidence = lowerOf(lowerOf(dateConfidence, amountConfidence), oc);
  if (!concept || currency === 'USD') confidence = 'baja';
  if (installmentConfidence) confidence = lowerOf(confidence, installmentConfidence);

  const cat = kind === 'sancor' ? { category: 'Obra social', kind: 'hogar' as ExpenseKind } : kind === 'cargo' ? { category: 'Cargos financieros', kind: 'personal' as ExpenseKind } : suggestCategory(concept);

  return {
    index: idx,
    kind,
    date,
    dateConfidence,
    concept: concept || '(sin concepto)',
    amount,
    amountConfidence,
    currency,
    installment,
    installmentConfidence,
    suggestedCategory: cat.category,
    suggestedKind: cat.kind,
    confidence,
    warnings,
    sourceLine: l.text,
    page: l.page,
  };
}
