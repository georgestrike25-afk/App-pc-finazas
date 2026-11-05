import { PDFDocument, StandardFonts } from 'pdf-lib';
/** PDF con una pantalla por página (para simular las capturas de Mercado Pago sin OCR). */
export async function pagesPdf(pages: string[][]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([595, 842]);
    let y = 800;
    for (const l of lines) {
      page.drawText(l.replace(/^\S{1,2}\s{2,}/, '').replace('«e', 'de').replace('%4', ',00').replace('"', ',00'), { x: 40, y, size: 11, font });
      y -= 20;
    }
  }
  return pdf.save();
}
