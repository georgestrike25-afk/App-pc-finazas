import { normalizeText } from '../domain/text';
import type { ExpenseKind } from '../domain/types';

export const ENTITY_PATTERNS: Array<{ entity: string; re: RegExp }> = [
  { entity: 'Visa Banco Patagonia', re: /patagonia/i },
  { entity: 'Mercado Crédito', re: /mercado\s*cr[eé]dito/i },
  { entity: 'Mercado Pago', re: /mercado\s*pago/i },
  { entity: 'Naranja X', re: /naranja/i },
  { entity: 'Ualá', re: /\bual[aá](?![a-z])/i },
  { entity: 'Plan V', re: /plan\s*v\b/i },
];

export function detectEntity(text: string): { entity?: string; confidence: 'alta' | 'media' | 'baja' } {
  const counts = ENTITY_PATTERNS.map((p) => ({ entity: p.entity, n: text.match(new RegExp(p.re.source, 'gi'))?.length ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  // Plan V es un producto de Visa: solo se toma como entidad si no aparece el banco o emisor.
  const issuers = counts.filter((c) => c.entity !== 'Plan V');
  if (issuers.length) {
    return { entity: issuers[0].entity, confidence: issuers.length === 1 || issuers[0].n > issuers[1].n ? 'alta' : 'media' };
  }
  if (counts.length) return { entity: counts[0].entity, confidence: 'media' };
  if (/\bvisa\b/i.test(text)) return { entity: 'Visa', confidence: 'media' };
  if (/mastercard/i.test(text)) return { entity: 'Mastercard', confidence: 'media' };
  return { confidence: 'baja' };
}

const CATEGORY_RULES: Array<{ category: string; kind: ExpenseKind; words: string[] }> = [
  { category: 'Supermercado', kind: 'cotidiano', words: ['coto', 'carrefour', 'jumbo', 'disco', 'vea', 'changomas', 'supermerc', 'super ', 'dia tienda', 'autoservicio', 'almacen', 'dietetica', 'verduleria', 'carniceria'] },
  { category: 'Combustible', kind: 'cotidiano', words: ['ypf', 'shell', 'axion', 'puma energy', 'combustible', 'nafta'] },
  { category: 'Farmacia', kind: 'cotidiano', words: ['farmacia', 'farmacity', 'drogueria'] },
  { category: 'Delivery y comidas', kind: 'cotidiano', words: ['uber eats', 'ubereats', 'rappi', 'pedidosya', 'pedidos ya', 'mcdonald', 'burger', 'restaurant', 'resto', 'cafe', 'pizzeria', 'panaderia'] },
  { category: 'Transporte', kind: 'cotidiano', words: ['sube', 'uber', 'cabify', 'didi', 'peaje', 'estacionamiento', 'trenes', 'subte'] },
  { category: 'Telefonía', kind: 'personal', words: ['movistar movil', 'claro movil', 'personal movil', 'tuenti'] },
  { category: 'Servicios del hogar', kind: 'hogar', words: ['edenor', 'edesur', 'epec', 'metrogas', 'naturgy', 'camuzzi', 'ecogas', 'aysa', 'telecom', 'fibertel', 'telecentro', 'personal flow', 'movistar', 'claro', 'expensas', 'alquiler', 'abl'] },
  { category: 'Suscripciones', kind: 'personal', words: ['netflix', 'spotify', 'disney', 'hbo', 'max ', 'youtube', 'prime video', 'amazon prime', 'apple com', 'google', 'paramount', 'star plus'] },
  { category: 'Compras en línea', kind: 'personal', words: ['mercadolibre', 'mercado libre', 'merpago', 'tiendanube', 'amazon'] },
  { category: 'Salud', kind: 'personal', words: ['osde', 'swiss medical', 'galeno', 'medife', 'clinica', 'sanatorio', 'odontolog'] },
  { category: 'Ropa', kind: 'personal', words: ['zara', 'adidas', 'nike', 'indumentaria', 'calzado', 'uniforme'] },
];

export function suggestCategory(concept: string): { category: string; kind: ExpenseKind } {
  const n = ` ${normalizeText(concept)} `;
  for (const r of CATEGORY_RULES) {
    if (r.words.some((w) => n.includes(` ${normalizeText(w)}`) || n.includes(normalizeText(w)))) return { category: r.category, kind: r.kind };
  }
  return { category: 'Otros', kind: 'personal' };
}

export const DEFAULT_CATEGORIES = [
  'Supermercado',
  'Combustible',
  'Farmacia',
  'Delivery y comidas',
  'Transporte',
  'Servicios del hogar',
  'Alquiler',
  'Electricidad',
  'Gas',
  'Internet',
  'Suscripciones',
  'Telefonía',
  'Transferencias',
  'Compras en línea',
  'Salud',
  'Obra social',
  'Ropa',
  'Educación',
  'Ocio',
  'Cargos financieros',
  'Otros',
];
