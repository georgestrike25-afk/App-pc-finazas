import { addMonths, monthOf, parseDateEs, type MonthKey } from '../domain/dates';
import { detectDecimalFormat, parseAmount, type Cents, type DecimalFormat } from '../domain/money';
import { normalizeText } from '../domain/text';
import { detectEntity, suggestCategory } from './classify';
import type { ExpenseKind } from '../domain/types';

export type Confidence = 'alta' | 'media' | 'baja';
/**
 * consumo: compra en un pago · cuota: cuota de compra/préstamo/Plan V · pago: pago del resumen
 * cargo: interés, impuesto o comisión · sancor: cupón de Sancor Salud
 * bonificacion: descuento o devolución que reduce un gasto · credito: otros créditos (no se importan solos)
 */
export type ItemKind =
  | 'consumo' | 'cuota' | 'pago' | 'cargo' | 'sancor' | 'bonificacion' | 'credito' | 'desconocido'
  // Movimientos de cuenta bancaria
  | 'ingreso' | 'adelanto' | 'transferencia' | 'pago_prestamo';

export interface Cell {
  x: number;
  s: string;
  /** Ancho del fragmento (si se conoce): permite leer columnas alineadas a la derecha. */
  w?: number;
}

export interface SourceLine {
  text: string;
  /** Confianza de OCR 0-100, si corresponde. */
  ocrConfidence?: number;
  page?: number;
  /** Fragmentos con su posición horizontal (solo PDF con texto): permite leer columnas. */
  cells?: Cell[];
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
  /** Siempre positivo; el signo lo determina el tipo (pago, crédito y bonificación restan). */
  amount?: Cents;
  amountConfidence: Confidence;
  currency: 'ARS' | 'USD';
  installment?: { n: number; total: number };
  installmentConfidence?: Confidence;
  /** Crédito por refinanciación (el saldo pasó a cuotas, p. ej. Plan V). */
  refinancing?: boolean;
  /** Débito y devolución del mismo importe que se anulan entre sí (no se importan). */
  cancelsOut?: boolean;
  /** Extractos de cuenta: si el movimiento fue un débito o un crédito. */
  direction?: 'debito' | 'credito';
  suggestedCategory: string;
  suggestedKind: ExpenseKind;
  confidence: Confidence;
  warnings: string[];
  sourceLine: string;
  page?: number;
  /** Historial de otra app: cuenta o billetera del movimiento (Efectivo, Mercado Pago…). */
  account?: string;
}

export interface UpcomingInstallments {
  /** Etiqueta tal como figura en el resumen (p. ej. "Octubre/26"). */
  label: string;
  amount: Cents;
}

export interface ParsedDocument {
  /** resumen: resumen de tarjeta · cuenta: movimientos de cuenta bancaria · consumos: consumos del período abierto (app de la tarjeta). */
  docType?: 'resumen' | 'cuenta' | 'consumos' | 'historial';
  entity: Field<string>;
  currency: 'ARS' | 'USD' | 'mixta';
  decimalFormat: DecimalFormat;
  total: Field<Cents>;
  minimumPayment: Field<Cents>;
  closingDate: Field<string>;
  dueDate: Field<string>;
  previousBalance: Field<Cents>;
  nextClosingDate: Field<string>;
  nextDueDate: Field<string>;
  /** Cuadro "Cuotas a vencer" de los próximos resúmenes, si el documento lo trae. */
  upcoming: UpcomingInstallments[];
  /** Mes de imputación sugerido (mes de vencimiento). */
  month?: MonthKey;
  /** Extractos de cuenta: totales informados vs. leídos (para verificar que no falte ninguna línea). */
  accountCheck?: { opening?: Cents; closing?: Cents; credits?: Cents; debits?: Cents; parsedCredits: Cents; parsedDebits: Cents };
  /** Consumos del período abierto: total que muestra la app (pesos enteros) vs. suma leída. */
  activityCheck?: { declaredWhole: number; parsed: Cents; label: string };
  items: ParsedItem[];
  warnings: string[];
  undetermined: string[];
  lineCount: number;
}

const MONTHS = '(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)';
const DATE_TOKEN = new RegExp(`^(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|\\d{1,2}[\\s.-]?${MONTHS}[a-z]*\\.?(?:[\\s.-]?\\d{2,4})?)(?=\\s|$)`, 'i');
const DATE_ANY = new RegExp(`(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}[\\s.-]?${MONTHS}[a-z]*\\.?[\\s.-]?\\d{2,4})`, 'gi');
const AMOUNT_TOKEN = /\(?-?\s?(?:\$|ARS|U\$S|US\$|USD)?\s?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?!\d)-?\)?/gi;
/** Importe "de dinero": con dos decimales (1.234,56 · 1234,56 · 400,00-). */
const MONEY_LIKE = /^\(?-?\$?\s?\d[\d.,]*[.,]\d{2}-?\)?$/;
const INSTALLMENT_EXPLICIT = /(?:\bc(?:uota)?\.?\s?|\bcuota\s+)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i;
const INSTALLMENT_PLANV = /\bplan\s*v\s+(\d{1,2})-(\d{1,2})\b/i;
const INSTALLMENT_BARE = /(?<![\d/.-])(\d{1,2})\s?\/\s?(\d{1,2})(?![\d/.-])/;

const RE_PAYMENT = /\b(su pago|pago con saldo|pago recibido|pago en pesos|pago en dolares|pago tarjeta|gracias por su pago|pago de resumen|pago resumen)\b/;
const RE_CHARGE = /\b(interes(es)?|iva|impuesto|imp|sellos|percepcion|perc|comis\w*|cargo|mantenimiento|seguro de vida|punitorio|db iva|rg ?\d{4}|ganancias|bienes personales)\b/;
const RE_OBLIG = /\b(plan v|prestamo|refinanc\w*|financiacion|plan de pagos|adelanto)\b/;
const RE_REFI = /\b(plan v|refinanc\w*|financiacion|plan de pagos)\b/;
const RE_BONIF = /\b(bonif\w*|reintegro|devolucion|descuento|anulacion|contracargo|cr)\b/;
const RE_SANCOR = /\b(sancor|sanc)\b/;

// Etiquetas de los datos del resumen (sobre texto con acentos, sin distinguir mayúsculas).
const LBL_TOTAL = /(total\s+a\s+pagar|saldo\s+actual|saldo\s+total|total\s+del\s+resumen|total\s+resumen|importe\s+total|saldo\s+a\s+pagar|total\s+a\s+abonar)/i;
const LBL_MIN = /(?<!pr[oó]x\w*\.?\s)(pago\s+m[ií]n(?:imo|\.)?|m[ií]nimo\s+a\s+pagar)(?![.:\s]*ant)/i;
const LBL_CLOSING = /(?<!pr[oó]x\w*\.?\s)(cierre\s+actual|fecha\s+de\s+cierre|cierre)(?![.:\s]*ant)/i;
const LBL_DUE = /(?<!pr[oó]x\w*\.?\s)(vencimiento\s+actual|fecha\s+de\s+vencimiento|vencimiento|vto\.?|\bvence(?:\s+el)?)(?![.:\s]*ant)/i;
const LBL_PREV = /(saldo\s+anterior|venci[oó]\s+el\s+[\d/]+,?\s+por)/i;
// Fechas sin año en texto corrido (p. ej. Naranja X: "El resumen actual cerró el 27/08").
const RE_CLOSING_DM = /resumen\s+actual\s+cerr[oó]\s+el\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i;
const RE_NEXT_CLOSING_DM = /pr[oó]ximo\s+resumen\s+cierra\s+el\s+(\d{1,2})\/(\d{1,2})/i;
const RE_VENCE_DM = /\bvence\s+el\s+(\d{1,2})\/(\d{1,2})(?!\/)/i;
const LBL_NEXT_CLOSING = /(pr[oó]x(?:imo|\.)?\s+cierre)/i;
const LBL_NEXT_DUE = /(pr[oó]x(?:imo|\.)?\s+(?:vto\.?|vencimiento))/i;
// Encabezados en columnas (la etiqueta en una fila y el valor debajo).
const CELL_DUE = /^(vencimiento|vto\.?|fecha de vencimiento)$/i;
const CELL_TOTAL = /^(saldo\s*\$|saldo actual|total a pagar|saldo|tu deuda en pesos:?)$/i;
const CELL_PREV = /^(resumen anterior|saldo anterior)$/i;
const CELL_CLOSING = /^(fecha de cierre|cierre actual)$/i;
const CELL_MIN = /^(pago\s*m[ií]n(?:imo)?\.?\s*\$?)$/i;
const CELL_NEXT_DUE = /^(pr[oó]x(?:imo|\.)?\s*vto\.?|pr[oó]ximo vencimiento)$/i;

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

/** Importes en el texto, ignorando los números que forman parte de una fecha. */
function findAmounts(s: string): Array<{ raw: string; index: number; end: number }> {
  const masked = s.replace(DATE_ANY, (m) => ' '.repeat(m.length));
  const out: Array<{ raw: string; index: number; end: number }> = [];
  for (const m of masked.matchAll(AMOUNT_TOKEN)) {
    const raw = m[0].trim();
    if (!/\d/.test(raw)) continue;
    const index = (m.index ?? 0) + m[0].indexOf(raw);
    out.push({ raw, index, end: index + raw.length });
  }
  return out;
}

function isMoneyLike(raw: string) {
  return MONEY_LIKE.test(raw.replace(/\s/g, ''));
}

function firstDateAfter(text: string, from: number, year?: number): string | undefined {
  const re = new RegExp(DATE_ANY.source, 'gi');
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const d = parseDateEs(m[1], year);
    if (d) return d.iso;
  }
  return undefined;
}

function firstMoneyAfter(text: string, from: number, fmt: DecimalFormat): Cents | undefined {
  for (const a of findAmounts(text)) {
    if (a.index < from || !isMoneyLike(a.raw)) continue;
    const v = parseAmount(a.raw, fmt);
    if (v !== null) return v;
  }
  return undefined;
}

/** Valor ubicado debajo de una etiqueta de columna (fila siguiente, posición horizontal más cercana). */
function valueBelow(lines: SourceLine[], idx: number, labelX: number, kind: 'fecha' | 'importe', fmt: DecimalFormat): string | Cents | undefined {
  const cur = lines[idx];
  for (let j = idx + 1; j <= Math.min(idx + 2, lines.length - 1); j++) {
    const next = lines[j];
    if (!next.cells || next.page !== cur.page) continue;
    let best: { d: number; v: string | Cents } | undefined;
    for (const c of next.cells) {
      let v: string | Cents | undefined;
      if (kind === 'fecha') v = parseDateEs(c.s)?.iso;
      else if (isMoneyLike(c.s)) v = parseAmount(c.s, fmt) ?? undefined;
      if (v === undefined) continue;
      const d = Math.abs(c.x - labelX);
      if (d <= 100 && (!best || d < best.d)) best = { d, v };
    }
    if (best) return best.v;
  }
  return undefined;
}

interface Columns {
  pesos?: number;
  usd?: number;
  /** Columna del detalle/concepto (para no mezclar tarjeta o comprobante en el concepto). */
  detalle?: number;
  /** Columna "Cuota/Plan". */
  cuota?: number;
}

/** Encabezado del detalle de movimientos: columnas de pesos y dólares (y, si hay, detalle y cuota). */
function headerColumns(l: SourceLine): Columns | null {
  if (!l.cells) return null;
  const p = l.cells.find((c) => /^(pesos|\$|\$ ?ars|pago en pesos)$/i.test(c.s));
  const u = l.cells.find((c) => /^(d[oó]lares|u\$s|usd|pago en d[oó]lares)$/i.test(c.s));
  if (!p || !l.cells.some((c) => /^fecha$/i.test(c.s))) return null;
  // Sin columna de dólares solo se acepta si hay columna de detalle/descripción.
  if (!u && !l.cells.some((c) => /^(detalle|descripci[oó]n)/i.test(c.s))) return null;
  const d = l.cells.find((c) => /^(detalle|descripci[oó]n)/i.test(c.s));
  const q = l.cells.find((c) => /^cuota(\/plan)?s?$/i.test(c.s));
  return { pesos: p.x, usd: u?.x, detalle: d?.x, cuota: q?.x };
}

function findColumns(lines: SourceLine[]): Columns {
  for (const l of lines) {
    const h = headerColumns(l);
    if (h) return h;
  }
  return {};
}

function conceptCells(l: SourceLine, cols: Columns): string[] {
  const threshold = Math.min(cols.pesos ?? Infinity, cols.usd ?? Infinity) - 45;
  const from = cols.detalle !== undefined ? cols.detalle - 15 : 0;
  return (l.cells ?? []).filter((c) => c.x >= from && c.x < threshold && !isMoneyLike(c.s)).map((c) => c.s);
}

/** Renglón sin fecha dentro del detalle: cargo con importe en la columna de pesos. */
function parseUndatedLine(l: SourceLine, idx: number, fmt: DecimalFormat, cols: Columns, pending: string, fallbackDate: string | undefined): ParsedItem | 'pendiente' | null {
  const threshold = Math.min(cols.pesos!, cols.usd ?? Infinity) - 45;
  const money = (l.cells ?? []).filter((c) => c.x >= threshold && isMoneyLike(c.s));
  const words = conceptCells(l, cols).join(' ').trim();
  if (!money.length) return words && /[a-záéíóúñ]{2,}/i.test(words) ? 'pendiente' : null;
  const concept = [pending, words].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
  const n = normalizeText(concept);
  if (!/[a-záéíóúñ]{2,}/i.test(concept) || /\b(total|subtotal|saldo|pago minimo|consumos de)\b/.test(n)) return null;
  const pesos = money.filter((c) => cols.usd === undefined || Math.abs(c.x - cols.pesos!) <= Math.abs(c.x - cols.usd));
  if (!pesos.length) return null;
  const v = parseAmount(pesos[pesos.length - 1].s, fmt);
  if (v === null || v === 0) return null;
  const kind: ItemKind = v < 0 ? (RE_BONIF.test(n) ? 'bonificacion' : 'credito') : RE_CHARGE.test(n) ? 'cargo' : 'consumo';
  const cat = kind === 'cargo' || kind === 'bonificacion' ? { category: 'Cargos financieros', kind: 'personal' as ExpenseKind } : suggestCategory(concept);
  const c = ocrConf(l);
  return {
    index: idx,
    kind,
    date: fallbackDate,
    dateConfidence: fallbackDate ? 'media' : 'baja',
    concept: concept.replace(/\s*\*\s*$/, ''),
    amount: Math.abs(v),
    amountConfidence: 'alta',
    currency: 'ARS',
    suggestedCategory: cat.category,
    suggestedKind: cat.kind,
    confidence: fallbackDate ? lowerOf('media', c) : 'baja',
    warnings: ['Cargo sin fecha en el resumen: se usó la fecha de cierre.'],
    sourceLine: [pending, l.text].filter(Boolean).join(' · '),
    page: l.page,
  };
}

const MONTH_NAMES = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\/\d{2}$/i;

/** Cuadro "Cuotas a vencer": meses en una fila y montos en la siguiente. */
function parseUpcoming(lines: SourceLine[], fmt: DecimalFormat): UpcomingInstallments[] {
  const f = lines.findIndex((l) => /cuotas\s+futuras/i.test(l.text));
  if (f >= 0) {
    // Formato "Octubre/26 $0,00." (un mes por renglón, a veces junto a otro texto).
    const out: UpcomingInstallments[] = [];
    for (const l of lines.slice(f, f + 20)) {
      for (const m of l.text.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\/(\d{2})\.?\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi)) {
        const v = parseAmount(m[3], fmt);
        if (v !== null) out.push({ label: `${m[1]}/${m[2]}`, amount: v });
      }
    }
    if (out.length) return out;
  }
  const i = lines.findIndex((l) => /cuotas\s+a\s+vencer/i.test(l.text));
  if (i < 0) return [];
  for (let j = i + 1; j < Math.min(i + 4, lines.length - 1); j++) {
    const labels = lines[j].text.split(/\s+/).filter((t) => MONTH_NAMES.test(t));
    if (labels.length < 2) continue;
    const amounts = findAmounts(lines[j + 1].text)
      .filter((a) => isMoneyLike(a.raw))
      .map((a) => parseAmount(a.raw, fmt))
      .filter((v): v is number => v !== null);
    if (amounts.length < labels.length) return [];
    return labels.map((label, k) => ({ label, amount: amounts[k] }));
  }
  return [];
}

/**
 * Interpreta el texto de un resumen o listado de movimientos. El texto se trata
 * exclusivamente como datos: nunca se ejecuta ni se interpreta como instrucción.
 */
export function parseStatementText(lines: SourceLine[], opts: { fallbackYear?: number } = {}): ParsedDocument {
  const clean = lines
    .map((l) => ({
      ...l,
      text: (l.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/(\s_+)+\s*$/, '').replace(/\s+/g, ' ').trim(),
      cells: l.cells?.filter((c) => c.s && !/^_+$/.test(c.s)),
    }))
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
    nextClosingDate: { confidence: 'baja' },
    nextDueDate: { confidence: 'baja' },
    upcoming: parseUpcoming(clean, fmt),
    items: [],
    warnings,
    undetermined,
    lineCount: clean.length,
  };

  // Primera pasada: datos del resumen escritos en la misma línea que su etiqueta.
  const summaryLine = new Set<number>();
  const setDate = (f: Field<string>, v: string | undefined, c: Confidence, src: string) => {
    if (v && f.value === undefined) Object.assign(f, { value: v, confidence: c, source: src });
  };
  const setMoney = (f: Field<Cents>, v: Cents | undefined, c: Confidence, src: string) => {
    if (v !== undefined && f.value === undefined) Object.assign(f, { value: v, confidence: c, source: src });
  };
  clean.forEach((l, idx) => {
    // Las líneas que empiezan con una fecha son movimientos: no contienen datos del resumen.
    if (DATE_TOKEN.test(l.text)) return;
    const c = ocrConf(l);
    const t = l.text;
    let hit = false;
    const at = (re: RegExp) => {
      const m = re.exec(t);
      if (m) hit = true;
      return m ? (m.index ?? 0) + m[0].length : -1;
    };
    let p: number;
    if ((p = at(LBL_PREV)) >= 0) setMoney(doc.previousBalance, firstMoneyAfter(t, p, fmt), c, t);
    if ((p = at(LBL_NEXT_CLOSING)) >= 0) setDate(doc.nextClosingDate, firstDateAfter(t, p), c, t);
    if ((p = at(LBL_NEXT_DUE)) >= 0) setDate(doc.nextDueDate, firstDateAfter(t, p), c, t);
    if ((p = at(LBL_TOTAL)) >= 0) setMoney(doc.total, firstMoneyAfter(t, p, fmt), c, t);
    if ((p = at(LBL_MIN)) >= 0) setMoney(doc.minimumPayment, firstMoneyAfter(t, p, fmt), c, t);
    if ((p = at(LBL_CLOSING)) >= 0) setDate(doc.closingDate, firstDateAfter(t, p), c, t);
    if ((p = at(LBL_DUE)) >= 0) {
      const d = firstDateAfter(t, p);
      // "Vencimiento" seguido por la fecha del próximo cierre no es el vencimiento.
      setDate(doc.dueDate, d, c, t);
    }
    if (hit && !DATE_TOKEN.test(t)) summaryLine.add(idx);
  });

  // Segunda pasada: datos en columnas (etiqueta arriba, valor debajo).
  clean.forEach((l, idx) => {
    if (!l.cells) return;
    for (const cell of l.cells) {
      if (doc.dueDate.value === undefined && CELL_DUE.test(cell.s)) {
        const v = valueBelow(clean, idx, cell.x, 'fecha', fmt) as string | undefined;
        setDate(doc.dueDate, v, 'alta', `${cell.s} (columna)`);
      } else if (doc.nextDueDate.value === undefined && CELL_NEXT_DUE.test(cell.s)) {
        setDate(doc.nextDueDate, valueBelow(clean, idx, cell.x, 'fecha', fmt) as string | undefined, 'alta', `${cell.s} (columna)`);
      } else if (doc.total.value === undefined && CELL_TOTAL.test(cell.s)) {
        setMoney(doc.total, valueBelow(clean, idx, cell.x, 'importe', fmt) as Cents | undefined, 'alta', `${cell.s} (columna)`);
      } else if (doc.minimumPayment.value === undefined && CELL_MIN.test(cell.s)) {
        setMoney(doc.minimumPayment, valueBelow(clean, idx, cell.x, 'importe', fmt) as Cents | undefined, 'alta', `${cell.s} (columna)`);
      } else if (doc.previousBalance.value === undefined && CELL_PREV.test(cell.s)) {
        setMoney(doc.previousBalance, valueBelow(clean, idx, cell.x, 'importe', fmt) as Cents | undefined, 'alta', `${cell.s} (columna)`);
      } else if (doc.closingDate.value === undefined && CELL_CLOSING.test(cell.s)) {
        setDate(doc.closingDate, valueBelow(clean, idx, cell.x, 'fecha', fmt) as string | undefined, 'alta', `${cell.s} (columna)`);
      }
    }
  });

  // Fechas de cierre sin año: el año se deduce del vencimiento.
  if (doc.dueDate.value) {
    const dy = Number(doc.dueDate.value.slice(0, 4));
    const dmo = Number(doc.dueDate.value.slice(5, 7));
    const iso = (d: string, m: string, y: number) => {
      const r = parseDateEs(`${d}/${m}/${y}`);
      return r?.iso;
    };
    clean.forEach((l, idx) => {
      const c = l.text.match(RE_CLOSING_DM);
      if (c && doc.closingDate.value === undefined) {
        const y = c[3] ? Number(c[3].length === 2 ? `20${c[3]}` : c[3]) : Number(c[2]) > dmo ? dy - 1 : dy;
        setDate(doc.closingDate, iso(c[1], c[2], y), 'alta', l.text);
      }
      const n = l.text.match(RE_NEXT_CLOSING_DM);
      if (n && doc.nextClosingDate.value === undefined) {
        setDate(doc.nextClosingDate, iso(n[1], n[2], Number(n[2]) < dmo ? dy + 1 : dy), 'alta', l.text);
        const near = [l.text, clean[idx + 1]?.text ?? '', clean[idx + 2]?.text ?? ''];
        const v = near.map((t) => t.match(RE_VENCE_DM)).find(Boolean);
        if (v) setDate(doc.nextDueDate, iso(v[1], v[2], Number(v[2]) < dmo ? dy + 1 : dy), 'alta', near.join(' '));
      }
    });
  }

  const refDate = doc.dueDate.value ?? doc.closingDate.value;
  const fallbackYear = refDate ? Number(refDate.slice(0, 4)) : opts.fallbackYear;
  doc.month = doc.dueDate.value ? monthOf(doc.dueDate.value) : doc.closingDate.value ? addMonths(monthOf(doc.closingDate.value), 1) : undefined;
  if (!doc.dueDate.value && doc.closingDate.value)
    warnings.push('No se encontró la fecha de vencimiento: el mes de imputación se estimó como el mes siguiente al cierre.');

  // Tercera pasada: movimientos. Las columnas se toman del encabezado de cada sección.
  let cols: Columns = findColumns(clean);
  let inSection = false;
  let pending = '';
  clean.forEach((l, idx) => {
    const h = headerColumns(l);
    if (h) {
      cols = h;
      inSection = true;
      pending = '';
      return;
    }
    if (summaryLine.has(idx)) return;
    if (/^(total\b|tarjeta\b.*\btotal\b)/i.test(l.text)) {
      inSection = false;
      pending = '';
    }
    const item = parseMovementLine(l, idx, fmt, fallbackYear, refDate, cols, { prev: clean[idx - 1], next: clean[idx + 1] });
    if (item) {
      doc.items.push(item);
      pending = '';
      return;
    }
    // Cargos sin fecha dentro del detalle (p. ej. "Otros cargos: IVA… / Impuesto de Sellos").
    if (inSection && l.cells && cols.pesos !== undefined && !DATE_TOKEN.test(l.text)) {
      const u = parseUndatedLine(l, idx, fmt, cols, pending, doc.closingDate.value ?? refDate);
      if (u === 'pendiente') pending = [pending, conceptCells(l, cols).join(' ')].filter(Boolean).join(' ');
      else if (u) {
        doc.items.push(u);
        pending = '';
      }
    }
  });

  // Compra en cuotas anulada: la devolución cubre el total de la compra (cuota × cantidad de cuotas).
  for (const q of doc.items.filter((i) => i.kind === 'cuota' && i.installment && i.amount)) {
    const tot = q.amount! * q.installment!.total;
    const cr = doc.items.find((c) => (c.kind === 'credito' || c.kind === 'bonificacion') && !c.cancelsOut && normalizeText(c.concept) === normalizeText(q.concept) && Math.abs((c.amount ?? 0) - tot) <= q.installment!.total * 100);
    if (cr) {
      q.cancelsOut = true;
      cr.cancelsOut = true;
      q.warnings.push('Compra anulada: la devolución cubre todas las cuotas. No se registran cuotas futuras.');
      cr.warnings.push('Devolución de una compra en cuotas anulada: se compensan entre sí.');
    }
  }

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
  if (doc.items.some((i) => i.refinancing))
    warnings.push('El saldo anterior se refinanció (Plan V u otra financiación): ese crédito no se importa porque la deuda continúa como cuotas.');
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
  cols: Columns,
  ctx: { prev?: SourceLine; next?: SourceLine } = {},
): ParsedItem | null {
  const dm = l.text.match(DATE_TOKEN);
  if (!dm) return null;
  const pd = parseDateEs(dm[1], fallbackYear);
  if (!pd) return null;
  let date = pd.iso;
  const dateConfidence: Confidence = pd.yearInferred ? 'media' : 'alta';
  // Fechas sin año posteriores al vencimiento corresponden al año anterior (resumen de enero, consumo de diciembre).
  if (pd.yearInferred && refDate && date > refDate) date = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
  const text = l.text.slice(dm[0].length).trim();
  const warnings: string[] = [];

  let amountRaw: string | undefined;
  let concept: string;
  let currency: 'ARS' | 'USD' = 'ARS';

  if (l.cells && cols.pesos !== undefined) {
    // Lectura por columnas: el importe en pesos o en dólares según su posición.
    const threshold = Math.min(cols.pesos, cols.usd ?? Infinity) - 45;
    const money = l.cells.filter((c) => c.x >= threshold && isMoneyLike(c.s));
    if (!money.length) return null;
    const usdX = cols.usd ?? Infinity;
    const pesos = money.filter((c) => Math.abs(c.x - cols.pesos!) <= Math.abs(c.x - usdX));
    const usd = money.filter((c) => Math.abs(c.x - usdX) < Math.abs(c.x - cols.pesos!));
    const usdNonZero = usd.find((c) => parseAmount(c.s, fmt) !== 0);
    if (pesos.length) amountRaw = pesos[pesos.length - 1].s;
    else if (usdNonZero) {
      amountRaw = usdNonZero.s;
      currency = 'USD';
    } else return null;
    if (pesos.length && usdNonZero) warnings.push('La línea tiene importe en pesos y en dólares: verifique.');
    const firstMoneyX = money[0].x;
    if (cols.detalle !== undefined) {
      // Solo la columna del detalle (sin tarjeta ni cupón); la cuota sale de su columna.
      const qCell = cols.cuota !== undefined ? l.cells.find((c) => Math.abs(c.x - cols.cuota!) <= 30 && /^\d{1,2}\/\d{1,2}$/.test(c.s)) : undefined;
      concept = l.cells
        .filter((c) => c.x >= cols.detalle! - 15 && c.x < firstMoneyX && c !== qCell)
        .map((c) => c.s)
        .join(' ')
        .trim();
      if (qCell) concept = `${concept} C.${qCell.s}`;
    } else {
      concept = l.cells
        .filter((c) => c.x < firstMoneyX)
        .map((c) => c.s)
        .join(' ')
        .slice(dm[0].length)
        .trim();
    }
  } else {
    const amounts = findAmounts(text);
    if (!amounts.length) return null;
    const moneyIdx = amounts.map((a, i) => (isMoneyLike(a.raw) ? i : -1)).filter((i) => i >= 0);
    let k = moneyIdx.length ? moneyIdx[moneyIdx.length - 1] : amounts.length - 1;
    // Dos columnas al final (pesos y dólares) con dólares en cero: usar la de pesos.
    if (k > 0 && parseAmount(amounts[k].raw, fmt) === 0 && isMoneyLike(amounts[k - 1].raw) && /^\s*$/.test(text.slice(amounts[k - 1].end, amounts[k].index))) k -= 1;
    const chosen = amounts[k];
    // Después del importe no debe haber más texto (si lo hay, no es una línea de movimiento).
    const after = text.slice(chosen.end);
    const afterClean = after.replace(/\s-?\d[\d.,]*-?/g, '').trim();
    if (/[a-záéíóúñ]{2,}/i.test(afterClean)) return null;
    amountRaw = chosen.raw;
    concept = text.slice(0, chosen.index).trim();
    if (/\b(usd|u\$s|us\$|dolar|dolares)\b/i.test(l.text) || /u\$s|us\$/i.test(l.text)) currency = 'USD';
  }

  const parsed = parseAmount(amountRaw, fmt);
  if (parsed === null) return null;

  // Diseño en tres renglones (p. ej. Ualá): descripción arriba, fecha/cupón/importe, y lugar + cuota debajo.
  concept = concept.replace(/(^|\s)[A-Z]?\d{4,}[A-Z*]?(?=\s|$)/g, ' ').trim();
  const plain = (x?: SourceLine) => !!x && !DATE_TOKEN.test(x.text) && !findAmounts(x.text).some((a) => isMoneyLike(a.raw)) && !headerColumns(x);
  if (!/[a-záéíóúñ]{2,}/i.test(concept) && plain(ctx.prev)) {
    concept = ctx.prev!.cells && cols.detalle !== undefined ? ctx.prev!.cells.filter((c) => c.x >= cols.detalle! - 15).map((c) => c.s).join(' ') : ctx.prev!.text;
  }
  const below = plain(ctx.next) ? ctx.next!.text.match(/\((\d{1,2})\/(\d{1,2})\)/) : null;
  if (below && !INSTALLMENT_EXPLICIT.test(concept) && !INSTALLMENT_BARE.test(concept)) concept = `${concept} C.${below[1]}/${below[2]}`;

  let installment: ParsedItem['installment'];
  let installmentConfidence: Confidence | undefined;
  const ipv = concept.match(INSTALLMENT_PLANV);
  const ie = ipv ? null : concept.match(INSTALLMENT_EXPLICIT);
  const ib = ipv || ie ? null : concept.match(INSTALLMENT_BARE);
  const im = ipv ?? ie ?? ib;
  if (im) {
    const n = Number(im[1]);
    const total = Number(im[2]);
    if (n >= 1 && total >= 1 && n <= total && total <= 99 && (total >= 2 || ipv)) {
      installment = { n, total };
      installmentConfidence = ipv || ie ? 'alta' : 'media';
      const keep = ipv ? im[0].replace(/\s+\d{1,2}-\d{1,2}$/, '') : '';
      concept = (concept.slice(0, im.index) + ' ' + keep + ' ' + concept.slice((im.index ?? 0) + im[0].length)).trim();
    }
  }
  // Limpieza del concepto: número de comprobante, marcadores y columnas sueltas.
  concept = concept
    .replace(/^[*#\-\s]+/, '')
    .replace(/^\d{3,}[A-Z*]?\s+/i, '')
    .replace(/\s+[*#_$]+\s*$/, '')
    .replace(/\s-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}-?$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!/[a-záéíóúñ]{2,}/i.test(concept)) return null;

  const n = normalizeText(concept);
  const lineNorm = normalizeText(l.text);
  if (currency === 'ARS' && !l.cells && /\b(usd|u\$s|us\$)\b/i.test(l.text)) currency = 'USD';

  let kind: ItemKind = 'consumo';
  let refinancing = false;
  const negative = parsed < 0;
  if (RE_PAYMENT.test(lineNorm)) kind = 'pago';
  else if (negative && RE_REFI.test(n)) {
    kind = 'credito';
    refinancing = true;
  } else if (negative && RE_BONIF.test(n)) kind = 'bonificacion';
  else if (negative) kind = 'credito';
  else if (RE_SANCOR.test(n)) kind = 'sancor';
  else if (installment) kind = 'cuota';
  else if (RE_CHARGE.test(n)) kind = 'cargo';
  else if (RE_OBLIG.test(n)) kind = 'cuota';
  else if (RE_BONIF.test(n) && /bonif|devolucion|reintegro/.test(n)) kind = 'bonificacion';

  const amount = Math.abs(parsed);
  let amountConfidence: Confidence = isMoneyLike(amountRaw) ? 'alta' : 'media';
  if (fmt === 'coma' && /^\d+\.\d{2}$/.test(amountRaw.replace(/[$\s-]/g, ''))) {
    amountConfidence = 'baja';
    warnings.push('Separador decimal ambiguo en el importe.');
  }
  if (amountConfidence === 'media') warnings.push('El importe no tiene decimales: verifique que sea correcto.');
  if (dateConfidence === 'media') warnings.push('El año de la fecha fue inferido del resumen.');
  if (installmentConfidence === 'media') warnings.push('Número de cuota inferido (sin indicador "C." o "Cuota").');
  if (currency === 'USD') warnings.push('Importe en dólares: conviértalo a pesos o descarte la línea.');
  if (kind === 'cuota' && !installment) warnings.push('Obligación sin número de cuota: complete cuota actual y total.');
  if (kind === 'cuota' && installment) warnings.push(`Cuota ${installment.n} de ${installment.total}: la fecha es la de la compra original.`);
  if (refinancing) warnings.push('Crédito por refinanciación: el saldo anterior pasó a cuotas. No se importa (las cuotas se registran aparte).');
  if (kind === 'bonificacion') warnings.push('Bonificación o devolución: se registra restando del gasto.');

  const oc = ocrConf(l);
  if (oc !== 'alta') warnings.push(`Lectura OCR con confianza ${oc} (${Math.round(l.ocrConfidence ?? 0)} %).`);
  let confidence: Confidence = lowerOf(lowerOf(dateConfidence, amountConfidence), oc);
  if (currency === 'USD') confidence = 'baja';
  if (installmentConfidence) confidence = lowerOf(confidence, installmentConfidence);

  const cat =
    kind === 'sancor'
      ? { category: 'Obra social', kind: 'hogar' as ExpenseKind }
      : kind === 'cargo' || (kind === 'bonificacion' && RE_CHARGE.test(n))
        ? { category: 'Cargos financieros', kind: 'personal' as ExpenseKind }
        : suggestCategory(concept);

  return {
    index: idx,
    kind,
    date,
    dateConfidence,
    concept,
    amount,
    amountConfidence,
    currency,
    installment,
    installmentConfidence,
    refinancing: refinancing || undefined,
    suggestedCategory: cat.category,
    suggestedKind: cat.kind,
    confidence,
    warnings,
    sourceLine: l.text,
    page: l.page,
  };
}

/** Signo con que cada tipo de línea afecta el saldo del resumen. */
export function statementSign(kind: ItemKind): 1 | -1 | 0 {
  if (kind === 'pago' || kind === 'credito' || kind === 'bonificacion') return -1;
  if (kind === 'desconocido' || kind === 'adelanto' || kind === 'transferencia' || kind === 'ingreso' || kind === 'pago_prestamo') return 0;
  return 1;
}

export interface Reconciliation {
  computed: Cents;
  expected: Cents;
  difference: Cents;
  ok: boolean;
}

/**
 * Verificación: saldo anterior + consumos, cuotas y cargos − pagos, créditos y
 * bonificaciones debe ser igual al total del resumen.
 */
export function reconcile(
  previousBalance: Cents | undefined,
  total: Cents | undefined,
  items: Array<{ kind: ItemKind; amount?: Cents; currency: 'ARS' | 'USD' }>,
): Reconciliation | null {
  if (total === undefined) return null;
  let computed = previousBalance ?? 0;
  for (const it of items) if (it.currency === 'ARS' && it.amount !== undefined) computed += statementSign(it.kind) * it.amount;
  const difference = total - computed;
  return { computed, expected: total, difference, ok: Math.abs(difference) <= 1 };
}

/**
 * Verificación de "Cuotas a vencer": para el k-ésimo próximo resumen suma las
 * cuotas de este documento que siguen vigentes (n + k ≤ total).
 */
export function checkUpcoming(upcoming: UpcomingInstallments[], items: Array<{ kind: ItemKind; amount?: Cents; installment?: { n: number; total: number } }>) {
  return upcoming.map((u, i) => {
    const k = i + 1;
    const computed = items
      .filter((it) => it.kind === 'cuota' && it.installment && it.installment.n + k <= it.installment.total)
      .reduce((a, it) => a + (it.amount ?? 0), 0);
    return { ...u, computed, ok: Math.abs(computed - u.amount) <= 1 };
  });
}
