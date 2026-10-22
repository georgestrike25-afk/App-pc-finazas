package ar.finanzas.personales;

import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente entre la app y la lectura de notificaciones de las apps financieras. */
@CapacitorPlugin(name = "Notificaciones")
public class NotificacionesPlugin extends Plugin {
    private static volatile NotificacionesPlugin instancia;

    @Override
    public void load() {
        instancia = this;
    }

    /** Avisa a la app (si está abierta) que llegaron notificaciones nuevas. */
    static void avisar() {
        NotificacionesPlugin p = instancia;
        if (p != null) p.notifyListeners("nuevas", new JSObject());
    }

    @PluginMethod
    public void estado(PluginCall call) {
        boolean permitido = NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
        JSObject r = new JSObject();
        r.put("permitido", permitido);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void pendientes(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("items", LectorNotificaciones.leer(getContext()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudieron leer las notificaciones guardadas.", e);
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        try {
            LectorNotificaciones.borrarPrimeras(getContext(), call.getInt("cantidad", 0));
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo actualizar la cola de notificaciones.", e);
        }
    }
}
