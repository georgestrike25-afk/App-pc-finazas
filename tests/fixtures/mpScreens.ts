/** Pantallas FICTICIAS de la app de Mercado Pago (como las lee el OCR, una página por pantalla). */
export const MP_PLAN = [
  'Mercado pago', 'PLAN DE PAGOS ESTIMADO Moneda: pesos argentinos',
  'NOVIEMBRE 2026 Tarjeta: $120.000,00', 'Préstamos: $160.000,00 Total del mes:', '$280.000,00',
  'DICIEMBRE 2026 Tarjeta: $50.000,00', 'Préstamos: $160.000,00 Total del mes:', '$210.000,00',
  'ENERO 2027 Tarjeta: $0,00 Préstamos:', '$140.000,00 Total del mes: $140.000,00',
];
export const MP_CREDITOS: string[][] = [
  ['11:52', '<', 'Detalle del pago', 'Vence el 11 de diciembre',
    'e     Préstamo Personal          $ 100.000,00', 'ma      Solicitado el 10 de octubre           Cuota 2 de 3',
    '<        Celular Moto G55 Azul... $ 20.000,00', '-     Solicitado el 15 de septiembre       Cuota 3 de 3',
    'a     Préstamo Personal           $ 40.000,00', 'Re      Solicitado el 26 de enero           Cuota 11 de 12',
    'Total a pagar                            $ 160.000,00', 'Pagar'],
  ['11:52', '<', 'ES', 'Préstamo Personal', 'Solicitaste $ 250.000,00 el 10 de octubre', 'Ir ala actividad', 'Pagaste', '$ 100.000,00 de $300.000,00', 'Consultar detalle de las cuotas', 'Falta pagar                    $ 200.000,00', 'Anticipar pago'],
  ['11:52', '<', 'Celular Moto G55 Azul', 'Dual Sim 256 GB', 'Solicitaste $ 50.000,00 el 15 de septiembre', 'Pagaste', '$ 40.000,00 de $60.000,00', 'Falta pagar                     $ 20.000,00'],
  ['11:52', '<', 'ES', 'Préstamo Personal', 'Solicitaste $ 300.000,00 el 26 de enero', 'Pagaste', '$ 400.000,00 «e $480.000,00', 'Falta pagar                     $ 80.000,00'],
];
export const MP_TARJETA: string[][] = [
  ['<', 'Tarjeta de crédito', 'Al día', 'Noviembre                           <       >', 'Cierra hoy * Vence el 10/nov', 'Tu total hasta hoy es', '$ 150.000%4', 'Últimos movimientos',
    'MERPAGO*TIENDA        $30.000,00', 'Consumo                   Cuota 1 de 2', 'Pago de tarjeta                -$200.000,00'],
  ['<', 'Tenés $ 1.000.000,00 de límite', 'Diciembre', 'Cierra el 5/dic Vence el 10/dic', 'Tu total hasta hoy es', '$ 80.000"', 'MERPAGO*TIENDA        $30.000,00', 'Consumo                  Cuota 2 de 2'],
];
export const asLines = (pages: string[][]) => pages.flatMap((p, i) => p.map((text) => ({ text, page: i + 1 })));
