package ar.finanzas.personales;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import com.getcapacitor.JSArray;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.List;

/**
 * Lee las notificaciones de las apps financieras (Ualá, Mercado Pago, Naranja X,
 * Banco Patagonia, BNA+ y Google Pay) y las deja en una cola local. La app las
 * interpreta y registra los gastos la próxima vez que se abre (o al instante si está abierta).
 * El resto de las notificaciones se ignora sin guardarse. Nada sale del teléfono.
 */
public class LectorNotificaciones extends NotificationListenerService {
    static final Object CANDADO = new Object();
    static final String ARCHIVO = "notificaciones-pendientes.jsonl";
    private static final long MAXIMO_BYTES = 2_000_000;

    static boolean esFinanciera(String paquete) {
        String p = paquete.toLowerCase();
        return p.contains("uala") || p.contains("bancar") || p.contains("mercadopago") || p.contains("naranja")
                || p.contains("patagonia") || p.matches("(^|.*\\.)bna.*") || p.contains("walletnfcrel")
                || p.equals("com.google.android.apps.wallet");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        procesar(sbn);
    }

    /** Al conectarse revisa las que ya estaban (la app descarta las repetidas). */
    @Override
    public void onListenerConnected() {
        // Mientras la lectura de notificaciones esté activa, el celular recibe al otro del modo pareja.
        ServidorPareja.iniciar(getApplicationContext());
        try {
            StatusBarNotification[] activas = getActiveNotifications();
            if (activas != null) for (StatusBarNotification s : activas) procesar(s);
        } catch (Exception ignorada) {
            // sin acceso todavía
        }
    }

    private void procesar(StatusBarNotification sbn) {
        try {
            if (sbn == null || getPackageName().equals(sbn.getPackageName()) || !esFinanciera(sbn.getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle extras = n.extras;
            CharSequence titulo = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence grande = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence texto = grande != null ? grande : extras.getCharSequence(Notification.EXTRA_TEXT);
            if ((titulo == null || titulo.toString().trim().isEmpty()) && (texto == null || texto.toString().trim().isEmpty())) return;
            JSONObject o = new JSONObject();
            o.put("paquete", sbn.getPackageName());
            o.put("titulo", titulo == null ? "" : titulo.toString());
            o.put("texto", texto == null ? "" : texto.toString());
            o.put("fecha", sbn.getPostTime());
            o.put("clave", sbn.getKey() + "|" + sbn.getPostTime());
            guardar(this, o);
            NotificacionesPlugin.avisar();
            avisoDeBrote(sbn.getPackageName(), titulo, texto, sbn.getPostTime(), o.getString("clave"));
        } catch (Exception ignorada) {
            // Una notificación con un formato raro no debe detener la lectura.
        }
    }

    private static final long REPETIDA_MS = 10 * 60 * 1000;

    /**
     * Con la app cerrada, avisa al instante: "Se anotó…" si el aviso trae el monto, o "¿Cuánto fue?" si no.
     * Solo si la lectura automática está activada en Brote. La app registra el gasto al abrirse.
     */
    private void avisoDeBrote(String paquete, CharSequence titulo, CharSequence texto, long fecha, String clave) {
        android.content.SharedPreferences p = Brote.prefs(this);
        if (!p.getBoolean("activo", false)) return;
        // Al reconectarse el lector revisa las notificaciones que ya estaban: no se avisa dos veces.
        String vistas = p.getString("avisadas", "");
        if (vistas.contains("\n" + clave + "\n")) return;
        String nuevas = vistas + "\n" + clave + "\n";
        p.edit().putString("avisadas", nuevas.length() > 20000 ? nuevas.substring(nuevas.length() - 20000) : nuevas).apply();
        Analisis.Resultado r = Analisis.analizar(paquete, titulo == null ? null : titulo.toString(), texto == null ? null : texto.toString());
        if (r.tipo == Analisis.Tipo.NADA) return;
        String pareja = p.getString("pareja", "");
        String n = Analisis.normalizar((titulo == null ? "" : titulo) + " " + (texto == null ? "" : texto));
        // Una transferencia a tu pareja puede ser el alquiler (ya cargado): la decide la app, sin aviso automático.
        if (r.transferencia && pareja.length() >= 3 && n.contains(Analisis.normalizar(pareja))) return;
        if (r.tipo == Analisis.Tipo.SIN_MONTO) {
            Brote.agregarPendiente(this, clave);
            Avisos.sinMonto(this, clave, r.descripcion, r.cuenta, fecha, r.transferencia);
        } else {
            // La misma compra avisada por dos apps (p. ej. Google Pay y el banco) se avisa una sola vez.
            if (p.getLong("ultimoMonto", -1) == r.monto && Math.abs(fecha - p.getLong("ultimaFecha", 0)) <= REPETIDA_MS) return;
            p.edit().putLong("ultimoMonto", r.monto).putLong("ultimaFecha", fecha).apply();
            Brote.ultimo(this, "Se sumó: " + r.descripcion, r.cuenta + " · recién", r.monto);
            Avisos.anotado(this, clave, r.monto, r.descripcion, r.cuenta, fecha, r.transferencia);
        }
        Brote.actualizarWidgets(this);
    }

    static void guardar(Context c, JSONObject o) throws Exception {
        synchronized (CANDADO) {
            File f = new File(c.getFilesDir(), ARCHIVO);
            if (f.length() > MAXIMO_BYTES) return;
            try (FileWriter w = new FileWriter(f, true)) {
                w.write(o.toString());
                w.write("\n");
            }
        }
    }

    private static List<String> lineas(Context c) throws Exception {
        List<String> out = new ArrayList<>();
        File f = new File(c.getFilesDir(), ARCHIVO);
        if (!f.exists()) return out;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            String l;
            while ((l = r.readLine()) != null) if (!l.trim().isEmpty()) out.add(l);
        }
        return out;
    }

    static JSArray leer(Context c) throws Exception {
        synchronized (CANDADO) {
            JSArray a = new JSArray();
            for (String l : lineas(c)) {
                try {
                    a.put(new JSONObject(l));
                } catch (Exception ignorada) {
                    // línea dañada
                }
            }
            return a;
        }
    }

    /** Quita de la cola las primeras [cantidad] notificaciones (ya procesadas por la app). */
    static void borrarPrimeras(Context c, int cantidad) throws Exception {
        synchronized (CANDADO) {
            List<String> todas = lineas(c);
            File f = new File(c.getFilesDir(), ARCHIVO);
            try (FileWriter w = new FileWriter(f, false)) {
                for (int i = Math.min(cantidad, todas.size()); i < todas.size(); i++) {
                    w.write(todas.get(i));
                    w.write("\n");
                }
            }
        }
    }
}
