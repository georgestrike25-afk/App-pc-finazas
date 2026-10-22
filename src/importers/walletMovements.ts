import type { Cents } from '../domain/money';
import { normalizeText } from '../domain/text';
import { detectEntity, suggestCategory } from './classify';
import type { Confidence, ItemKind, ParsedDocument, ParsedItem, SourceLine } from './statementParser';

/**
 * Lista "Mis movimientos" de una billetera (p. ej. Ualá), leída con OCR desde capturas
 * o una grabación de pantalla. Cada movimiento ocupa dos renglones:
 *
 *   Dlo*uber Rides                 $4.182,00
 *   Compra                             22/10
 *   Antonella Valvass...        +$146.110,00
 *   Transferencia recibida             21/10
 */

const RE_AMOUNT = /^(.*?)\s*([+-])?\s*\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
const RE_TYPE = /^(.*?)\s+(\d{1,2})\/(\d{1,2})\s*$/;
const TYPES: Array<[RegExp, string]> = [
  [/^compra$/, 'compra'],
  [/^pago con caja de ahorro$/, 'pago'],
  [/^debito de dinero$/, 'debito'],
  [/^transferencia enviada$/, 'enviada'],
  [/^transferencia recibida$/, 'recibida'],
  [/^devolucion en cuenta$/, 'devolucion'],
  [/^operacion exitosa$/, 'operacion'],
  [/^pago de servicios?$/, 'servicio'],
  [/^pago de tarjeta$/, 'tarjeta'],
];

interface Row {
  concept: string;
  amount: Cents;
  credit: boolean;
  type: string;
  day: number;
  month: number;
  conf: number;
  source: string;
  page?: number;
}

export interface WalletContext {
  /** Nombre de la pareja (sus transferencias suelen ser gastos compartidos ya cargados). */
  partnerName?: string;
  /** Nombres del usuario (transferencias entre sus propias cuentas). */
  ownNames?: string[];
  fileName?: string;
  today?: string;
}

function rowsOf(lines: SourceLine[]): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].text.replace(/\s+/g, ' ').trim().match(RE_AMOUNT);
    if (!a) continue;
    const t = lines[i + 1].text.replace(/\s+/g, ' ').trim().match(RE_TYPE);
    if (!t) continue;
    // Íconos que el OCR lee como letras sueltas al principio: "(a) Barrica", "(E) Dlo*uber".
    let concept = a[1].trim();
    for (let k = 0; k < 3; k++)
      concept = concept
        .replace(/^(?:\(\s*\w{0,3}\s*\)|[^\p{L}\d*]+|\b[A-Za-z]{1,2}\)\s*|[A-Z]\s+(?=\p{Lu}))\s*/u, '')
        .replace(/\s*[—–-]+\s*$/, '')
        .trim();
    const typeN = normalizeText(t[1]).replace(/[^a-z ]/g, '').trim();
    const type = TYPES.find(([re]) => re.test(typeN))?.[1];
    if (!type || !concept) continue;
    const day = Number(t[2]);
    const month = Number(t[3]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    out.push({
      concept,
      amount: Math.round(Number(a[3].replace(/\./g, '').replace(',', '.')) * 100),
      credit: a[2] === '+',
      type,
      day,
      month,
      conf: Math.min(lines[i].ocrConfidence ?? 100, lines[i + 1].ocrConfidence ?? 100),
      source: `${lines[i].text} · ${lines[i + 1].text}`,
      page: lines[i].page,
    });
    i++;
  }
  return out;
}

/** Clave para reconocer el mismo movimiento en dos cuadros (el nombre puede leerse distinto). */
const keyOf = (r: Row) => `${r.day}/${r.month}|${r.type}|${r.credit ? '+' : '-'}${r.amount}`;

/**
 * Une las filas de cada cuadro en orden: donde un cuadro repite el final del anterior (la parte
 * que quedó en pantalla al desplazar), esas filas se cuentan una sola vez. Así dos compras
 * iguales del mismo día (dos viajes de Uber del mismo precio) se mantienen.
 */
export function mergeFrames(frames: Row[][]): Row[] {
  const acc: Row[] = [];
  for (const f of frames) {
    if (!f.length) continue;
    let best = 0;
    for (let k = Math.min(acc.length, f.length); k > 0; k--) {
      let ok = true;
      for (let j = 0; j < k; j++) if (keyOf(acc[acc.length - k + j]) !== keyOf(f[j])) {
        ok = false;
        break;
      }
      if (ok) {
        best = k;
        break;
      }
    }
    // Sin solapamiento exacto (p. ej. el primer renglón cortado): se busca el primer renglón del cuadro entre los últimos.
    if (!best && acc.length) {
      const tail = acc.slice(-12).map(keyOf);
      const pos = f.findIndex((r) => tail.includes(keyOf(r)));
      if (pos >= 0) {
        const lastKey = keyOf(acc[acc.length - 1]);
        const end = f.findIndex((r, j) => j >= pos && keyOf(r) === lastKey);
        if (end >= 0) best = end + 1;
      }
    }
    // Sin solapamiento: si el cuadro solo repite movimientos ya leídos (p. ej. al volver al inicio
    // de la cuenta al final del video), no se agregan de nuevo.
    if (!best && acc.length) {
      const count = (rows: Row[], k: string) => rows.filter((x) => keyOf(x) === k).length;
      const fresh = f.filter((r, j) => count(f.slice(0, j + 1), keyOf(r)) > count(acc, keyOf(r)));
      if (fresh.length < f.length) {
        acc.push(...fresh);
        continue;
      }
    }
    for (const r of f.slice(best)) {
      const prev = acc.find((x) => keyOf(x) === keyOf(r));
      // Conserva el nombre mejor leído (sin "...").
      if (prev && prev.concept.endsWith('...') && !r.concept.endsWith('...')) prev.concept = r.concept;
      acc.push(r);
    }
    for (const r of f.slice(0, best)) {
      const prev = acc.find((x) => keyOf(x) === keyOf(r) && x.conf < r.conf);
      if (prev) Object.assign(prev, { concept: r.concept.length >= prev.concept.length ? r.concept : prev.concept, conf: r.conf });
    }
  }
  return acc;
}

const words = (s: string) => normalizeText(s).replace(/\.\.\.|…/g, '').split(/[\s,]+/).filter((w) => w.length >= 3);

export function parseWalletMovements(lines: SourceLine[], ctx: WalletContext = {}): ParsedDocument | null {
  const text = lines.map((l) => l.text).join('\n');
  if (!/mis movimientos|movimientos/i.test(text)) return null;
  const pages = new Map<number, SourceLine[]>();
  for (const l of lines) pages.set(l.page ?? 0, [...(pages.get(l.page ?? 0) ?? []), l]);
  const frames = [...pages.entries()].sort((a, b) => a[0] - b[0]).map(([, ls]) => rowsOf(ls));
  const rows = mergeFrames(frames);
  if (rows.length < 3) return null;

  const today = ctx.today ?? new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const iso = (r: Row) => {
    let y = year;
    const d = `${y}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
    if (d > today) y--;
    return `${y}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
  };
  // Tu nombre: el del saludo ("Hola, Jorge") y los configurados; una transferencia a/desde alguien
  // con tu nombre que además aparece en ambos sentidos es entre tus cuentas.
  const greet = text.match(/hola,?\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i)?.[1];
  const own = (ctx.ownNames ?? []).flatMap(words);
  const partner = words(ctx.partnerName ?? '').filter((w) => w !== 'pareja');
  const both = new Set(rows.filter((r) => r.type === 'recibida').map((r) => words(r.concept).slice(0, 2).join(' ')).filter((k) => rows.some((x) => x.type === 'enviada' && words(x.concept).slice(0, 2).join(' ') === k)));
  const isOwn = (name: string) => {
    const w = words(name);
    if (own.length && own.filter((o) => w.includes(o)).length >= Math.min(2, own.length)) return true;
    return !!greet && w.includes(normalizeText(greet)) && both.has(w.slice(0, 2).join(' '));
  };
  const isPartner = (name: string) => partner.length > 0 && words(name).some((w) => partner.some((p) => w.startsWith(p.slice(0, 5)) || p.startsWith(w)));

  const items: ParsedItem[] = rows.map((r, index) => {
    const warnings: string[] = [];
    const c = normalizeText(r.concept);
    let kind: ItemKind;
    let concept = r.concept;
    let cat: { category: string; kind: ParsedItem['suggestedKind'] } | undefined;
    if (r.type === 'operacion' && /rendimiento/.test(c)) {
      kind = 'credito';
      warnings.push('Rendimientos de la cuenta: no se importan.');
    } else if (r.type === 'operacion' && /dolar/.test(c)) {
      kind = 'transferencia';
      warnings.push(r.credit ? 'Venta de dólares: es tu ahorro, no un ingreso.' : 'Compra de dólares: es ahorro en otra moneda, no un gasto.');
    } else if ((r.type === 'enviada' || r.type === 'recibida') && isOwn(r.concept)) {
      kind = 'transferencia';
      concept = r.type === 'enviada' ? 'Transferencia a cuenta propia' : 'Transferencia desde cuenta propia';
      warnings.push('Movimiento entre tus propias cuentas: no es ingreso ni gasto.');
    } else if (r.type === 'enviada' && isPartner(r.concept)) {
      kind = 'transferencia';
      concept = `Transferencia a ${r.concept}`;
      warnings.push('Transferencia a tu pareja: suele ser tu parte de los gastos compartidos (ya cargados con la planilla). Marcala solo si es otro gasto.');
    } else if (r.type === 'enviada') {
      kind = 'consumo';
      concept = `Transferencia a ${r.concept}`;
      cat = { category: 'Transferencias', kind: 'personal' };
      warnings.push('Revisá si es un gasto o un préstamo a alguien.');
    } else if (r.type === 'recibida') {
      kind = 'credito';
      concept = `Transferencia de ${r.concept}`;
      warnings.push('No se importa: si es un ingreso o un reintegro de tu pareja, cargalo en Ingresos o en Gastos compartidos.');
    } else if (r.type === 'devolucion') {
      kind = 'bonificacion';
    } else if (r.type === 'tarjeta') {
      kind = 'pago';
    } else if (r.credit) {
      kind = 'credito';
      warnings.push('Crédito en la cuenta: no se importa automáticamente.');
    } else {
      kind = 'consumo';
      if (r.type === 'debito') cat = { category: 'Otros', kind: 'personal' };
    }
    const sug = cat ?? suggestCategory(r.concept);
    const conf: Confidence = r.conf < 60 ? 'baja' : 'alta';
    return {
      index,
      kind,
      date: iso(r),
      dateConfidence: 'alta',
      concept,
      amount: r.amount,
      amountConfidence: conf,
      currency: 'ARS',
      suggestedCategory: sug.category,
      suggestedKind: sug.kind,
      confidence: conf,
      warnings,
      sourceLine: r.source,
      page: r.page,
      direction: r.credit ? 'credito' : 'debito',
    };
  });

  // Devoluciones del mismo importe que una compra cercana (p. ej. viajes de Uber reservados y devueltos): se anulan.
  for (const dev of items.filter((i) => i.kind === 'bonificacion')) {
    const charge = items.find((x) => x.kind === 'consumo' && !x.cancelsOut && x.amount === dev.amount && Math.abs(Date.parse(dev.date!) - Date.parse(x.date!)) <= 3 * 86400000);
    if (charge) {
      charge.cancelsOut = true;
      dev.cancelsOut = true;
      charge.warnings.push('Se anula con una devolución del mismo importe: no se importa.');
      dev.warnings.push('Devolución de una compra del mismo importe: se anulan entre sí.');
    } else dev.warnings.push('Devolución: se registra restando del gasto.');
    dev.suggestedCategory = charge?.suggestedCategory ?? dev.suggestedCategory;
    dev.suggestedKind = charge?.suggestedKind ?? dev.suggestedKind;
  }

  const months = items.map((i) => i.date!.slice(0, 7)).sort();
  const entity = detectEntity(`${text} ${ctx.fileName ?? ''}`).entity ?? (/ual/i.test(ctx.fileName ?? '') ? 'Ualá' : 'Billetera');
  return {
    docType: 'cuenta',
    entity: { value: entity, confidence: 'media' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: { confidence: 'baja' },
    minimumPayment: { confidence: 'baja' },
    closingDate: { confidence: 'baja' },
    dueDate: { confidence: 'baja' },
    previousBalance: { confidence: 'baja' },
    nextClosingDate: { confidence: 'baja' },
    nextDueDate: { confidence: 'baja' },
    upcoming: [],
    month: months.at(-1),
    items,
    warnings: [`Movimientos de ${entity} leídos de la pantalla (${rows.length}). Lo que ya está cargado (por notificaciones, a mano o por extractos) queda vinculado y no se duplica.`],
    undetermined: [],
    lineCount: lines.length,
  };
}
