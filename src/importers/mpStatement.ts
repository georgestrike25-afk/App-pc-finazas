import { parseAmount, type Cents } from '../domain/money';
import { suggestCategory } from './classify';
import type { ParsedDocument, ParsedItem, SourceLine } from './statementParser';

/**
 * Resumen PDF de la tarjeta de crédito de Mercado Pago ("Este es tu resumen de octubre"):
 * fechas sin año ("6/ago"), cuotas "2 de 3" con N.º de operación, cierre y vencimiento escritos
 * ("5 de octubre"), y el mínimo con los centavos aparte ("$ 70.710 16").
 */

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const mon = (w: string) => MONTHS[w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)];
const pad = (n: number) => String(n).padStart(2, '0');
const AMT = /(-?)\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

export function parseMpStatement(lines: SourceLine[], ctx: { today?: string } = {}): ParsedDocument | null {
  const texts = lines.map((l) => (l.text ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = texts.join('\n');
  if (!/este es tu resumen de [a-záéíóú]+/i.test(all) || !/detalle de movimientos/i.test(all) || !/(cierre actual|fecha de cierre)/i.test(all)) return null;
  const today = ctx.today ?? new Date().toISOString().slice(0, 10);

  // "5 de octubre" → la fecha más cercana a hoy (el resumen no trae el año).
  const near = (d: number, m: number) => {
    const y0 = Number(today.slice(0, 4));
    const iso = (y: number) => `${y}-${pad(m)}-${pad(d)}`;
    return iso([y0 - 1, y0, y0 + 1].sort((a, b) => Math.abs(Date.parse(iso(a)) - Date.parse(today)) - Math.abs(Date.parse(iso(b)) - Date.parse(today)))[0]);
  };
  const written = (label: RegExp) => {
    const m = all.match(new RegExp(`${label.source}\\s*:?\\s*(\\d{1,2}) de ([a-záéíóú]+)`, 'i'));
    return m && mon(m[2]) ? near(Number(m[1]), mon(m[2])) : undefined;
  };
  const closing = written(/cierre actual/) ?? written(/fecha de cierre/);
  const due = written(/vencimiento actual/) ?? written(/fecha de vencimiento/);
  if (!closing || !due) return null;
  const nextClosing = written(/cierre pr[oó]ximo/);
  const nextDue = written(/vencimiento pr[oó]ximo/);
  // Fecha de un movimiento ("6/ago"): del año del cierre, o del anterior si el mes es posterior al cierre.
  const itemDate = (d: number, m: number) => {
    const y = Number(closing.slice(0, 4)) - (m > Number(closing.slice(5, 7)) ? 1 : 0);
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  const money = (re: RegExp) => {
    const m = all.match(re);
    return m ? parseAmount(m[1], 'coma') ?? undefined : undefined;
  };
  const total = money(/total a pagar\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  // Los centavos van chiquitos: a veces en la misma línea ("$ 70.710 16") y a veces en una línea suelta antes.
  const mi = texts.findIndex((t) => /m[ií]nimo a pagar es/i.test(t));
  const minM = mi >= 0 ? texts[mi].match(/m[ií]nimo a pagar es\s*\$\s*(\d{1,3}(?:\.\d{3})*)(?:,(\d{2})|\s(\d{2})(?!\s*de\s))?/i) : null;
  const loose = mi >= 0 ? texts.slice(Math.max(0, mi - 3), mi).reverse().find((t) => /^\d{2}$/.test(t)) : undefined;
  const minimum = minM ? Number(minM[1].replace(/\./g, '')) * 100 + Number(minM[2] ?? minM[3] ?? loose ?? 0) : undefined;
  const previous = money(/total a pagar del per[ií]odo anterior\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);

  const items: ParsedItem[] = [];
  let section = '';
  for (const t of texts) {
    if (/^composici[oó]n del saldo/i.test(t)) section = 'anterior';
    else if (/^consumos$/i.test(t)) section = 'consumos';
    else if (/^impuestos e intereses/i.test(t)) section = 'impuestos';
    else if (/^pagos anticipados/i.test(t)) section = 'pagos';
    else if (/^ajustes y reembolsos/i.test(t)) section = 'ajustes';
    const m = t.match(/^(\d{1,2})\/([a-záéíóú]{3})[a-z]*\.?\s+(.+)$/i);
    if (!m || !mon(m[2])) continue;
    const a = m[3].match(AMT);
    if (!a) continue;
    let concept = m[3].slice(0, a.index).trim();
    if (/total a pagar del per[ií]odo anterior/i.test(concept)) continue;
    const amount = parseAmount(a[2], 'coma');
    if (amount === null) continue;
    const negative = a[1] === '-';
    const inst = concept.match(/\s(\d{1,2}) de (\d{1,2})(?:\s+\d{3,})?$/);
    if (inst) concept = concept.slice(0, inst.index).trim();
    else concept = concept.replace(/\s+\d{5,}$/, '').trim();
    const installment = inst ? { n: Number(inst[1]), total: Number(inst[2]) } : undefined;
    const kind: ParsedItem['kind'] = negative
      ? /pago/i.test(concept) ? 'pago' : 'bonificacion'
      : section === 'impuestos' || /impuesto|inter[eé]s|iva|sello|percepci/i.test(concept) ? 'cargo'
        : installment && installment.total > 1 ? 'cuota' : 'consumo';
    const sug = suggestCategory(concept);
    items.push({
      index: items.length,
      kind,
      date: itemDate(Number(m[1]), mon(m[2])),
      dateConfidence: 'alta',
      concept,
      amount,
      amountConfidence: 'alta',
      currency: 'ARS',
      installment: kind === 'cuota' ? installment : undefined,
      installmentConfidence: kind === 'cuota' ? 'alta' : undefined,
      suggestedCategory: kind === 'cargo' ? 'Cargos financieros' : sug.category,
      suggestedKind: kind === 'cargo' ? 'personal' : sug.kind,
      confidence: 'alta',
      warnings: kind === 'cuota' && installment ? [`Cuota ${installment.n} de ${installment.total}: la fecha es la de la compra original.`] : [],
      sourceLine: t,
    });
  }
  if (!items.length && total === undefined) return null;

  const warnings: string[] = ['El total del resumen se registra solo como información: no se convierte en una deuda nueva.'];
  const charges = items.filter((i) => i.kind !== 'pago' && i.kind !== 'bonificacion').reduce((s, i) => s + (i.amount ?? 0), 0);
  const credits = items.filter((i) => i.kind === 'bonificacion').reduce((s, i) => s + (i.amount ?? 0), 0);
  const balancePrev = (previous ?? 0) - items.filter((i) => i.kind === 'pago').reduce((s, i) => s + (i.amount ?? 0), 0);
  if (total !== undefined && Math.abs(balancePrev + charges - credits - total) > 100) warnings.push('La suma de los movimientos no coincide con el total a pagar: revisá que no falte ninguna línea.');
  const field = <T,>(value: T | undefined) => ({ value, confidence: value === undefined ? ('baja' as const) : ('alta' as const) });
  return {
    docType: 'resumen',
    entity: { value: 'Mercado Pago', confidence: 'alta' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: field<Cents>(total),
    minimumPayment: field<Cents>(minimum),
    closingDate: field(closing),
    dueDate: field(due),
    previousBalance: field<Cents>(previous),
    nextClosingDate: field(nextClosing),
    nextDueDate: field(nextDue),
    upcoming: [],
    month: due.slice(0, 7),
    items,
    warnings,
    undetermined: [],
    lineCount: lines.length,
  };
}
