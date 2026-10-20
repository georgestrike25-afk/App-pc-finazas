import { monthOf, parseDateEs } from '../domain/dates';
import { parseAmount } from '../domain/money';
import { normalizeText } from '../domain/text';
import { suggestCategory } from './classify';
import type { Confidence, ItemKind, ParsedDocument, ParsedItem, SourceLine } from './statementParser';

/** Movimiento de cuenta: "Concepto   + $ 1.234,56" con la fecha en la línea siguiente (o al final). */
const MOVE = /^(.*?[a-záéíóúñ].*?)\s+([+\-−–])\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?:\s+(\d{1,2}\/\d{1,2}\/\d{2,4}))?\s*$/i;
const DATE_ONLY = /^(\d{1,2}\/\d{1,2}\/\d{2,4})$/;

const RE_SALARY = /\b(sueldo|sueldos|haberes|plan sueldo|acredit\w* (de )?(sueldo|haberes)|remuneracion|jubilacion)\b/;
const RE_ADVANCE = /\b(adelanto|adelantos|descubierto)\b/;
const RE_LOAN = /\b(amort\w*|prestamo|prestamos)\b/;
const RE_CARD_PAY = /\b(pago visa|visa|mastercard|master|naranja|pago tarjeta|tarjeta credito|tarjetas de credito|amex)\b/;
const RE_OWN_TRANSFER = /\b(transferencia entre cuentas|entre cuentas|cuenta propia|transf propia)\b/;
const RE_INTEREST = /\b(acreditacion de intereses|intereses ganados)\b/;
const RE_CHARGE = /\b(impuesto|imp|ley 25413|comision|iva|percepcion|sellos|mantenimiento)\b/;

function conf(l: SourceLine): Confidence {
  if (l.ocrConfidence === undefined || l.ocrConfidence >= 80) return 'alta';
  return l.ocrConfidence >= 60 ? 'media' : 'baja';
}

/**
 * Reconoce listados de movimientos de cuenta (capturas de home banking o apps):
 * ingresos y egresos con signo, fecha debajo. Devuelve null si el documento no tiene ese formato.
 */
export function parseAccountMovements(lines: SourceLine[]): ParsedDocument | null {
  const clean = lines.map((l) => ({ ...l, text: (l.text ?? '').replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  const items: ParsedItem[] = [];
  for (let i = 0; i < clean.length; i++) {
    const m = clean[i].text.match(MOVE);
    if (!m) continue;
    let dateRaw = m[4];
    let dateLine: SourceLine | undefined;
    if (!dateRaw) {
      for (let j = i + 1; j <= Math.min(i + 2, clean.length - 1); j++) {
        const d = clean[j].text.match(DATE_ONLY);
        if (d) {
          dateRaw = d[1];
          dateLine = clean[j];
          break;
        }
        if (MOVE.test(clean[j].text)) break;
      }
    }
    const pd = dateRaw ? parseDateEs(dateRaw) : null;
    const amount = parseAmount(m[3], 'coma');
    if (amount === null) continue;
    const positive = m[2] === '+';
    const concept = m[1].trim();
    const n = normalizeText(concept);
    const warnings: string[] = [];
    let kind: ItemKind;
    if (RE_INTEREST.test(n)) kind = positive ? 'credito' : 'cargo';
    else if (RE_ADVANCE.test(n)) kind = 'adelanto';
    else if (positive && RE_SALARY.test(n)) kind = 'ingreso';
    else if (!positive && RE_LOAN.test(n)) kind = 'pago_prestamo';
    else if (RE_OWN_TRANSFER.test(n)) kind = 'transferencia';
    else if (!positive && RE_CARD_PAY.test(n)) kind = 'pago';
    else if (!positive && RE_CHARGE.test(n)) kind = 'cargo';
    else if (positive) kind = 'credito';
    else kind = 'consumo';

    if (kind === 'adelanto')
      warnings.push(positive
        ? 'Adelanto otorgado por el banco: es un préstamo que se descuenta del próximo sueldo. No es un ingreso (lo que se pagó con él ya figura como gasto).'
        : 'Cancelación de un adelanto: devuelve dinero prestado. No es un gasto nuevo (lo que se pagó con el adelanto ya figura como gasto).');
    if (kind === 'transferencia') warnings.push('Transferencia entre cuentas propias: no es ingreso ni gasto. Si ese dinero se gastó, registre el gasto donde se usó.');
    if (kind === 'credito') warnings.push(positive && RE_CARD_PAY.test(n) ? 'Crédito de tarjeta (posible reversión de un débito): no se importa automáticamente.' : 'Crédito en la cuenta: no se importa automáticamente.');
    if (!pd) warnings.push('No se encontró la fecha del movimiento: complétela.');
    const c = dateLine ? (conf(clean[i]) === 'baja' || conf(dateLine) === 'baja' ? 'baja' : conf(clean[i])) : conf(clean[i]);
    if (c !== 'alta') warnings.push(`Lectura OCR con confianza ${c} (${Math.round(clean[i].ocrConfidence ?? 0)} %).`);
    const cat = kind === 'cargo' ? { category: 'Cargos financieros', kind: 'personal' as const } : suggestCategory(concept);
    items.push({
      index: i,
      kind,
      date: pd?.iso,
      dateConfidence: pd ? 'alta' : 'baja',
      concept,
      amount,
      amountConfidence: 'alta',
      currency: 'ARS',
      suggestedCategory: cat.category,
      suggestedKind: cat.kind,
      confidence: pd ? c : 'baja',
      warnings,
      sourceLine: dateLine ? `${clean[i].text} · ${dateLine.text}` : clean[i].text,
      page: clean[i].page,
    });
  }
  if (items.length < 3) return null;
  const full = clean.map((l) => l.text).join('\n');
  const months = items.filter((i) => i.date).map((i) => monthOf(i.date!)).sort();
  const latest = months.at(-1);
  const entity = /patagonia/i.test(full) ? 'Banco Patagonia' : /mercado ?pago/i.test(full) ? 'Mercado Pago' : /naranja/i.test(full) ? 'Naranja X' : undefined;
  const none = { confidence: 'baja' as Confidence };
  return {
    docType: 'cuenta',
    entity: { value: entity, confidence: entity ? 'media' : 'baja' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: none,
    minimumPayment: none,
    closingDate: none,
    dueDate: none,
    previousBalance: none,
    nextClosingDate: none,
    nextDueDate: none,
    upcoming: [],
    month: latest,
    items,
    warnings: ['Movimientos de cuenta bancaria: cada línea se imputa al mes de su fecha. Por defecto solo se incluye el mes más reciente.'],
    undetermined: entity ? [] : ['Entidad financiera'],
    lineCount: clean.length,
  };
}
