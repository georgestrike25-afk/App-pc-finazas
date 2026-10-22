/**
 * Interpreta notificaciones de apps financieras (Ualá, Mercado Pago, Naranja X,
 * Banco Patagonia, BNA+ y Google Pay). Traído de la app "Mis Finanzas": los textos
 * de cada app cambian con el tiempo, así que se usan frases típicas en vez de formatos exactos.
 */
import type { Cents } from '../domain/money';

export const CUENTAS = {
  UALA: 'Ualá',
  MERCADO_PAGO: 'Mercado Pago',
  NARANJA_X: 'Naranja X',
  PATAGONIA: 'Banco Patagonia',
  BNA: 'BNA+',
  GOOGLE_PAY: 'Google Pay',
  OTRA: 'Otra',
} as const;

export type Tipo = 'INGRESO' | 'GASTO' | 'TRANSFERENCIA_PROPIA';
export type Sentido = 'ENVIADA' | 'RECIBIDA';
export type MotivoIgnorada = 'SIN_MONTO' | 'MONEDA_EXTRANJERA' | 'PROMOCION' | 'OPERACION_FALLIDA' | 'NO_RECONOCIDA';

export interface InfoCuotas {
  total: number;
  numero?: number;
  montoCuota?: Cents;
}

export interface Detectado {
  fecha: number;
  monto: Cents;
  tipo: Tipo;
  descripcion: string;
  cuenta: string;
  contraparte?: string;
  transferencia?: Sentido;
  textoOriginal: string;
  cuotas?: InfoCuotas;
}

export type Resultado = { movimiento: Detectado } | { ignorada: MotivoIgnorada };

/** Minúsculas, sin tildes y con espacios simples. */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Cuenta asociada a un paquete de Android, o null si no es una app financiera conocida. */
export function cuentaDePaquete(paquete: string): string | null {
  const p = paquete.toLowerCase();
  if (p.includes('uala') || p.includes('bancar')) return CUENTAS.UALA;
  if (p.includes('mercadopago')) return CUENTAS.MERCADO_PAGO;
  if (p.includes('naranja')) return CUENTAS.NARANJA_X;
  if (p.includes('patagonia')) return CUENTAS.PATAGONIA;
  if (/(^|\.)bna/.test(p)) return CUENTAS.BNA;
  if (p.includes('walletnfcrel') || p === 'com.google.android.apps.wallet') return CUENTAS.GOOGLE_PAY;
  return null;
}

/** Importe en texto ("1.234,56", "$ 12.500", "1234.56") a centavos. */
export function textoACentavos(original: string): Cents | null {
  let t = original.trim().replace(/[\s ]/g, '').replace(/ARS/gi, '').replace(/\$/g, '');
  if (!t) return null;
  let neg = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.endsWith('-')) {
    neg = true;
    t = t.slice(0, -1);
  }
  if (t.startsWith('-')) {
    neg = !neg;
    t = t.slice(1);
  } else if (t.startsWith('+')) t = t.slice(1);
  if (!t || !/^[\d.,]+$/.test(t)) return null;
  const lp = t.lastIndexOf('.');
  const lc = t.lastIndexOf(',');
  let dec: string | null = null;
  if (lp >= 0 && lc >= 0) dec = lc > lp ? ',' : '.';
  else if (lc >= 0) dec = t.length - lc - 1 <= 2 && t.indexOf(',') === lc ? ',' : null;
  else if (lp >= 0) dec = t.length - lp - 1 <= 2 && t.indexOf('.') === lp ? '.' : null;
  let int = t;
  let frac = '';
  if (dec) {
    const i = t.lastIndexOf(dec);
    int = t.slice(0, i);
    frac = t.slice(i + 1);
  }
  int = int.replace(/[.,]/g, '');
  if (!/^\d*$/.test(int) || !/^\d{0,2}$/.test(frac) || (!int && !frac)) return null;
  const c = Number(int || '0') * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -c : c;
}

const monedaExtranjera = /(US\$|U\$S|USD|EUR|€)\s*\d/i;
const montoDolares = /(?:US\$|U\$S|USD)\s*(\d[\d.]*(?:,\d{1,2})?|\d+\.\d{1,2})/i;
const montoRe = /(?:AR\$|\$|ARS)\s*(-?\d[\d.]*(?:,\d{1,2})?)/i;

const fallidas = ['rechaz', 'no pudimos', 'no se pudo', 'fallo', 'cancelad', 'revertid', 'te pidio', 'solicitud de pago', 'programaste', 'vence', 'vencimiento', 'resumen esta disponible', 'resumen disponible', 'ya podes ver tu resumen'];
const promociones = ['aprovecha', 'descuento', 'promo', 'beneficio', 'cuotas sin interes', 'hasta $', 'sorteo', 'oferta', 'te regalamos', 'cupon', 'prestamo preaprobado', 'pedi tu prestamo', 'tenes un prestamo', 'disponible para', 'limite', 'invertir', 'inverti ', 'pedi tu', 'ganas', 'gana '];
/** Frases de movimientos entre cuentas propias (no son ingreso ni gasto). */
export const propias = [
  'ingresaste dinero', 'ingresaste $', 'cargaste', 'carga de saldo', 'carga de dinero', 'entre tus cuentas', 'a tu otra cuenta', 'moviste dinero',
  // Pagar la tarjeta no es un gasto nuevo: las compras ya se registraron una por una
  'pagaste tu tarjeta', 'pago de tu tarjeta', 'pago de tarjeta', 'pago tarjeta', 'pagaste el resumen', 'pagaste tu resumen', 'pago del resumen', 'pago de resumen',
  'pago visa', 'pago master', 'pago amex', 'tarjeta credito visa', 'tarjeta credito master',
  'entre cuentas', 'otorgamiento adelanto', 'cancelacion adelanto',
  'compra dolar', 'compra de dolar', 'venta dolar', 'venta de dolar',
];
const recibidas = ['te transfirio', 'te transfirieron', 'te envio', 'te enviaron', 'recibiste una transferencia', 'recibiste dinero', 'transferencia recibida', 'ingreso de dinero', 'ingreso dinero', 'te depositaron', 'recibiste $'];
const ingresos = ['acreditamos', 'se acredito', 'acreditacion', 'recibiste un pago', 'cobraste', 'rendimiento', 'rendiste', 'devolucion', 'reintegro', 'cashback', 'te devolvimos'];
const enviadas = ['transferiste', 'enviaste', 'transferencia enviada', 'transferencia realizada'];
const gastos = ['pagaste', 'compraste', 'compra ', 'compra de', 'consumo', 'pago ', 'pago de', 'debito', 'debitamos', 'abonaste', 'extrajiste', 'retiraste', 'realizaste un pago', 'usaste tu tarjeta', 'con tu tarjeta', 'cobro de'];

const has = (n: string, list: string[]) => list.some((x) => n.includes(x));

/** Cuotas en un texto ("en 6 cuotas", "cuota 3/12", "C.03/12", "6 cuotas de $ 1.000"). */
export function detectarCuotas(texto: string): InfoCuotas | undefined {
  const n = normalizar(texto);
  const a = n.match(/(\d{1,2}) cuotas de (?:\$|ars)?\s*(\d[\d.]*(?:,\d{1,2})?)/);
  if (a && +a[1] >= 2 && +a[1] <= 60) return { total: +a[1], montoCuota: textoACentavos(a[2]) ?? undefined };
  const b = n.match(/\b(?:cuota|cta)\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/) ?? n.match(/\bc\.?(\d{2})\/(\d{2})\b/);
  if (b && +b[2] >= 2 && +b[2] <= 60 && +b[1] >= 1 && +b[1] <= +b[2]) return { total: +b[2], numero: +b[1] };
  const c = n.match(/\ben (\d{1,2}) cuotas\b/);
  if (c && +c[1] >= 2 && +c[1] <= 60) return { total: +c[1] };
  return undefined;
}

const NOMBRE = "([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.' ]{1,60}?)";
const genericas = new Set(['tu cuenta', 'tu tarjeta', 'tu billetera', 'cuotas', 'efectivo', 'pesos', 'el dia', 'mercado pago', 'ti', 'vos', 'tu', 'dinero', 'plata', 'saldo', 'una cuenta', 'tu cvu', 'tu cbu', 'tu caja de ahorro', 'naranja x', 'uala', 'cuenta']);
function generica(t: string) {
  const n = normalizar(t);
  return !n || genericas.has(n) || n.startsWith('tu ') || n.startsWith('su ') || /^\d+$/.test(n);
}
function firstMatch(re: RegExp, texto: string): string | undefined {
  for (const m of texto.matchAll(re)) {
    const v = m[1].trim();
    if (!generica(v)) return v;
  }
  return undefined;
}
/** "Le transferiste $ 1.000 a Juan Pérez" → "Juan Pérez". */
const destinatario = (t: string) => firstMatch(new RegExp(`\\sa\\s+${NOMBRE}(?=\\s+(?:por|desde|con|el|en)\\b|[.,!\\n]|$)`, 'g'), t);
/** "Juan Pérez te transfirió $ 500" o "Recibiste $ 500 de Juan Pérez" → "Juan Pérez". */
function remitente(t: string): string | undefined {
  const m = t.match(new RegExp(`${NOMBRE}\\s+te\\s+(?:transfiri|envi|deposit)`, 'i'));
  if (m) {
    const v = m[1].trim().split('. ').pop()!;
    if (!generica(v)) return v;
  }
  return firstMatch(new RegExp(`\\sde\\s+${NOMBRE}(?=\\s+(?:a|en|por|desde)\\b|[.,!\\n]|$)`, 'g'), t);
}
/** "Pagaste $ 1.500 en Kiosco El Sol con tu tarjeta" → "Kiosco El Sol". */
const comercio = (t: string) => firstMatch(/\s(?:en|a)\s+([^.,!\n$]{2,60}?)(?=\s+(?:con|por|el|desde|y)\b|[.,!\n]|$)/g, t);

const esOperacionExplicita = (n: string) => ['pagaste', 'compraste', 'transferiste', 'te transfirio', 'recibiste', 'enviaste'].some((x) => n.includes(x));

export function analizar(paquete: string, titulo: string | null | undefined, texto: string | null | undefined, instante: number, cotizacionDolar = 0): Resultado {
  const cuenta = cuentaDePaquete(paquete) ?? CUENTAS.OTRA;
  const original = [titulo?.trim(), texto?.trim()].filter((x): x is string => !!x).join('. ');
  const n = normalizar(original);
  let dolares: Cents | undefined;
  if (monedaExtranjera.test(original)) {
    const d = original.match(montoDolares)?.[1];
    const v = d ? textoACentavos(d) : null;
    if (v === null || cotizacionDolar <= 0) return { ignorada: 'MONEDA_EXTRANJERA' };
    dolares = Math.abs(v);
  }
  const m = original.match(montoRe)?.[1];
  const centavos = dolares !== undefined ? Math.round((dolares * cotizacionDolar) / 100) : m ? Math.abs(textoACentavos(m) ?? 0) : 0;
  if (!centavos) return { ignorada: 'SIN_MONTO' };
  if (has(n, fallidas)) return { ignorada: 'OPERACION_FALLIDA' };
  const gpay = cuenta === CUENTAS.GOOGLE_PAY;
  let tipo: Tipo | null = null;
  let sentido: Sentido | undefined;
  if (has(n, propias)) tipo = 'TRANSFERENCIA_PROPIA';
  else if (has(n, recibidas)) [tipo, sentido] = ['INGRESO', 'RECIBIDA'];
  else if (has(n, enviadas)) [tipo, sentido] = ['GASTO', 'ENVIADA'];
  else if (has(n, ingresos)) tipo = 'INGRESO';
  else if (has(n, gastos) || gpay) tipo = 'GASTO';
  if (!tipo) return { ignorada: 'NO_RECONOCIDA' };
  // Una promoción solo se descarta si no describe una operación concreta.
  if (has(n, promociones) && !esOperacionExplicita(n)) return { ignorada: 'PROMOCION' };
  const contraparte = sentido === 'ENVIADA' ? destinatario(original) : sentido === 'RECIBIDA' ? remitente(original) : undefined;
  const base =
    contraparte && sentido === 'ENVIADA'
      ? `Transferencia a ${contraparte}`
      : contraparte
        ? `Transferencia de ${contraparte}`
        : sentido === 'ENVIADA'
          ? 'Transferencia enviada'
          : sentido === 'RECIBIDA'
            ? 'Transferencia recibida'
            : comercio(original) ?? (titulo?.trim() || cuenta);
  const descripcion = dolares !== undefined ? `${base} (USD ${(dolares / 100).toFixed(2).replace('.', ',')})` : base;
  return {
    movimiento: {
      fecha: instante,
      monto: centavos,
      tipo,
      descripcion: descripcion.slice(0, 80),
      cuenta,
      contraparte,
      transferencia: sentido,
      textoOriginal: original,
      cuotas: tipo === 'GASTO' && !sentido ? detectarCuotas(original) : undefined,
    },
  };
}
