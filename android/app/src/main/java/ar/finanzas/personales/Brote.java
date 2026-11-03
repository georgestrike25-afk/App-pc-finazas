package ar.finanzas.personales;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Estado compartido entre el lector de notificaciones, los avisos de Brote, la anotación rápida
 * y los widgets. Las anotaciones quedan en una cola local y la app las registra al abrirse
 * (o al instante si está abierta). Nada sale del teléfono.
 */
final class Brote {
    private Brote() {}

    static final String PREFS = "brote_rapido";
    static final String COLA = "anotaciones-rapidas.jsonl";
    private static final Object CANDADO = new Object();

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** "$ 12.500" o "$ 12.500,50" (centavos → pesos, formato argentino). */
    static String pesos(long centavos) {
        long abs = Math.abs(centavos);
        long ent = abs / 100;
        long cen = abs % 100;
        String s = String.valueOf(ent);
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            if (i > 0 && (s.length() - i) % 3 == 0) b.append('.');
            b.append(s.charAt(i));
        }
        return (centavos < 0 ? "-$ " : "$ ") + b + (cen == 0 ? "" : "," + (cen < 10 ? "0" : "") + cen);
    }

    // ----- Cola de anotaciones rápidas -----

    static void agregar(Context c, JSONObject o) {
        synchronized (CANDADO) {
            try (FileWriter w = new FileWriter(new File(c.getFilesDir(), COLA), true)) {
                w.write(o.toString());
                w.write("\n");
            } catch (Exception ignorada) {
                // sin espacio: la anotación se pierde, pero la app sigue funcionando
            }
        }
        NotificacionesPlugin.avisarRapidas();
    }

    private static List<String> lineas(Context c) throws Exception {
        List<String> out = new ArrayList<>();
        File f = new File(c.getFilesDir(), COLA);
        if (!f.exists()) return out;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            String l;
            while ((l = r.readLine()) != null) if (!l.trim().isEmpty()) out.add(l);
        }
        return out;
    }

    static JSONArray leer(Context c) throws Exception {
        synchronized (CANDADO) {
            JSONArray a = new JSONArray();
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

    static void borrarPrimeras(Context c, int cantidad) throws Exception {
        synchronized (CANDADO) {
            List<String> todas = lineas(c);
            try (FileWriter w = new FileWriter(new File(c.getFilesDir(), COLA), false)) {
                for (int i = Math.min(cantidad, todas.size()); i < todas.size(); i++) {
                    w.write(todas.get(i));
                    w.write("\n");
                }
            }
        }
    }

    // ----- Pendientes (avisos sin monto que todavía no se resolvieron) -----

    static void agregarPendiente(Context c, String clave) {
        Set<String> s = new HashSet<>(prefs(c).getStringSet("pendientes", new HashSet<>()));
        s.add(clave);
        prefs(c).edit().putStringSet("pendientes", s).apply();
    }

    static void resolverPendiente(Context c, String clave) {
        if (clave == null) return;
        Set<String> s = new HashSet<>(prefs(c).getStringSet("pendientes", new HashSet<>()));
        if (s.remove(clave)) prefs(c).edit().putStringSet("pendientes", s).apply();
    }

    /** Lo que falta registrar: lo que informó la app la última vez más lo detectado después. */
    static int pendientes(Context c) {
        return prefs(c).getInt("pendientesApp", 0) + prefs(c).getStringSet("pendientes", new HashSet<>()).size();
    }

    static void ultimo(Context c, String titulo, String detalle, long centavos) {
        prefs(c).edit().putString("ultimoT", titulo).putString("ultimoS", detalle).putString("ultimoM", pesos(centavos)).apply();
    }

    // ----- Widgets -----

    static PendingIntent abrirAnotar(Context c, String tipo, int codigo) {
        Intent i = new Intent(c, AnotarActivity.class);
        i.putExtra("tipo", tipo);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(c, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent abrirApp(Context c, int codigo) {
        Intent i = new Intent(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void estado(RemoteViews v, Context c) {
        int n = pendientes(c);
        v.setTextViewText(R.id.w_estado, n == 0 ? "Al día" : n == 1 ? "1 sin registrar" : n + " sin registrar");
        v.setInt(R.id.w_estado, "setBackgroundResource", n == 0 ? R.drawable.w_chip_ok : R.drawable.w_chip_aviso);
        v.setTextColor(R.id.w_estado, c.getColor(n == 0 ? R.color.brote_ok : R.color.brote_aviso));
    }

    static RemoteViews vistaGrande(Context c) {
        SharedPreferences p = prefs(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_brote);
        estado(v, c);
        String t = p.getString("ultimoT", null);
        if (t != null) {
            v.setTextViewText(R.id.w_ultimo_t, t);
            v.setTextViewText(R.id.w_ultimo_s, p.getString("ultimoS", ""));
            v.setTextViewText(R.id.w_ultimo_m, p.getString("ultimoM", ""));
        }
        v.setOnClickPendingIntent(R.id.w_cabecera, abrirApp(c, 10));
        v.setOnClickPendingIntent(R.id.w_ultimo, abrirApp(c, 11));
        v.setOnClickPendingIntent(R.id.w_gasto, abrirAnotar(c, "gasto", 12));
        v.setOnClickPendingIntent(R.id.w_ingreso, abrirAnotar(c, "ingreso", 13));
        v.setOnClickPendingIntent(R.id.w_compartido, abrirAnotar(c, "compartido", 14));
        return v;
    }

    static RemoteViews vistaChica(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_brote_chico);
        estado(v, c);
        v.setTextViewText(R.id.w_plata, prefs(c).getString("plata", "—"));
        v.setOnClickPendingIntent(R.id.w_raiz, abrirApp(c, 20));
        v.setOnClickPendingIntent(R.id.w_anotar, abrirAnotar(c, "gasto", 21));
        return v;
    }

    /** Redibuja todos los widgets de Brote que estén en la pantalla de inicio. */
    static void actualizarWidgets(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] grandes = m.getAppWidgetIds(new ComponentName(c, BroteWidget.class));
            if (grandes.length > 0) m.updateAppWidget(grandes, vistaGrande(c));
            int[] chicos = m.getAppWidgetIds(new ComponentName(c, BroteWidgetChico.class));
            if (chicos.length > 0) m.updateAppWidget(chicos, vistaChica(c));
        } catch (Exception ignorada) {
            // sin widgets o el lanzador no responde
        }
    }
}
