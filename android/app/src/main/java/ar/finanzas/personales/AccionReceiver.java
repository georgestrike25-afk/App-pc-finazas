package ar.finanzas.personales;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** Botones "Deshacer" y "No registrar" de los avisos de Brote. */
public class AccionReceiver extends BroadcastReceiver {
    static final String DESHACER = "ar.finanzas.personales.DESHACER";
    static final String DESCARTAR = "ar.finanzas.personales.DESCARTAR";

    @Override
    public void onReceive(Context c, Intent i) {
        String clave = i.getStringExtra("clave");
        if (clave == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("accion", DESHACER.equals(i.getAction()) ? "deshacer" : "descartar");
            o.put("clave", clave);
            o.put("fecha", System.currentTimeMillis());
            Brote.agregar(c, o);
        } catch (Exception ignorada) {
            // no se pudo guardar la decisión
        }
        if (DESHACER.equals(i.getAction())) Brote.prefs(c).edit().putString("ultimoT", "Se deshizo el último gasto").putString("ultimoS", "No se va a registrar").putString("ultimoM", "").apply();
        Brote.resolverPendiente(c, clave);
        Avisos.quitar(c, clave);
        Brote.actualizarWidgets(c);
    }
}
