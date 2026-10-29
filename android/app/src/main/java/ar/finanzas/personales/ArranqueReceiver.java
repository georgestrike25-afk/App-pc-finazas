package ar.finanzas.personales;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Al prender el celular: si estaba activado "Recibir con Brote cerrado", se vuelve a activar. */
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!ServicioPareja.activo(c)) return;
        try {
            ServicioPareja.cambiar(c, true);
        } catch (Exception ignorada) {
            // Android no dejó arrancarlo: se activa al abrir Brote
        }
    }
}
