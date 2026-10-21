import { monthOf, parseDateEs } from '../domain/dates';
import { parseAmount, sum, type Cents } from '../domain/money';
import { normalizeText } from '../domain/text';
import { suggestCategory } from './classify';
import type { Cell, Confidence, ItemKind, ParsedDocument, ParsedItem, SourceLine } from './statementParser';

interface Cols {
  debit: number;
  credit?: number;
  balance?: number;
}

const MONEY = /^(-)?\s*\$?\s*(-)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})$/;
const DATE_START = /^(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i;

function header(l: SourceLine): Cols | null {
  if (!l.cells) return null;
  const f = l.cells.find((c) => /^fecha$/i.test(c.s));
  const d = l.cells.find((c) => /^d[eé]bitos?$/i.test(c.s));
  if (!f || !d) return null;
  const c = l.cells.find((x) => /^cr[eé]ditos?$/i.test(x.s));
  const b = l.cells.find((x) => /^saldos?$/i.test(x.s));
  return { debit: d.x, credit: c?.x, balance: b?.x };
}

function nearest(x: number, cols: Cols): 'debit' | 'credit' | 'balance' {
  const opts: Array<['debit' | 'credit' | 'balance', number]> = [['debit', cols.debit]];
  if (cols.credit !== undefined) opts.push(['credit', cols.credit]);
  if (cols.balance !== undefined) opts.push(['balance', cols.balance]);
  return opts.sort((a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x))[0][0];
}

function moneyValue(s: string): { v: Cents; neg: boolean } | null {
  const m = s.replace(/\s+/g, ' ').trim().match(MONEY);
  if (!m) return null;
  const v = parseAmount(m[3], 'coma');
  return v === null ? null : { v, neg: !!(m[1] || m[2]) };
}

function firstTotal(lines: SourceLine[], re: RegExp): Cents | undefined {
  for (const l of lines) {
    if (!re.test(l.text)) continue;
    const m = l.text.match(/\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (m) return parseAmount(m[1], 'coma') ?? undefined;
  }
  return undefined;
}

/**
 * Extracto de cuenta bancaria o billetera (p. ej. Ualá, cajas de ahorro): tabla
 * Fecha · Descripción · Débitos · Créditos · Saldo, con detalle en el renglón siguiente.
 * Se verifica contra los totales de ingresos y egresos informados.
 */
export function parseBankExtract(lines: SourceLine[]): ParsedDocument | null {
  const clean = lines.map((l) => ({ ...l, text: (l.text ?? '').replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
  if (!clean.some((l) => header(l))) return null;
  const full = clean.map((l) => l.text).join('\n');
  const cuitM = full.match(/CUIT[\s\S]{0,120}?\b(\d{2})-?(\d{8})-?(\d)\b/i);
  const holderCuit = cuitM ? `${cuitM[1]}${cuitM[2]}${cuitM[3]}` : undefined;
  const hola = clean.findIndex((l) => /^¡?hola,?$/i.test(l.text));
  const holderName = hola >= 0 ? normalizeText(clean[hola + 1]?.text.replace(/[!¡]/g, '') ?? '') : '';
  const isHolder = (name: string, cuit?: string) => {
    if (cuit && holderCuit && cuit === holderCuit) return true;
    const n = normalizeText(name);
    if (!n || !holderName) return false;
    const words = holderName.split(' ').filter((w) => w.length > 2);
    return words.length >= 2 && words.filter((w) => n.includes(w)).length >= Math.min(2, words.length);
  };

  type Row = { idx: number; date: string; desc: string; amount: Cents; debit: boolean; details: string[]; cuit?: string; line: SourceLine };
  const rows: Row[] = [];
  let cols: Cols | null = null;
  for (let i = 0; i < clean.length; i++) {
    const l = clean[i];
    const h = header(l);
    if (h) {
      cols = h;
      continue;
    }
    if (!cols || !l.cells) continue;
    const dm = l.text.match(DATE_START);
    if (!dm) {
      const last = rows[rows.length - 1];
      if (last && i - last.idx <= 5 && !/^referencia:?$/i.test(l.text) && !/^[0-9a-f-]{20,}$/i.test(l.text)) {
        if (/^\d{11}$/.test(l.text)) last.cuit = l.text;
        else if (l.text.length < 80) last.details.push(l.text);
      }
      continue;
    }
    const d = parseDateEs(dm[1]);
    if (!d) continue;
    let amount: Cents | undefined;
    let debit = false;
    let firstMoneyX = Infinity;
    for (const c of l.cells as Cell[]) {
      const mv = moneyValue(c.s);
      if (!mv) continue;
      firstMoneyX = Math.min(firstMoneyX, c.x);
      const col = nearest(c.x, cols);
      if (col === 'balance') continue;
      amount = mv.v;
      debit = col === 'debit' || mv.neg;
    }
    if (amount === undefined) continue;
    const desc = (l.cells as Cell[])
      .filter((c) => c.x < firstMoneyX && !DATE_START.test(c.s))
      .map((c) => c.s)
      .join(' ')
      .trim();
    rows.push({ idx: i, date: d.iso, desc, amount, debit, details: [], line: l });
  }
  if (rows.length < 3) return null;

  const items: ParsedItem[] = rows.map((r) => {
    const d = normalizeText(r.desc);
    const det = r.details.join(' · ');
    const counterpart = r.details.find((x) => !/^(consumo con tarjeta|ingreso de dinero|egreso de dinero|pago con transferencia|cobro impuesto)/i.test(x)) ?? '';
    const warnings: string[] = [];
    let kind: ItemKind;
    let concept = r.desc;
    let category: { category: string; kind: ParsedItem['suggestedKind'] } | undefined;
    if (/\bintereses?\b/.test(d) && !r.debit) {
      kind = 'credito';
      warnings.push('Intereses que paga la cuenta: no se importan.');
    } else if (isHolder(r.desc) || ((/transferencia/.test(d)) && isHolder(counterpart, r.cuit))) {
      kind = 'transferencia';
      concept = r.debit ? `Transferencia a cuenta propia` : `Transferencia desde cuenta propia`;
      warnings.push('Movimiento entre tus propias cuentas: no es ingreso ni gasto.');
    } else if (/transferencia enviada/.test(d)) {
      kind = 'consumo';
      concept = `Transferencia a ${counterpart || 'terceros'}`;
      category = { category: 'Transferencias', kind: 'personal' };
      warnings.push('Revisá si es un gasto, un pago a tu pareja o un préstamo a alguien.');
    } else if (/transferencia recibida/.test(d)) {
      kind = 'credito';
      concept = `Transferencia de ${counterpart || 'terceros'}`;
      warnings.push('No se importa: si es un ingreso o un reintegro de tu pareja (p. ej. Sancor), cargalo en Ingresos o Gastos compartidos.');
    } else if (/devolucion/.test(d) && !r.debit) {
      kind = 'bonificacion';
    } else if (/ajuste de credito/.test(d) && !r.debit) {
      kind = 'credito';
      warnings.push('Ajuste a favor: no se importa automáticamente.');
    } else if (/percepcion|regimen recaudacion|iibb|cobro de iva|impuesto/.test(d)) {
      kind = 'cargo';
      category = { category: 'Cargos financieros', kind: 'personal' };
    } else if (/compra (de )?dolar/.test(d)) {
      kind = 'transferencia';
      warnings.push('Compra de dólares: es ahorro en otra moneda, no un gasto.');
    } else if (/pago de tarjeta/.test(d)) {
      kind = 'pago';
    } else if (/pago de servicio/.test(d)) {
      kind = 'consumo';
      category = { category: 'Servicios', kind: 'personal' };
    } else if (r.debit) {
      kind = 'consumo';
    } else {
      kind = 'credito';
      warnings.push('Crédito en la cuenta: no se importa automáticamente.');
    }
    const cat = category ?? suggestCategory(r.desc);
    const conf: Confidence = r.line.ocrConfidence !== undefined && r.line.ocrConfidence < 60 ? 'baja' : 'alta';
    return {
      index: r.idx,
      kind,
      date: r.date,
      dateConfidence: 'alta',
      concept,
      amount: r.amount,
      amountConfidence: 'alta',
      currency: 'ARS',
      suggestedCategory: cat.category,
      suggestedKind: cat.kind,
      confidence: conf,
      warnings,
      sourceLine: det ? `${r.line.text} · ${det}` : r.line.text,
      page: r.line.page,
      direction: r.debit ? 'debito' : 'credito',
    };
  });

  // Débitos anulados por una devolución del mismo importe (p. ej. reservas de Uber): ninguno se importa.
  for (const dev of items.filter((i) => i.kind === 'bonificacion')) {
    const charge = items.find((c) => c.kind === 'consumo' && !c.cancelsOut && c.amount === dev.amount && c.index < dev.index && Math.abs(Date.parse(dev.date!) - Date.parse(c.date!)) <= 3 * 86400000);
    if (charge) {
      charge.cancelsOut = true;
      dev.cancelsOut = true;
      charge.warnings.push(`Se anula con una devolución del mismo importe (${dev.date}): no se importa.`);
      dev.warnings.push('Devolución de un débito del mismo importe: se anulan entre sí.');
      dev.suggestedCategory = charge.suggestedCategory;
      dev.suggestedKind = charge.suggestedKind;
    } else {
      dev.warnings.push('Devolución: se registra restando del gasto.');
      const prev = items.filter((c) => c.kind === 'consumo' && c.index < dev.index).at(-1);
      if (prev) {
        dev.suggestedCategory = prev.suggestedCategory;
        dev.suggestedKind = prev.suggestedKind;
      }
    }
  }

  const months = items.map((i) => monthOf(i.date!)).sort();
  const isDebit = (i: ParsedItem) => i.direction === 'debito';
  const entity = /ual[aá]/i.test(full) ? 'Ualá' : /patagonia/i.test(full) ? 'Banco Patagonia' : /mercado ?pago/i.test(full) ? 'Mercado Pago' : /naranja/i.test(full) ? 'Naranja X' : /brubank/i.test(full) ? 'Brubank' : undefined;
  const none = { confidence: 'baja' as Confidence };
  const check = {
    opening: firstTotal(clean, /^saldo inicial/i),
    closing: firstTotal(clean, /^saldo final/i),
    credits: firstTotal(clean, /^(ingreso de dinero|total cr[eé]ditos|cr[eé]ditos)\b/i),
    debits: firstTotal(clean, /^(egreso de dinero|total d[eé]bitos|d[eé]bitos)\b/i),
    parsedCredits: sum(items.filter((i) => !isDebit(i)).map((i) => i.amount)),
    parsedDebits: sum(items.filter(isDebit).map((i) => i.amount)),
  };
  const warnings = ['Extracto de cuenta: cada movimiento va al mes de su fecha. Transferencias propias, intereses y débitos anulados por devoluciones no se importan.'];
  return {
    docType: 'cuenta',
    entity: { value: entity, confidence: entity ? 'alta' : 'baja' },
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
    month: months.at(-1),
    items,
    warnings,
    undetermined: [],
    lineCount: clean.length,
    accountCheck: check,
  };
}
