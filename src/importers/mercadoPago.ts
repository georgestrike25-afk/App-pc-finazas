import { parseAmount, type Cents } from '../domain/money';
import type { SourceLine } from './statementParser';
import { todayIso } from '../domain/dates';

/**
 * Pantallas de la app de Mercado Pago (capturas o video):
 * - Créditos → "Detalle del pago": cada crédito con "Solicitado el …" y "Cuota N de T" (la próxima a pagar),
 *   y la ficha de cada uno ("Solicitaste $ … el …", "Pagaste $ … de $ …", "Falta pagar $ …").
 * - Tarjeta de crédito → "Tu total hasta hoy es $ …" de cada mes, con su cierre y vencimiento.
 */

export interface MpCredit {
  /** Fecha en que se pidió ('YYYY-MM-DD'): identifica el crédito. */
  requestedOn: string;
  name: string;
  /** Próxima cuota a pagar (las anteriores ya están pagadas). */
  nextN: number;
  totalN: number;
  installment: Cents;
  /** Vencimiento de la próxima cuota ('YYYY-MM-DD'). */
  due?: string;
  requested?: Cents;
  paidAmount?: Cents;
  totalAmount?: Cents;
  remaining?: Cents;
}

export interface MpCardMonth {
  /** Mes del vencimiento. */
  month: string;
  due: string;
  closing?: string;
  total: Cents;
  /** El video no deja leer los centavos (van chiquitos): el total está redondeado. */
  noCents: boolean;
}

export interface MpScreens {
  credits: MpCredit[];
  card: MpCardMonth[];
  warnings: string[];
}

const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const monthNum = (w: string) => MONTHS[w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)];
const AMT = /\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;
const amt = (s: string | undefined) => (s ? parseAmount(s, 'coma') ?? undefined : undefined);

/** Fecha sin año: la más cercana a hoy hacia atrás (pedido) o hacia adelante (vencimiento). */
function dateOf(day: number, month: number, today: string, dir: 'past' | 'future' | 'near'): string | undefined {
  if (!day || !month || day > 31) return undefined;
  const y0 = Number(today.slice(0, 4));
  const iso = (y: number) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (dir === 'past') return iso(iso(y0) <= today ? y0 : y0 - 1);
  if (dir === 'future') return iso(iso(y0) >= today.slice(0, 8) + '01' ? y0 : y0 + 1);
  const diff = (y: number) => Math.abs(Date.parse(iso(y)) - Date.parse(today));
  return iso([y0 - 1, y0, y0 + 1].sort((a, b) => diff(a) - diff(b))[0]);
}

/** Saca íconos que el OCR lee como letras sueltas al principio ("<", "a", "ES"…). */
function cleanName(s: string): string {
  const parts = s.split(/\s{2,}/).map((p) => p.trim()).filter((p) => (p.match(/\p{L}/gu) ?? []).length >= 3);
  return (parts.pop() ?? s).replace(/\.{2,}|…/g, '').replace(/[^\p{L}\d]+$/u, '').trim();
}

export function detectMercadoPago(lines: SourceLine[], today = todayIso()): MpScreens | null {
  const pages = new Map<number, string[]>();
  for (const l of lines) pages.set(l.page ?? 1, [...(pages.get(l.page ?? 1) ?? []), (l.text ?? '').replace(/[ \t]+/g, (m) => (m.length > 1 ? '  ' : ' ')).trim()]);
  const all = lines.map((l) => l.text ?? '').join('\n');
  const isDetail = /detalle del pago/i.test(all) && /solicitado el/i.test(all) && /cuota\s+\d+\s+de\s+\d+/i.test(all);
  const isCard = /tu total hasta hoy es/i.test(all) && /vence el\s+\d{1,2}\s*\/\s*[a-z]{3}/i.test(all);
  if (!isDetail && !isCard) return null;

  const credits = new Map<string, MpCredit>();
  const fichas = new Map<string, { name?: string; requested?: Cents; paidAmount?: Cents; totalAmount?: Cents; remaining?: Cents }>();
  const card = new Map<string, MpCardMonth>();
  const warnings: string[] = [];

  for (const texts of pages.values()) {
    const page = texts.join('\n');
    // Detalle del pago: pares de líneas "Nombre  $ importe" / "Solicitado el d de mes   Cuota N de T".
    if (/detalle del pago/i.test(page)) {
      const due = page.match(/vence el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
      const dueIso = due ? dateOf(Number(due[1]), monthNum(due[2]), today, 'future') : undefined;
      for (let i = 0; i < texts.length; i++) {
        const s = texts[i].match(/solicitado el\s+(\d{1,2})\s+de\s+([a-záéíóú]+).*?cuota\s+(\d+)\s+de\s+(\d+)/i);
        if (!s) continue;
        const on = dateOf(Number(s[1]), monthNum(s[2]), today, 'past');
        if (!on) continue;
        const prev = texts[i - 1] ?? '';
        const name = cleanName(prev.split('$')[0]);
        const inst = amt(prev.match(AMT)?.[1]);
        const cur = credits.get(on);
        credits.set(on, {
          requestedOn: on,
          name: cur?.name && cur.name.length >= name.length ? cur.name : name,
          nextN: Number(s[3]),
          totalN: Number(s[4]),
          installment: inst ?? cur?.installment ?? 0,
          due: dueIso ?? cur?.due,
        });
      }
    }
    // Ficha de un crédito.
    const sol = page.match(/solicitaste\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
    if (sol) {
      const on = dateOf(Number(sol[2]), monthNum(sol[3]), today, 'past');
      if (on) {
        const idx = texts.findIndex((t) => /solicitaste/i.test(t));
        const title = texts.slice(0, idx).filter((t) => (t.match(/\p{L}/gu) ?? []).length >= 4 && !/^\d{1,2}:\d{2}/.test(t)).slice(-3);
        const pd = page.match(/pagaste[\s\S]{0,40}?\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*\S{0,3}\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
        const f = fichas.get(on) ?? {};
        fichas.set(on, {
          name: f.name ?? (title.length ? cleanName(title[0]) : undefined),
          requested: amt(sol[1]) ?? f.requested,
          paidAmount: amt(pd?.[1]) ?? f.paidAmount,
          totalAmount: amt(pd?.[2]) ?? f.totalAmount,
          remaining: amt(page.match(/falta pagar\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i)?.[1]) ?? f.remaining,
        });
      }
    }
    // Tarjeta: "Noviembre / Cierra hoy • Vence el 10/nov / Tu total hasta hoy es $ 150.000,54".
    if (/tu total hasta hoy es/i.test(page)) {
      const cv = page.match(/cierra\s+(hoy|el\s+(\d{1,2})\s*\/\s*([a-z]{3}))[\s\S]{0,12}?vence el\s+(\d{1,2})\s*\/\s*([a-z]{3})/i);
      const i = texts.findIndex((t) => /tu total hasta hoy es/i.test(t));
      const tl = `${texts[i]} ${texts[i + 1] ?? ''}`.split(/hasta hoy es/i)[1] ?? '';
      const tm = tl.match(/\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/);
      if (cv && tm) {
        const due = dateOf(Number(cv[4]), monthNum(cv[5]), today, 'near');
        const closing = /hoy/i.test(cv[1]) ? today : dateOf(Number(cv[2]), monthNum(cv[3]), today, 'near');
        if (due) {
          const total = Number(tm[1].replace(/\./g, '')) * 100 + (tm[2] ? Number(tm[2]) : 0);
          const prev = card.get(due.slice(0, 7));
          if (!prev || (prev.noCents && tm[2])) card.set(due.slice(0, 7), { month: due.slice(0, 7), due, closing, total, noCents: !tm[2] });
        }
      }
    }
  }

  const out: MpCredit[] = [];
  for (const c of credits.values()) {
    const f = fichas.get(c.requestedOn) ?? {};
    const left = c.totalN - c.nextN + 1;
    const installment = c.installment || (f.remaining && left > 0 ? Math.round(f.remaining / left) : 0);
    const name = f.name && f.name.length > c.name.length ? f.name : c.name;
    out.push({ ...c, name: name || 'Crédito', installment, requested: f.requested, paidAmount: f.paidAmount, totalAmount: f.totalAmount, remaining: f.remaining ?? (installment ? installment * left : undefined) });
    if (!installment) warnings.push(`${name}: no se pudo leer el importe de la cuota. Revisalo.`);
    else if (f.paidAmount !== undefined && Math.abs(f.paidAmount - installment * (c.nextN - 1)) > installment * 0.05)
      warnings.push(`${name}: lo pagado (${(f.paidAmount / 100).toLocaleString('es-AR')}) no coincide con ${c.nextN - 1} cuota(s) de ${(installment / 100).toLocaleString('es-AR')}. Revisalo.`);
  }
  out.sort((a, b) => a.requestedOn.localeCompare(b.requestedOn));
  const months = [...card.values()].sort((a, b) => a.month.localeCompare(b.month));
  if (months.some((m) => m.noCents)) warnings.push('Los centavos del total de la tarjeta no se leen en el video: se toma el total sin centavos. Cuando tengas el resumen, subilo y queda exacto.');
  if (!out.length && !months.length) return null;
  return { credits: out, card: months, warnings };
}
