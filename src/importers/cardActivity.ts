import { addMonths, type MonthKey } from '../domain/dates';
import type { Cents } from '../domain/money';
import { normalizeText } from '../domain/text';
import { detectEntity, suggestCategory } from './classify';
import type { ParsedDocument, ParsedItem, SourceLine } from './statementParser';

/**
 * Pantalla "Tus consumos" de la app de la tarjeta (p. ej. Naranja X), leída con OCR
 * desde capturas o desde una grabación de pantalla:
 *
 *   Octubre hasta ahora            Cierre: 27/OCT
 *   $ 205.509 14
 *   Consumos del 28/SEP al 27/OCT
 *   14/OCT/26
 *   Merpago*mercadolibre           $ 29.654,04
 *   Naranja X de Jorge Aguero           1 pago
 *
 * Son los consumos del resumen que todavía no cerró: se cargan como provisorios y,
 * cuando llega el resumen, se confirman con él (no se cuentan dos veces).
 */

const MON: Record<string, number> = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** El OCR confunde la O con el cero en los meses ("0CT"). */
const fixMon = (s: string) => s.toUpperCase().replace(/0/g, 'O').replace(/1/g, 'I');

const RE_DATE = /^\s*(\d{1,2})\s*\/\s*([A-Z0-9]{3})\s*\/\s*(\d{2})\b/i;
const RE_AMOUNT_END = /^(.*?)\s*\$\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
const RE_HEADER = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+hasta\s+ahora\b.*?cierre:?\s*(\d{1,2})\s*\/\s*([A-Z0-9]{3})/i;
const RE_TOTAL = /^\s*[s$5]\s*(\d{1,3}(?:\.\d{3})+|\d{1,6})\b/i;
const RE_PLAN = /\b(cuota\s*(\d{1,2})\s*\/\s*(\d{1,2})|1\s*pago|plan\s*[z2])\b/i;

function toCents(s: string): Cents {
  return Math.round(Number(s.replace(/\./g, '').replace(',', '.')) * 100);
}

export function parseCardActivity(lines: SourceLine[]): ParsedDocument | null {
  // Cada captura o cuadro del video tiene su propio encabezado ("Octubre hasta ahora · Cierre: 27/OCT").
  const pages = new Map<number, SourceLine[]>();
  for (const l of lines) pages.set(l.page ?? 0, [...(pages.get(l.page ?? 0) ?? []), l]);
  type Frame = { month: number; closeDay: number; closeMon: number; current: boolean; total?: number; lines: SourceLine[] };
  const frames: Frame[] = [];
  for (const ls of pages.values()) {
    const hi = ls.findIndex((l) => RE_HEADER.test(l.text));
    if (hi < 0) continue;
    const m = ls[hi].text.match(RE_HEADER)!;
    const closeMon = MON[fixMon(m[3])];
    if (!closeMon) continue;
    const totalLine = ls.slice(hi + 1, hi + 3).map((l) => l.text.match(RE_TOTAL)).find(Boolean);
    frames.push({
      month: MONTH_NAMES.indexOf(normalizeText(m[1]).replace('setiembre', 'septiembre')) + 1,
      closeDay: Number(m[2]),
      closeMon,
      current: ls.some((l) => /consumos\s+del\s+\d/i.test(l.text)),
      total: totalLine ? Number(totalLine[1].replace(/\./g, '')) : undefined,
      lines: ls.slice(hi + 1),
    });
  }
  if (!frames.length) return null;
  // El período abierto es el que tiene "Consumos del …"; los meses siguientes solo muestran cuotas.
  const cur = frames.find((f) => f.current) ?? frames[0];
  const curFrames = frames.filter((f) => f.month === cur.month);

  const items: ParsedItem[] = [];
  const byKey = new Map<string, { index: number; conf: number; hasPlan: boolean }>();
  let entity = '';
  let year: number | undefined;
  for (const f of curFrames) {
    const ls = f.lines;
    for (let i = 0; i < ls.length; i++) {
      const d = ls[i].text.match(RE_DATE);
      if (!d) continue;
      const mon = MON[fixMon(d[2])];
      const amt = ls[i + 1]?.text.match(RE_AMOUNT_END);
      if (!mon || !amt) continue;
      const day = Number(d[1]);
      const yy = 2000 + Number(d[3]);
      year ??= yy;
      const date = `${yy}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const concept = amt[1].replace(/\*\s+/g, '*').replace(/\s{2,}/g, ' ').trim();
      const amount = toCents(amt[2]);
      const detail = ls[i + 2]?.text ?? '';
      const plan = detail.match(RE_PLAN);
      const holder = detail.replace(RE_PLAN, '').trim().replace(/\s{2,}.*$/, '');
      if (!entity) entity = holder.match(/^(.*?)\s+de\s+/i)?.[1]?.trim() ?? '';
      const inst = plan?.[2] ? { n: Number(plan[2]), total: Number(plan[3]) } : undefined;
      // El mismo consumo aparece en varios cuadros del video (a veces cortado o leído distinto).
      const key = `${date}|${normalizeText(concept).replace(/[^a-z0-9]/g, '')}|${amount}`;
      const conf = ls[i + 1].ocrConfidence ?? 100;
      const prev = byKey.get(key);
      if (prev && (prev.conf >= conf || !plan) && (prev.hasPlan || !plan)) continue;
      const cls = suggestCategory(concept);
      const warnings: string[] = [];
      if (plan && /plan/i.test(plan[0])) warnings.push('Plan Z: figura como un pago en este resumen. Si después lo pasás a cuotas, se corrige al subir el resumen.');
      const item: ParsedItem = {
        index: prev?.index ?? items.length,
        kind: inst && inst.total > 1 ? 'cuota' : 'consumo',
        date,
        dateConfidence: 'alta',
        concept,
        amount,
        amountConfidence: conf >= 60 ? 'alta' : 'baja',
        currency: 'ARS',
        installment: inst,
        installmentConfidence: inst ? 'alta' : undefined,
        suggestedCategory: cls.category,
        suggestedKind: cls.kind,
        confidence: conf >= 60 ? 'alta' : 'baja',
        warnings,
        sourceLine: `${ls[i].text} · ${ls[i + 1].text} · ${detail}`,
        page: ls[i].page,
      };
      if (prev) items[prev.index] = { ...item, index: prev.index };
      else items.push(item);
      byKey.set(key, { index: prev?.index ?? items.length - 1, conf: Math.max(conf, prev?.conf ?? 0), hasPlan: !!plan || !!prev?.hasPlan });
    }
  }
  if (!items.length) return null;
  entity = detectEntity(`${entity} ${lines.map((l) => l.text).join(' ')}`).entity ?? entity;
  year ??= new Date().getFullYear();
  // Fecha de cierre y mes del resumen (se paga el mes siguiente al cierre).
  const lastItemMonth = Math.max(...items.map((it) => Number(it.date!.slice(5, 7))));
  const closeYear = cur.closeMon < lastItemMonth - 6 ? year + 1 : year;
  const closingDate = `${closeYear}-${String(cur.closeMon).padStart(2, '0')}-${String(cur.closeDay).padStart(2, '0')}`;
  const month: MonthKey = addMonths(closingDate.slice(0, 7), 1);
  const parsed = items.reduce((a, it) => a + (it.amount ?? 0), 0);
  const total = curFrames.map((f) => f.total).find((t) => t !== undefined);
  const label = `${MONTH_NAMES[cur.month - 1].replace(/^./, (c) => c.toUpperCase())} hasta ahora`;
  const warnings: string[] = ['Consumos del resumen que todavía no cerró: se cargan como provisorios. Cuando subas el resumen, se confirman con él sin contarse dos veces.'];
  if (total !== undefined && Math.floor(parsed / 100) !== total)
    warnings.push(`La suma de los consumos leídos no coincide con "${label}" ($ ${total.toLocaleString('es-AR')}): puede faltar algún consumo (en el video, abrí "Ver más" para que se vean todos).`);
  return {
    docType: 'consumos',
    entity: { value: entity || undefined, confidence: entity ? 'media' : 'baja' },
    currency: 'ARS',
    decimalFormat: 'coma',
    total: { confidence: 'baja' },
    minimumPayment: { confidence: 'baja' },
    closingDate: { value: closingDate, confidence: 'media' },
    dueDate: { confidence: 'baja' },
    previousBalance: { confidence: 'baja' },
    nextClosingDate: { confidence: 'baja' },
    nextDueDate: { confidence: 'baja' },
    upcoming: [],
    month,
    items,
    warnings,
    undetermined: [],
    lineCount: lines.length,
    activityCheck: total !== undefined ? { declaredWhole: total, parsed, label } : undefined,
  };
}
