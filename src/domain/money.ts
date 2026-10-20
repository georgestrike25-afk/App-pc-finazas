/**
 * Todos los importes se manejan como enteros en centavos para evitar errores
 * de redondeo de punto flotante. 1 peso = 100 centavos.
 */
export type Cents = number;

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtPlain = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatARS(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—';
  return fmt.format(cents / 100);
}

/** Formato sin símbolo, apto para campos de edición: 1.234,56 */
export function formatPlain(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  return fmtPlain.format(cents / 100);
}

export function toCents(pesos: number): Cents {
  return Math.round(pesos * 100);
}

export function assertCents(v: unknown): v is Cents {
  return typeof v === 'number' && Number.isInteger(v) && Number.isFinite(v);
}

/** Calcula un porcentaje de un importe redondeando al centavo (half-up). */
export function percentOf(cents: Cents, pct: number): Cents {
  return Math.round((cents * pct) / 100);
}

/**
 * Divide un importe en dos partes según un porcentaje, garantizando que la
 * suma de las partes sea exactamente el total (el centavo de redondeo va a la
 * segunda parte).
 */
export function splitAmount(total: Cents, firstPct: number): [Cents, Cents] {
  const first = percentOf(total, firstPct);
  return [first, total - first];
}

export function sum(values: Array<Cents | null | undefined>): Cents {
  let s = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) s += v;
  return s;
}

export type DecimalFormat = 'coma' | 'punto';

/**
 * Detecta si un texto usa coma decimal (formato argentino: 1.234,56) o punto
 * decimal (1,234.56). Devuelve 'coma' por defecto si no hay evidencia.
 */
export function detectDecimalFormat(text: string): DecimalFormat {
  const coma =
    (text.match(/\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)/g)?.length ?? 0) * 3 +
    (text.match(/(?<![\d.,])\d+,\d{2}(?![\d,.])/g)?.length ?? 0);
  const punto =
    (text.match(/\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)/g)?.length ?? 0) * 3 +
    (text.match(/(?<![\d.,])\d+\.\d{2}(?![\d,.])/g)?.length ?? 0);
  return punto > coma ? 'punto' : 'coma';
}

/**
 * Interpreta un importe escrito por una persona o extraído de un documento.
 * Acepta: "1.234,56", "1,234.56", "$ 12.345", "-1.234,56", "1.234,56-",
 * "(1.234,56)", "1234.5". Devuelve null si no es un importe válido.
 */
export function parseAmount(raw: string, format: DecimalFormat = 'coma'): Cents | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/ /g, ' ');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(ARS|AR\$|\$|U\$S|US\$|USD)\s*/i, '').trim();
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(/^\$\s*/, '').replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart: string;
  let decPart = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? '.' : ',';
    const thouSep = decSep === '.' ? ',' : '.';
    const [i, d = ''] = s.split(decSep);
    if (s.split(decSep).length > 2) return null;
    if (!validGrouping(i, thouSep)) return null;
    intPart = i.split(thouSep).join('');
    decPart = d;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const isDecimalSep = sep === (format === 'coma' ? ',' : '.');
    if (parts.length === 2 && (isDecimalSep || parts[1].length !== 3)) {
      if (parts[1].length > 2 && !isDecimalSep) return null;
      intPart = parts[0];
      decPart = parts[1];
    } else if (validGrouping(s, sep)) {
      intPart = parts.join('');
    } else {
      return null;
    }
  } else {
    intPart = s;
  }
  if (decPart.length > 2) {
    // Más de dos decimales: se redondea al centavo.
    const v = Number(`${intPart || '0'}.${decPart}`);
    if (!Number.isFinite(v)) return null;
    return (negative ? -1 : 1) * Math.round(v * 100);
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  const cents = Number(intPart || '0') * 100 + Number((decPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function validGrouping(s: string, sep: string): boolean {
  if (!s.includes(sep)) return /^\d+$/.test(s);
  const groups = s.split(sep);
  if (!/^\d{1,3}$/.test(groups[0])) return false;
  return groups.slice(1).every((g) => /^\d{3}$/.test(g));
}

/** Para formularios: acepta texto con coma o punto decimal. */
export function parseUserAmount(raw: string): Cents | null {
  return parseAmount(raw, 'coma');
}
