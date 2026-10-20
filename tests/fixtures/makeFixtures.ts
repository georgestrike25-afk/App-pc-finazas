import { PDFDocument, StandardFonts } from 'pdf-lib';

export const STATEMENT_LINES = [
  'BANCO PATAGONIA - TARJETA VISA',
  'Resumen de cuenta - DATOS FICTICIOS DE PRUEBA',
  'Cierre actual: 25/09/2026',
  'Vencimiento actual: 06/10/2026',
  'Saldo anterior 150.000,00',
  '05/09/26 SU PAGO EN PESOS -150.000,00',
  '08/09/26 COTO SUC 45 32.450,50',
  '10/09/26 MERCADOLIBRE*TIENDA C.04/10 12.000,00',
  '12/09/26 SANCOR SALUD 98.000,00',
  '15/09/26 INTERESES FINANCIACION 1.250,00',
  'Total a pagar 141.700,50',
  'Pago mínimo 14.170,00',
];

export const NEXT_STATEMENT_LINES = [
  'BANCO PATAGONIA - TARJETA VISA',
  'Cierre actual: 26/10/2026',
  'Vencimiento actual: 06/11/2026',
  '10/09/26 MERCADOLIBRE*TIENDA C.05/10 12.000,00',
  '14/10/26 SANCOR SALUD 98.000,00',
  'Total a pagar 110.000,00',
];

export async function makeStatementPdf(lines: string[] = STATEMENT_LINES): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 800;
  for (const l of lines) {
    page.drawText(l.replace('í', 'i'), { x: 40, y, size: 11, font });
    y -= 20;
  }
  return pdf.save();
}
