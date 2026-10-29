package ar.finanzas.personales;

import android.content.Context;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Modo pareja sin depender de la PC: el celular recibe la sincronización del otro celular por el Wi-Fi.
 * Es el mismo protocolo que el servidor de la PC (versión + If-Match) pero solo para el espacio de
 * pareja y con su token. Guarda el bloque cifrado tal como llega: el celular no lo puede leer sin la frase.
 * Sigue andando en segundo plano mientras el proceso de Brote esté vivo (por ejemplo, con la lectura
 * de notificaciones activada).
 */
final class ServidorPareja {
    private ServidorPareja() {}

    static final int PUERTO = 8797;
    private static final int MAX_CUERPO = 8 * 1024 * 1024;

    private static ServerSocket socket;
    private static ExecutorService hilos;
    private static String token;
    private static String espacio;
    private static File dir;
    private static Context app;
    private static long ultimoAviso;
    private static final Object LOCK = new Object();

    static void configurar(Context c, String tok, String space, String yo) {
        Brote.prefs(c).edit().putString("parejaToken", tok).putString("parejaEspacio", space).putString("parejaYo", yo == null ? "" : yo).apply();
        iniciar(c);
    }

    static void olvidar(Context c) {
        Brote.prefs(c).edit().remove("parejaToken").remove("parejaEspacio").apply();
        detener();
    }

    /** Arranca el servidor si el modo pareja está configurado (no hace nada si ya está andando). */
    static synchronized void iniciar(Context c) {
        String tok = Brote.prefs(c).getString("parejaToken", null);
        String sp = Brote.prefs(c).getString("parejaEspacio", null);
        if (tok == null || sp == null || !sp.matches("pareja-[A-Za-z0-9_-]{3,56}")) return;
        token = tok;
        espacio = sp;
        app = c.getApplicationContext();
        dir = new File(c.getFilesDir(), "pareja");
        if (socket != null && !socket.isClosed()) return;
        try {
            ServerSocket s = new ServerSocket();
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(PUERTO));
            socket = s;
            hilos = Executors.newFixedThreadPool(4);
            Thread t = new Thread(() -> aceptar(s), "brote-pareja");
            t.setDaemon(true);
            t.start();
        } catch (Exception e) {
            socket = null;
        }
    }

    static synchronized void detener() {
        try {
            if (socket != null) socket.close();
        } catch (Exception ignorada) {
            // ya estaba cerrado
        }
        socket = null;
        if (hilos != null) hilos.shutdownNow();
        hilos = null;
    }

    static boolean andando() {
        return socket != null && !socket.isClosed();
    }

    /** Direcciones de este celular en el Wi-Fi (o en el hotspot que comparte). */
    static List<String> direcciones() {
        List<String> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName().toLowerCase(Locale.ROOT);
                if (n.startsWith("rmnet") || n.startsWith("ccmni") || n.startsWith("dummy") || n.startsWith("tun")) continue; // datos móviles y VPN
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    String u = "http://" + a.getHostAddress() + ":" + PUERTO;
                    if (n.startsWith("wlan")) out.add(0, u);
                    else out.add(u);
                }
            }
        } catch (Exception ignorada) {
            // sin red
        }
        return out;
    }

    private static void aceptar(ServerSocket s) {
        while (!s.isClosed()) {
            try {
                Socket cli = s.accept();
                cli.setSoTimeout(15000);
                ExecutorService h = hilos;
                if (h == null) {
                    cli.close();
                    break;
                }
                h.execute(() -> atender(cli));
            } catch (Exception e) {
                if (s.isClosed()) break;
            }
        }
    }

    private static String leer(File f) throws Exception {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static String linea(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 8192) throw new Exception("línea larga");
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("UTF-8");
    }

    private static void atender(Socket cli) {
        try (Socket s = cli) {
            InputStream in = new BufferedInputStream(s.getInputStream());
            OutputStream out = s.getOutputStream();
            String req = linea(in);
            if (req == null) return;
            String[] partes = req.split(" ");
            if (partes.length < 2) return;
            String metodo = partes[0];
            String ruta = partes[1];
            Map<String, String> h = new HashMap<>();
            String l;
            while ((l = linea(in)) != null && !l.isEmpty()) {
                int i = l.indexOf(':');
                if (i > 0) h.put(l.substring(0, i).trim().toLowerCase(Locale.ROOT), l.substring(i + 1).trim());
            }
            int largo = 0;
            try {
                largo = Integer.parseInt(valor(h, "content-length", "0"));
            } catch (NumberFormatException ignorada) {
                // sin cuerpo
            }
            if (largo < 0 || largo > MAX_CUERPO) {
                responder(out, h, 413, "{\"error\":\"too large\"}");
                return;
            }
            byte[] cuerpo = new byte[largo];
            int leido = 0;
            while (leido < largo) {
                int n = in.read(cuerpo, leido, largo - leido);
                if (n < 0) break;
                leido += n;
            }
            // Lo que llega de otro dispositivo (no de este mismo celular) se avisa con una notificación.
            if (!s.getInetAddress().isLoopbackAddress()) h.put("x-brote-remoto", "1");
            manejar(out, h, metodo, ruta, new String(cuerpo, 0, leido, StandardCharsets.UTF_8));
        } catch (Exception ignorada) {
            // conexión cortada
        }
    }

    /**
     * El otro celular dejó cambios mientras Brote estaba cerrado: se avisa para abrir Brote (el contenido
     * está cifrado; los detalles se ven al abrir la app). Como mucho un aviso cada 2 minutos.
     */
    private static void avisarLlegada() {
        Context c = app;
        long ahora = System.currentTimeMillis();
        if (c == null || ahora - ultimoAviso < 120_000) return;
        ultimoAviso = ahora;
        String nombre = Brote.prefs(c).getString("parejaNombre", "");
        if (nombre.isEmpty()) nombre = "Tu pareja";
        Avisos.pareja(c, "llegada", nombre + " actualizó los gastos compartidos", "Abrí Brote para verlos: tu parte se suma sola.");
    }

    private static String valor(Map<String, String> h, String k, String def) {
        String v = h.get(k);
        return v == null ? def : v;
    }

    private static boolean autorizado(Map<String, String> h) {
        String a = valor(h, "authorization", "");
        String t = token;
        if (t == null || !a.startsWith("Bearer ")) return false;
        return MessageDigest.isEqual(a.substring(7).getBytes(StandardCharsets.UTF_8), t.getBytes(StandardCharsets.UTF_8));
    }

    private static void manejar(OutputStream out, Map<String, String> h, String metodo, String ruta, String cuerpo) throws Exception {
        if (metodo.equals("OPTIONS")) {
            responder(out, h, 204, null);
            return;
        }
        if (!autorizado(h)) {
            responder(out, h, 401, "{\"error\":\"unauthorized\"}");
            return;
        }
        String camino = ruta;
        String consulta = "";
        int q = ruta.indexOf('?');
        if (q >= 0) {
            camino = ruta.substring(0, q);
            consulta = ruta.substring(q + 1);
        }
        if (camino.equals("/api/health")) {
            responder(out, h, 200, "{\"ok\":true}");
            return;
        }
        if (!camino.equals("/api/spaces/" + espacio)) {
            responder(out, h, 404, "{\"error\":\"not found\"}");
            return;
        }
        File f = new File(dir, espacio + ".json");
        synchronized (LOCK) {
            JSONObject actual = null;
            if (f.exists()) actual = new JSONObject(leer(f));
            int version = actual == null ? 0 : actual.optInt("version", 0);
            if (metodo.equals("GET")) {
                if (actual == null) {
                    responder(out, h, 404, "{\"error\":\"empty\"}");
                } else if (consulta.equals("known=" + version)) {
                    responder(out, h, 204, null);
                } else {
                    JSONObject r = new JSONObject();
                    r.put("version", version);
                    r.put("blob", actual.optString("blob"));
                    responder(out, h, 200, r.toString());
                }
                return;
            }
            if (metodo.equals("PUT")) {
                String blob;
                try {
                    blob = new JSONObject(cuerpo).getString("blob");
                    JSONObject env = new JSONObject(blob);
                    if (!env.optBoolean("encrypted", false) || !(env.opt("payload") instanceof String)) throw new Exception();
                } catch (Exception e) {
                    responder(out, h, 400, "{\"error\":\"blob must be encrypted\"}");
                    return;
                }
                int si;
                try {
                    si = Integer.parseInt(valor(h, "if-match", "-1"));
                } catch (NumberFormatException e) {
                    si = -1;
                }
                if (si != version) {
                    responder(out, h, 409, "{\"error\":\"conflict\",\"version\":" + version + "}");
                    return;
                }
                JSONObject nuevo = new JSONObject();
                nuevo.put("version", version + 1);
                nuevo.put("blob", blob);
                dir.mkdirs();
                File tmp = new File(dir, espacio + ".tmp");
                try (FileOutputStream o = new FileOutputStream(tmp)) {
                    o.write(nuevo.toString().getBytes(StandardCharsets.UTF_8));
                }
                if (!tmp.renameTo(f)) throw new Exception("no se pudo guardar");
                responder(out, h, 200, "{\"version\":" + (version + 1) + "}");
                // Solo si lo mandó la otra persona (no la PC o el otro celular de uno mismo).
                String quien = h.get("x-brote-miembro");
                String yo = app == null ? null : Brote.prefs(app).getString("parejaYo", null);
                if (h.containsKey("x-brote-remoto") && quien != null && yo != null && !quien.equals(yo)) avisarLlegada();
                return;
            }
        }
        responder(out, h, 405, "{\"error\":\"method not allowed\"}");
    }

    private static void responder(OutputStream out, Map<String, String> h, int estado, String json) throws Exception {
        String texto = estado == 200 ? "OK" : estado == 204 ? "No Content" : estado == 401 ? "Unauthorized" : estado == 404 ? "Not Found" : estado == 409 ? "Conflict" : "Error";
        StringBuilder sb = new StringBuilder();
        sb.append("HTTP/1.1 ").append(estado).append(' ').append(texto).append("\r\n");
        String origen = h.get("origin");
        if (origen != null) {
            sb.append("Access-Control-Allow-Origin: ").append(origen).append("\r\nVary: Origin\r\n");
            sb.append("Access-Control-Allow-Headers: Authorization, Content-Type, If-Match, X-Brote-Miembro\r\n");
            sb.append("Access-Control-Allow-Methods: GET, PUT, OPTIONS\r\nAccess-Control-Max-Age: 600\r\n");
            if (h.containsKey("access-control-request-private-network")) sb.append("Access-Control-Allow-Private-Network: true\r\n");
        }
        byte[] b = json == null ? new byte[0] : json.getBytes(StandardCharsets.UTF_8);
        sb.append("Cache-Control: no-store\r\nConnection: close\r\n");
        if (json != null) sb.append("Content-Type: application/json\r\n");
        sb.append("Content-Length: ").append(b.length).append("\r\n\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.UTF_8));
        out.write(b);
        out.flush();
    }
}
