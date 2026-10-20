import { PDFDocument, StandardFonts } from 'pdf-lib';
import { formatPlain } from '../../src/domain/money';

/** Cronograma FICTICIO con el formato de "Cronograma - Préstamo PERSONAL" (6 cuotas, importes inventados). */
export const LOAN_ROWS = [
  { n: 1, date: '05/06/2026', capital: 1000000, total: 2500000, status: 'PAGA' },
  { n: 2, date: '05/07/2026', capital: 1100000, total: 2450000, status: 'PAGA' },
  { n: 3, date: '05/08/2026', capital: 1200000, total: 2400000, status: 'PAGA' },
  { n: 4, date: '05/09/2026', capital: 1300000, total: 2350000, status: 'NO VENCIDA' },
  { n: 5, date: '05/10/2026', capital: 1400000, total: 2300000, status: 'NO VENCIDA' },
  { n: 6, date: '05/11/2026', capital: 1500000, total: 2250000, status: 'NO VENCIDA' },
];

export async function makeLoanPdf(paidUpTo = 3): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const t = (x: number, y: number, s: string) => page.drawText(s, { x, y, size: 8, font });
  t(20, 800, 'Cronograma');
  t(20, 785, 'Prestamo PERSONAL-Nro.:99990001');
  let y = 760;
  [[42, 'Cuota'], [99, 'Vencimiento'], [189, 'Capital(*)'], [287, 'Total'], [360, 'Estado']].forEach(([x, s]) => t(x as number, y, s as string));
  for (const r of LOAN_ROWS) {
    y -= 14;
    t(53, y, String(r.n));
    t(101, y, r.date);
    t(176, y, '$');
    t(208, y, formatPlain(r.capital));
    t(261, y, '$');
    t(288, y, formatPlain(r.total));
    t(r.n <= paidUpTo ? 361 : 344, y, r.n <= paidUpTo ? 'PAGA' : 'NO VENCIDA');
  }
  t(162, y - 30, '(*) No incluye impuestos');
  return pdf.save();
}
