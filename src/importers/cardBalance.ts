import { parseAmount } from '../domain/money';
import { detectEntity } from './classify';
import type { ParsedDocument, SourceLine } from './statementParser';
import { todayIso } from '../domain/dates';

/**
 * Captura de la pantalla "Tarjeta de crédito → Saldo a pagar" de la app (Ualá y similares):
 * no trae consumos, solo el total a pagar, el cierre y el vencimiento. Se carga como el resumen
 * del mes (total sin detalle) para que figure en Deudas y en "Este mes pagás".
 */
export function parseCardBalance(lines: SourceLine[], ctx: { fileName?: string; today?: string } = {}): ParsedDocument | null {
  const texts = lines.map((l) => (l.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = texts.join('\n');
  if (!/saldo a pagar/i.test(all) || !/total en pesos/i.test(all) || !/vencimiento/i.test(all)) return null;
  // Un resumen con movimientos no es esta pantalla.
  if (texts.filter((t) => /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}.*\d[.,]\d{2}\s*$/.test(t)).length > 2) return null;

  const total = texts.map((t) => t.match(/total en pesos\s*\$?\s*(-?[\d.]+,\d{2})/i)?.[1]).find(Boolean);
  const amount = total ? parseAmount(total) : null;
  const dm = (label: RegExp) => texts.map((t) => t.match(new RegExp(`${label.source}\\s+(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?`, 'i'))).find(Boolean);
  const today = ctx.today ?? todayIso();
  const iso = (m: RegExpMatchArray | null | undefined, ref?: string) => {
    if (!m) return undefined;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (!d || !mo || d > 31 || mo > 12) return undefined;
    let y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4));
    const base = ref ?? today;
    const s = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!m[3]) {
      // Sin año: el más cercano a la fecha de referencia (un vencimiento de enero visto en diciembre es del año que viene).
      const diff = (yy: number) => Math.abs(Date.parse(s(yy)) - Date.parse(base));
      y = [y - 1, y, y + 1].sort((a, b) => diff(a) - diff(b))[0];
    }
    return s(y);
  };
  const due = iso(dm(/vencimiento/));
  const closing = iso(dm(/cierre/), due);
  if (amount == null || !due) return null;

  // "Mastercard" o "Visa" es la marca, no quién emite la tarjeta: no sirve como entidad.
  const found = detectEntity(`${all} ${ctx.fileName ?? ''}`).entity;
  const detected = found && !/^(visa|master ?card|american|amex)$/i.test(found.trim()) ? found : undefined;
  const entity = detected ?? (/ual/i.test(ctx.fileName ?? '') || /mastercard/i.test(all) ? 'Ualá' : undefined);
  const warnings = ['Captura del saldo de la tarjeta: se carga el total a pagar, sin el detalle de consumos. Cuando tengas el resumen, subilo: con el mismo total no se duplica.'];
  if (!detected) warnings.push(`No se ve el nombre de la tarjeta en la captura: se tomó ${entity ?? 'sin entidad'}. Verificala.`);
  return {
    docType: 'resumen',
    entity: { value: entity, confidence: detected ? 'alta' : 'media' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: { value: amount, confidence: 'alta' },
    minimumPayment: { confidence: 'baja' },
    closingDate: { value: closing, confidence: closing ? 'alta' : 'baja' },
    dueDate: { value: due, confidence: 'alta' },
    previousBalance: { confidence: 'baja' },
    nextClosingDate: { confidence: 'baja' },
    nextDueDate: { confidence: 'baja' },
    upcoming: [],
    month: due.slice(0, 7),
    items: [],
    warnings,
    undetermined: [],
    lineCount: lines.length,
  };
}
