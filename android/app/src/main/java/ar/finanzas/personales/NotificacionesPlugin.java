package ar.finanzas.personales;

import android.content.Intent;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.HashSet;

/** Puente entre la app y la lectura de notificaciones de las apps financieras. */
@CapacitorPlugin(name = "Notificaciones")
public class NotificacionesPlugin extends Plugin {
    private static volatile NotificacionesPlugin instancia;

    @Override
    public void load() {
        instancia = this;
    }

    /** Avisa a la app (si está abierta) que hay anotaciones rápidas para registrar. */
    static void avisarRapidas() {
        NotificacionesPlugin p = instancia;
        if (p != null) p.notifyListeners("rapidas", new JSObject());
    }

    /** Avisa a la app que llegó un archivo desde "Compartir". */
    static void avisarCompartido() {
        NotificacionesPlugin p = instancia;
        if (p != null) p.notifyListeners("compartido", new JSObject());
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

    /** Lectura automática activada y nombre de la pareja (para los avisos con la app cerrada). */
    @PluginMethod
    public void configurar(PluginCall call) {
        Brote.prefs(getContext()).edit()
                .putBoolean("activo", Boolean.TRUE.equals(call.getBoolean("activo", false)))
                .putString("pareja", call.getString("pareja", ""))
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void rapidas(PluginCall call) {
        try {
            JSONArray a = Brote.leer(getContext());
            JSArray items = new JSArray();
            for (int i = 0; i < a.length(); i++) items.put(a.get(i));
            JSObject r = new JSObject();
            r.put("items", items);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("No se pudieron leer las anotaciones rápidas.", e);
        }
    }

    @PluginMethod
    public void borrarRapidas(PluginCall call) {
        try {
            Brote.borrarPrimeras(getContext(), call.getInt("cantidad", 0));
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo actualizar la cola de anotaciones.", e);
        }
    }

    /** La app informa el estado real (lo que falta registrar, lo último anotado, la plata) y se redibujan los widgets. */
    @PluginMethod
    public void widget(PluginCall call) {
        android.content.SharedPreferences.Editor e = Brote.prefs(getContext()).edit()
                .putInt("pendientesApp", call.getInt("pendientes", 0))
                .putStringSet("pendientes", new HashSet<>());
        String t = call.getString("ultimoT");
        if (t != null) e.putString("ultimoT", t).putString("ultimoS", call.getString("ultimoS", "")).putString("ultimoM", call.getString("ultimoM", ""));
        String plata = call.getString("plata");
        if (plata != null) e.putString("plata", plata);
        e.putString("parejaNombre", call.getString("parejaNombre", "")).putString("parejaSaldo", call.getString("parejaSaldo", ""));
        e.apply();
        Brote.actualizarWidgets(getContext());
        call.resolve();
    }

    @PluginMethod
    public void permisoAvisos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permitido", Avisos.permitido(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void pedirPermisoAvisos(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !Avisos.permitido(getContext()) && getActivity() != null) {
            getActivity().requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 4711);
        }
        call.resolve();
    }

    /** Archivos que llegaron desde "Compartir" (se entregan una sola vez). */
    @PluginMethod
    public void compartidos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("items", MainActivity.tomarCompartidos());
        call.resolve(r);
    }

    /** Un aviso "¿Cuánto fue?" que se resolvió dentro de la app. */
    @PluginMethod
    public void quitarAviso(PluginCall call) {
        String clave = call.getString("clave");
        Avisos.quitar(getContext(), clave);
        Brote.resolverPendiente(getContext(), clave);
        call.resolve();
    }

    /** Modo pareja: aviso cuando el otro anota un gasto compartido o marca un pago. */
    @PluginMethod
    public void avisoPareja(PluginCall call) {
        Avisos.pareja(getContext(), call.getString("id", ""), call.getString("titulo", "Brote"), call.getString("texto", ""));
        call.resolve();
    }

    /** Modo pareja: este celular recibe la sincronización del otro (también con la app cerrada). */
    @PluginMethod
    public void servidorPareja(PluginCall call) {
        String token = call.getString("token");
        String espacio = call.getString("space");
        if (token == null || espacio == null) {
            call.reject("faltan datos");
            return;
        }
        ServidorPareja.configurar(getContext(), token, espacio);
        JSObject r = new JSObject();
        JSArray urls = new JSArray();
        if (ServidorPareja.andando()) for (String u : ServidorPareja.direcciones()) urls.put(u);
        r.put("urls", urls);
        r.put("puerto", ServidorPareja.PUERTO);
        if (!ServidorPareja.andando()) {
            call.reject("no se pudo abrir el puerto");
            return;
        }
        call.resolve(r);
    }

    @PluginMethod
    public void detenerPareja(PluginCall call) {
        ServidorPareja.olvidar(getContext());
        call.resolve();
    }
}
