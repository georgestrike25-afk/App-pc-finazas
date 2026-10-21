import { Card } from '../components/ui';
import { startTour } from '../components/Tour';

/** Guía corta de uso, en lenguaje simple. */
export function AyudaPage() {
  return (
    <div className="page ayuda">
      <Card title="La idea">
        <p>Casi todo lo cargan tus documentos. Vos subís los PDF o capturas y la app arma las cuentas. A mano solo anotás lo que pagás en efectivo.</p>
        <p>¿No entendés algo? Tocá el signo <span className="help-btn" aria-hidden>?</span> que está al lado de los títulos y datos: aparece una burbuja que te explica qué es.</p>
        <div className="row-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn primary" onClick={startTour}>Ver la guía paso a paso</button>
        </div>
      </Card>
      <Card title="Una sola vez">
        <ol>
          <li><strong>Subir</strong> → los <strong>cronogramas de tus préstamos</strong>.</li>
          <li><strong>Subir</strong> → el último <strong>resumen de cada tarjeta</strong> y el plan de Mercado Pago.</li>
          <li><strong>Gastos → Compartidos</strong> → tus gastos fijos (alquiler, luz, gas, internet) marcando "Se repite todos los meses".</li>
          <li><strong>Viaje</strong> → cuánto cuesta y cuánto querés ahorrar por mes.</li>
        </ol>
      </Card>
      <Card title="Cada mes">
        <p>Mirá <strong>Este mes → Pendientes</strong>: te dice qué falta y se tilda solo.</p>
        <ol>
          <li>Cuando llega un <strong>resumen de tarjeta</strong> → Subir → Confirmar (fijate que diga ✓ coincide).</li>
          <li>Después de cobrar → <strong>captura de los movimientos del banco</strong> → Subir. Carga el sueldo y marca pagadas las cuotas.</li>
          <li>Si ya pagaste un resumen y no tenés la captura → tocá <strong>"Ya lo pagué"</strong> en Pendientes.</li>
          <li>Si tu pareja te devuelve su parte de Sancor → registralo desde Pendientes.</li>
        </ol>
      </Card>
      <Card title="Durante el mes">
        <p>Solo lo que no llega en un documento: gastos en efectivo → <strong>+ Anotar gasto</strong>. Las compras con tarjeta llegan solas con el resumen.</p>
      </Card>
      <Card title="Dónde mirar">
        <ul>
          <li><strong>Este mes:</strong> cuánto te queda (solo cuenta lo real).</li>
          <li><strong>Deudas:</strong> cuánto debés a cada banco y cuándo terminás.</li>
          <li><strong>Viaje:</strong> si llegás y cuánto ahorrar por mes.</li>
        </ul>
      </Card>
      <Card title="Si algo sale mal">
        <ul>
          <li>Si subís algo dos veces, la app lo detecta y no lo duplica.</li>
          <li>Si al subir dice ⚠ no coincide, no confirmes: revisá la línea marcada.</li>
          <li>Si marcaste una cuota de más: Deudas → la deuda → "Corregir cuotas pagadas".</li>
          <li>Hacé una copia de seguridad una vez por mes (Más → Copias).</li>
        </ul>
      </Card>
    </div>
  );
}
