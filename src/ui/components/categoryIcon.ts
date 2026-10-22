import { ArrowRightLeft, Bus, Car, Dumbbell, Flame, Fuel, GraduationCap, HeartPulse, House, PawPrint, Pill, Receipt, Shapes, Shirt, ShoppingCart, Smartphone, Ticket, Utensils, Wifi, Zap, type LucideIcon } from 'lucide-react';
import { normalizeText } from '../../domain/text';

const RULES: Array<[RegExp, LucideIcon]> = [
  [/super|almacen|verdul|carnic|mercado/, ShoppingCart],
  [/combust|nafta|ypf|shell|axion/, Fuel],
  [/farmac/, Pill],
  [/deliver|comida|restaur|bar|cafe|panader/, Utensils],
  [/transp|uber|cabify|sube|colectivo|taxi|peaje/, Bus],
  [/auto|seguro|patente/, Car],
  [/alquiler|hogar|expensa|casa/, House],
  [/luz|electric|edenor|edesur/, Zap],
  [/gas\b|^gas/, Flame],
  [/internet|wifi|fibra/, Wifi],
  [/celular|telefon|movil/, Smartphone],
  [/salud|sancor|obra social|medic|consult|odont/, HeartPulse],
  [/transfer/, ArrowRightLeft],
  [/ropa|indument/, Shirt],
  [/educa|curso|colegio|facultad/, GraduationCap],
  [/mascota|veterin/, PawPrint],
  [/gimnas|deporte/, Dumbbell],
  [/salida|entreten|cine|stream|suscrip/, Ticket],
  [/servicio|impuesto|tasa/, Receipt],
];

/** Ícono de una categoría de gasto (solo visual: no cambia la categoría). */
export function categoryIcon(category: string): LucideIcon {
  const c = normalizeText(category);
  return RULES.find(([re]) => re.test(c))?.[1] ?? Shapes;
}
