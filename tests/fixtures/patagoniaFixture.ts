import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Resumen FICTICIO con el mismo diseño que Visa Banco Patagonia (columnas, fechas dd.mm.aa,
 * créditos con signo al final, Plan V "n-NN", Sancor como "ASOC MUTUAL SANC", "Cuotas a vencer").
 * Nombres, números de cuenta e importes son inventados.
 */
type Row = Array<[number, string]>;

export function patagoniaRows(opts: { next?: boolean } = {}): Row[] {
  if (opts.next) {
    return [
      [[378, 'VISA CLASSIC'], [485, 'PAGINA:'], [522, '1/ 1']],
      [[90, 'TITULAR DE PRUEBA'], [322, 'CIERRE ACTUAL: 29 Oct 26']],
      [[90, 'CALLE FALSA'], [323, 'VENCIMIENTO'], [382, 'SALDO $'], [419, 'SALDO U$S'], [462, 'PAGO MIN.$'], [505, 'PAGO MIN.U$S']],
      [[90, '0000 CIUDAD'], [346, '11 Nov 26'], [380, '200.000,00'], [431, '0,00'], [465, '40.000,00'], [526, '-,--']],
      [[19, 'VTO. ANTERIOR'], [106, '13 Oct 26'], [152, 'SALDO ANTERIOR'], [223, '$'], [267, '318000,00'], [314, 'U$S'], [369, '0,00'], [416, 'PROXIMO CIERRE'], [506, '26 Nov 26']],
      [[68, 'FECHA'], [100, 'COMPROBANTE'], [180, 'DETALLE DE TRANSACCION'], [429, 'PESOS'], [494, 'DOLARES']],
      [[168, 'SALDO'], [192, 'ANTERIOR'], [417, '318.000,00'], [514, '0,00']],
      [[71, '13.10.26'], [168, 'SU PAGO EN PESOS'], [417, '318.000,00-']],
      [[71, '05.07.26'], [124, '111111*'], [168, 'SHOP*PRUEBA'], [284, 'Cuota'], [313, '04/06'], [421, '50.000,00']],
      [[71, '03.09.26'], [124, '222222'], [168, 'VISA'], [192, 'PLAN'], [216, 'V'], [236, '2-03 (TNA'], [280, '80,00)'], [417, '150.000,00']],
      [[305, 'SALDO ACTUAL'], [381, '$'], [417, '200.000,00']],
      [[99, 'Programa de Premios Club Patagonia - www.bancopatagonia.com.ar']],
    ];
  }
  return [
    [[378, 'VISA CLASSIC'], [485, 'PAGINA:'], [522, '1/ 1']],
    [[378, 'SUCURSAL:'], [450, '000'], [469, 'CIUDAD']],
    [[90, 'TITULAR DE PRUEBA'], [322, 'CIERRE ACTUAL: 01 Oct 26']],
    [[90, 'CALLE FALSA 123'], [323, 'VENCIMIENTO'], [382, 'SALDO $'], [419, 'SALDO U$S'], [462, 'PAGO MIN.$'], [505, 'PAGO MIN.U$S']],
    [[90, '0000 CIUDAD'], [346, '13 Oct 26'], [380, '318.000,00'], [431, '0,00'], [465, '60.000,00'], [526, '-,--']],
    [[19, 'VTO. ANTERIOR'], [106, '07 Sep 26'], [152, 'SALDO ANTERIOR'], [223, '$'], [267, '500000,00'], [314, 'U$S'], [369, '0,00'], [416, 'PROXIMO CIERRE'], [506, '29 Oct 26']],
    [[19, 'CIERRE ANTERIOR'], [153, 'PAGO MIN. ANT.'], [224, '$'], [416, 'PROXIMO VTO.']],
    [[106, '27 Ago 26'], [267, '90000,00'], [504, '11 Nov 26']],
    [[71, 'Cuotas a vencer:']],
    [[83, 'Octubre/26 Noviembre/26'], [180, 'Diciembre/26'], [248, 'Enero/27']],
    [[79, '$200.000,00'], [132, '$200.000,00'], [208, '$50.000,00'], [260, '$0,00']],
    [[68, 'FECHA'], [100, 'COMPROBANTE'], [180, 'DETALLE DE TRANSACCION'], [429, 'PESOS'], [494, 'DOLARES']],
    [[168, 'SALDO'], [192, 'ANTERIOR'], [417, '500.000,00'], [514, '0,00']],
    [[71, '03.09.26'], [168, 'SU'], [180, 'PAGO'], [200, 'EN'], [212, 'PESOS'], [417, '100.000,00-']],
    [[71, '03.09.26'], [168, 'CR.$'], [188, 'PLAN'], [208, 'V'], [417, '400.000,00-']],
    [[71, '30.09.26'], [168, 'CR'], [180, 'IVA'], [196, '$'], [204, '21'], [216, '%'], [425, '2.100,00-']],
    [[71, '30.09.26'], [168, 'BONIFIC.'], [204, 'COMIS.'], [232, 'PROD. PAT'], [421, '10.000,00-']],
    [[71, '05.07.26'], [124, '111111*'], [168, 'SHOP*PRUEBA'], [284, 'Cuota'], [313, '03/06'], [421, '50.000,00']],
    [[71, '03.09.26'], [124, '222222'], [168, 'VISA'], [192, 'PLAN'], [216, 'V'], [236, '1-03 (TNA'], [280, '80,00)'], [417, '150.000,00']],
    [[71, '10.09.26'], [124, '333333K'], [168, 'PEDIDOSYA*PRUEBA'], [421, '20.000,00']],
    [[71, '10.09.26'], [124, '333333'], [168, 'BONIF.'], [196, 'CONSUMO'], [228, 'PEDIDOSYA*PRUEBA'], [425, '5.000,00-']],
    [[71, '17.09.26'], [124, '444444*'], [168, 'ASOC'], [188, 'MUTUAL'], [216, 'SANC'], [236, '000111C00000001'], [417, '100.000,00']],
    [[71, 'Tarjeta 0000 Total'], [148, 'Consumos de TITULAR DE PRUEBA'], [417, '318.000,00'], [514, '0,00']],
    [[71, '30.09.26'], [168, 'COMIS.'], [196, 'PROD.'], [220, 'PAT.'], [240, 'CLASICA'], [421, '10.000,00']],
    [[71, '01.10.26'], [168, 'IMPUESTO'], [204, 'DE'], [216, 'SELLOS'], [272, '$'], [421, '3.000,00']],
    [[71, '01.10.26'], [168, 'DB'], [180, 'IVA'], [196, '$'], [204, '21%'], [329, '10.000,00'], [425, '2.100,00']],
    [[305, 'SALDO ACTUAL'], [381, '$'], [417, '318.000,00']],
    [[305, 'PAGO MINIMO'], [381, '$'], [417, '60.000,00']],
    [[99, 'Plan V: abonando el pago minimo de $ 60000,00 usted puede cancelar en cuotas']],
    [[99, 'Utilice Plan V de Visa. Banco Patagonia. Plan V. Plan V.']],
  ];
}

export async function makePatagoniaPdf(opts: { next?: boolean } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 820;
  for (const row of patagoniaRows(opts)) {
    for (const [x, text] of row) page.drawText(text, { x, y, size: 7, font });
    y -= 14;
  }
  return pdf.save();
}
