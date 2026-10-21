import { PDFDocument, StandardFonts } from 'pdf-lib';

/** Resumen FICTICIO con el diseño de Naranja X (nombres e importes inventados). */
const ROWS: Array<Array<[number, string]>> = [
  [[40, 'TITULAR DE PRUEBA'], [521, 'Hoja 1']],
  [[102, 'Tu total a pagar es $5.500,00']],
  [[102, 'y vence el 10/09/26.']],
  [[17, 'Cuanto queres'], [102, 'TOTAL'], [261, 'LA MENOR ENTREGA']],
  [[102, '$5.500,00'], [261, '$2.000,00']],
  [[34, 'Detalle de'], [74, 'Consumos tarjeta de credito de Prueba']],
  [[74, 'FECHA'], [109, 'TARJETA'], [167, 'CUPON'], [193, 'DETALLE'], [411, 'CUOTA/PLAN'], [500, '$'], [545, 'U$S']],
  [[74, '15/12/25 NX Visa'], [172, '1111'], [192, 'TIENDA PRUEBA'], [429, '09/12'], [490, '3.000,00']],
  [[74, '27/08/26'], [192, '*PLAN'], [216, 'TURBO'], [241, '(REEMPLAZA COSTO DE MANTENIMIENTO)'], [486, '2.000,00']],
  [[34, 'Otros'], [192, 'IVA'], [208, 'Operaciones Identificadas con *']],
  [[30, 'cargos:']],
  [[192, '(Base'], [216, 'Imponible $2.000,00)'], [490, '420,00']],
  [[192, 'Impuesto'], [229, 'de'], [241, 'Sellos'], [498, '80,00']],
  [[74, 'Total']],
  [[74, '$ 5.500,00']],
  [[102, 'Fechas importantes'], [343, 'Cuotas futuras']],
  [[102, 'Tu resumen anterior cerro el 27/07,']],
  [[102, 'vencio el 10/08, por $10.000,00.']],
  [[102, 'El resumen actual cerro el 27/08.'], [343, 'Octubre/26 $3.000,00.']],
  [[102, 'El proximo resumen cierra el 27/09,']],
  [[343, 'Noviembre/26 $3.000,00.']],
  [[102, 'y vence el 10/10.']],
  [[343, 'Diciembre/26 $3.000,00.']],
  [[343, 'Enero/27 $0,00.']],
  [[99, 'Pago del resumen anterior']],
  [[99, 'FECHA'], [143, 'DETALLE'], [463, '$'], [533, 'U$S']],
  [[99, '08/08/26'], [144, 'PAGO'], [164, 'EN'], [177, 'PESOS'], [434, '10.000,00']],
  [[102, 'PAGO MINIMO: $2.000,00 Y 11 CUOTAS MENSUALES CONSECUTIVAS DE $50,00.']],
  [[102, 'Accede a mas informacion en www.naranjax.com o App Naranja X.']],
];

export async function makeNaranjaPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 820;
  for (const row of ROWS) {
    for (const [x, text] of row) page.drawText(text, { x, y, size: 7, font });
    y -= 14;
  }
  return pdf.save();
}
