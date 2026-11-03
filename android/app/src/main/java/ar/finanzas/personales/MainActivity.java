package ar.finanzas.personales;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final List<JSObject> COMPARTIDOS = new ArrayList<>();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotificacionesPlugin.class);
        super.onCreate(savedInstanceState);
        recibir(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recibir(intent);
    }

    static JSArray tomarCompartidos() {
        synchronized (COMPARTIDOS) {
            JSArray a = new JSArray();
            for (JSObject o : COMPARTIDOS) a.put(o);
            COMPARTIDOS.clear();
            return a;
        }
    }

    /**
     * "Compartir → Importar en Brote": copia el archivo (captura, video, PDF, planilla) a la carpeta
     * temporal de la app para que la pantalla "Subir documento" lo lea. No sale del teléfono.
     */
    private void recibir(Intent intent) {
        if (intent == null) return;
        String accion = intent.getAction();
        if (!Intent.ACTION_SEND.equals(accion) && !Intent.ACTION_SEND_MULTIPLE.equals(accion)) return;
        final List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(accion)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else {
            ArrayList<Uri> us = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (us != null) uris.addAll(us);
        }
        intent.setAction(Intent.ACTION_MAIN); // que no se vuelva a importar al girar la pantalla
        if (uris.isEmpty()) return;
        new Thread(() -> {
            File dir = new File(getCacheDir(), "compartido");
            dir.mkdirs();
            for (Uri u : uris) {
                try {
                    String nombre = nombre(u);
                    File destino = new File(dir, System.currentTimeMillis() + "-" + nombre.replaceAll("[^A-Za-z0-9._ -]", "_"));
                    try (InputStream in = getContentResolver().openInputStream(u); OutputStream out = new FileOutputStream(destino)) {
                        if (in == null) continue;
                        byte[] buf = new byte[64 * 1024];
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    JSObject o = new JSObject();
                    o.put("ruta", destino.getAbsolutePath());
                    o.put("nombre", nombre);
                    String tipo = getContentResolver().getType(u);
                    o.put("tipo", tipo == null ? "" : tipo);
                    synchronized (COMPARTIDOS) {
                        COMPARTIDOS.add(o);
                    }
                } catch (Exception ignorada) {
                    // archivo ilegible: se sigue con el resto
                }
            }
            NotificacionesPlugin.avisarCompartido();
        }).start();
    }

    private String nombre(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignorada) {
            // sin nombre
        }
        String last = u.getLastPathSegment();
        return last != null ? last : "archivo";
    }
}
