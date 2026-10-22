// Genera icons.js con los íconos (lucide, la misma familia que usa la app) como SVG en texto.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as L from 'lucide-react';
import { writeFileSync } from 'node:fs';
const names = ['Wallet','LayoutDashboard','ArrowDownToLine','ArrowUpRight','ArrowDownRight','TrendingUp','Receipt','Users','PiggyBank','Landmark','CreditCard','CalendarClock','Plane','ChartColumn','Upload','History','Settings','RefreshCw','CircleHelp','Bell','ChevronDown','ChevronLeft','ChevronRight','Plus','Leaf','Check','Circle','TriangleAlert','Trash2','Pencil','Sun','Moon','Monitor','Menu','X','FileText','Calendar','Ellipsis','Lock','Download','Smartphone','ShoppingCart','Fuel','Pill','Utensils','House','Bus','Shapes','ArrowLeft','CircleCheck','Clock','FileUp','HeartPulse','Zap','Wifi','Flame','Search','Split','HardDrive','ShieldCheck','Laptop','Image','Video','Sheet'];
const out = {};
for (const n of names) {
  const C = L[n];
  if (!C) throw new Error('falta ' + n);
  out[n] = renderToStaticMarkup(createElement(C, { size: 20, strokeWidth: 1.8, 'aria-hidden': 'true' }));
}
writeFileSync(new URL('./icons.js', import.meta.url), 'window.ICONS = ' + JSON.stringify(out) + ';\n');
console.log(Object.keys(out).length, 'íconos');
