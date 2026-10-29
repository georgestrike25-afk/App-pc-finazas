import { desktop, esPrueba } from '../platform';
import { leerCodigoPareja } from '../domain/pareja';
import { elegirYo, loadPareja, runParejaSync, unirPareja } from './pareja';

/**
 * Ventana "celular de prueba" de la PC: al abrirse por primera vez se une sola al modo pareja
 * de esta PC y elige ser la pareja (así se prueba sin el celular de la otra persona).
 */
export async function iniciarPrueba(): Promise<void> {
  if (!esPrueba()) return;
  const datos = await desktop()?.datosPrueba?.();
  if (!datos) return;
  let st = await loadPareja();
  if (!st) {
    await unirPareja(leerCodigoPareja(datos.codigo));
    await runParejaSync();
    st = await loadPareja();
  }
  if (st && !st.yo && st.doc.nombres.a) await elegirYo(datos.yo);
}
