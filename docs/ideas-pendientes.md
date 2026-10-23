# Ideas pendientes

## Modo pareja: Jorge y Antonella comparten gastos (pedido el 23/10/2026 — HECHO el 24/10/2026, ver README → Modo pareja)

Solo celular (Android). No programar hasta que Jorge lo confirme; primero mostrar el diseño en capturas para aprobar.

**Qué quiere:**
1. Gastos a medias del día a día: si Antonella anota "pagué $ 50 (compartido)", en la app de Jorge aparece solo su mitad ($ 25) como gasto y lo que le debe a ella. Y al revés.
2. Gastos fijos compartidos (alquiler, gas, luz, internet, y lo que figure en la planilla de cada mes): Antonella los paga y los anota; a Jorge le aparece su mitad automáticamente, sin cuentas a mano.
3. Sancor Salud: lo paga Jorge con la Visa y Antonella le devuelve la mitad. Que quede reflejado en las dos apps.
4. Un saldo "quién le debe a quién" del mes, para saber cuánto pasar sin calcular.
5. En el widget, un botón "Compartido" rápido para Antonella.

**A definir el día que se haga:**
- Cómo viajan los datos entre los dos celulares: por el Wi-Fi de la casa (como la sync con la PC, sin costo) o por internet cifrado de punta a punta (funciona en cualquier lado; necesita un servidor).
- Emparejar los dos celulares con un código (cada uno conserva sus datos privados; solo se comparten los gastos marcados "compartido").
- Qué pasa si uno edita o borra un gasto compartido; confirmación del otro o no.
- Reparto distinto de 50 % en algunos gastos (hoy la configuración permite otro %).
- Marcar "ya te pasé la plata" para saldar el mes.

**Diseño propuesto (23/10/2026):** `design-preview/pareja/` (capturas `pareja-*.png`, claro y oscuro).
- Botón **Pagado**: en la app de quien paga sale de su plata hasta cobrar como "Pago a Antonella/Jorge" (no es gasto nuevo: su mitad ya estaba en Gastos); en la app de quien recibe entra como **ingreso** y el saldo queda en cero. Vale para los dos lados.
- Cuando uno anota un gasto compartido, al otro le llega un aviso con su mitad, que ya se suma a sus gastos ("No es compartido" para corregir).

**Planilla de gastos fijos dentro de la app (23/10/2026):** reemplaza subir el PDF/Excel cada mes. Pantallas `pareja-fijos-*`, `pareja-fijo-cargar-*`.
- Se arma sola cada mes, sin montos: Alquiler, Luz, Gas e Internet (paga Antonella, mitad y mitad), Fondo casa (opcional, los dos), Obra social Sancor (paga Jorge con la Visa, llega con el resumen; Antonella devuelve la mitad).
- Único fijo: **Alquiler de consultorio $ 20.000, solo de Jorge**, se carga solo todos los meses.
- Quien paga pone el monto (con "Igual que el mes pasado"); al otro le aparece su mitad. La planilla se puede editar (agregar, quitar, quién paga, % y monto fijo) y se ve igual en los dos celulares.
- Confirmado por Jorge: todos los gastos fijos cambian un poco cada mes (se cargan a mano, la app muestra el monto del mes anterior como referencia); el único fijo es el consultorio, $ 20.000, que paga y es solo de Jorge.
- Regla: en la app de Jorge, cada gasto fijo que paga Antonella queda "Pendiente" (sin sumar nada) hasta que ella lo carga como pagado; en ese momento se suma solo la mitad de Jorge a sus gastos y al saldo "le tenés que pasar". Al revés con Sancor (lo paga Jorge: al cargarse, a Antonella le aparece su mitad). El consultorio no se comparte.
- Sancor: el monto cambia cada mes. Jorge carga el total a mano (o se toma del resumen de la Visa si ya lo subió, sin duplicar); a Antonella le aparece su mitad como gasto y suma al saldo "le tenés que pasar a Jorge". Cuando ella paga, a Jorge le entra como ingreso (o como "lo que te devolvió", según cómo se cuente hoy Sancor en Brote: que no se cuente dos veces).

**Implementado (24/10/2026):** sincroniza celular con celular por el Wi-Fi o el hotspot, sin depender de la PC (la PC es opcional). Para conectarse se usa el QR o el código `BROTE2-…`. Pendiente de probar en los dos celulares reales: si el otro celular sigue recibiendo con Brote cerrado (depende de que Android mantenga viva la lectura de notificaciones). Queda para más adelante: un .exe para Antonella, si lo quiere.
