import { parseAmount, sum, type Cents } from '../domain/money';
import type { MonthKey } from '../domain/dates';
import type { SourceLine } from './statementParser';

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export interface PlanMonth {
  month: MonthKey;
  /** Importe por concepto (p. ej. Tarjeta, Préstamos). */
  parts: Record<string, Cents>;
  total: Cents;
}

export interface PaymentPlan {
  entity?: string;
  categories: string[];
  months: PlanMonth[];
  declaredTotal?: Cents;
  computedTotal: Cents;
  warnings: string[];
}

/**
 * Reconoce un "plan de pagos" mensual (p. ej. Mercado Pago "Plan de pagos estimado"):
 * bloques "NOVIEMBRE 2026 Tarjeta: $… Préstamos: $… Total del mes: $…".
 */
export function detectPaymentPlan(lines: SourceLine[]): PaymentPlan | null {
  const text = lines.map((l) => l.text ?? '').join(' ').replace(/\s+/g, ' ');
  if (!/plan de pagos|total del mes/i.test(text)) return null;
  const re = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\s+(\\d{4})\\b(.*?)total del mes:?\\s*\\$\\s*([\\d.]+,\\d{2})`, 'gi');
  const months: PlanMonth[] = [];
  const categories: string[] = [];
  for (const m of text.matchAll(re)) {
    const month = `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}`;
    const parts: Record<string, Cents> = {};
    for (const p of m[3].matchAll(/([A-Za-zÁÉÍÓÚáéíóúñÑ][A-Za-zÁÉÍÓÚáéíóúñÑ ]{1,30}?):\s*\$\s*([\d.]+,\d{2})/g)) {
      const name = p[1].trim().replace(/^moneda.*$/i, '');
      const v = parseAmount(p[2], 'coma');
      if (!name || v === null) continue;
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      parts[label] = v;
      if (!categories.includes(label)) categories.push(label);
    }
    const total = parseAmount(m[4], 'coma') ?? sum(Object.values(parts));
    months.push({ month, parts, total });
  }
  if (months.length < 1) return null;
  const warnings: string[] = [];
  for (const pm of months) {
    const s = sum(Object.values(pm.parts));
    if (Object.keys(pm.parts).length && Math.abs(s - pm.total) > 1) warnings.push(`En ${pm.month} la suma de los conceptos no coincide con el total del mes.`);
  }
  const dt = text.match(/total del plan:?\s*\$\s*([\d.]+,\d{2})/i);
  const declaredTotal = dt ? parseAmount(dt[1], 'coma') ?? undefined : undefined;
  const computedTotal = sum(months.map((x) => x.total));
  if (declaredTotal !== undefined && Math.abs(declaredTotal - computedTotal) > 1) warnings.push('La suma de los meses no coincide con el total del plan informado.');
  const entity = /mercado ?pago/i.test(text) ? 'Mercado Pago' : /naranja/i.test(text) ? 'Naranja X' : /ual[aá]/i.test(text) ? 'Ualá' : /patagonia/i.test(text) ? 'Banco Patagonia' : undefined;
  if (/estimad|proyecci/i.test(text)) warnings.push('Es una proyección del emisor: no incluye nuevos consumos ni créditos.');
  return { entity, categories: categories.length ? categories : ['Total'], months: months.sort((a, b) => a.month.localeCompare(b.month)), declaredTotal, computedTotal, warnings };
}
