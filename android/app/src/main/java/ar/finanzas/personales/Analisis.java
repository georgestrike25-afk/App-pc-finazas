package ar.finanzas.personales;

import java.text.Normalizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lectura rápida de una notificación financiera, solo para decidir qué aviso de Brote mostrar
 * con la app cerrada. Sigue las mismas reglas que src/notifications/analyzer.ts; la que registra
 * el gasto de verdad es la app (con todas las reglas) cuando se abre.
 */
final class Analisis {
    private Analisis() {}

    enum Tipo { ANOTADO, SIN_MONTO, NADA }

    static final class Resultado {
        Tipo tipo = Tipo.NADA;
        long monto;
        String descripcion = "";
        String cuenta = "";
        boolean transferencia;
    }

    private static final String[] FALLIDAS = {"rechaz", "no pudimos", "no se pudo", "fallo", "cancelad", "revertid", "te pidio", "solicitud de pago", "programaste", "vence", "vencimiento", "resumen esta disponible", "resumen disponible", "ya podes ver tu resumen"};
    private static final String[] PROMOCIONES = {"aprovecha", "descuento", "promo", "beneficio", "cuotas sin interes", "hasta $", "sorteo", "oferta", "te regalamos", "cupon", "prestamo preaprobado", "pedi tu prestamo", "tenes un prestamo", "disponible para", "limite", "invertir", "inverti ", "pedi tu", "ganas", "gana "};
    private static final String[] PROPIAS = {"ingresaste dinero", "ingresaste $", "cargaste", "carga de saldo", "carga de dinero", "entre tus cuentas", "a tu otra cuenta", "moviste dinero", "pagaste tu tarjeta", "pago de tu tarjeta", "pago de tarjeta", "pago tarjeta", "pagaste el resumen", "pagaste tu resumen", "pago del resumen", "pago de resumen", "pago visa", "pago master", "pago amex", "tarjeta credito visa", "tarjeta credito master", "entre cuentas", "otorgamiento adelanto", "cancelacion adelanto", "compra dolar", "compra de dolar", "venta dolar", "venta de dolar"};
    private static final String[] RECIBIDAS = {"te transfirio", "te transfirieron", "te envio", "te enviaron", "recibiste una transferencia", "recibiste dinero", "transferencia recibida", "ingreso de dinero", "ingreso dinero", "te depositaron", "recibiste $"};
    private static final String[] INGRESOS = {"acreditamos", "se acredito", "acreditacion", "recibiste un pago", "cobraste", "rendimiento", "rendiste", "devolucion", "reintegro", "cashback", "te devolvimos"};
    private static final String[] ENVIADAS = {"transferiste", "enviaste", "transferencia enviada", "transferencia realizada", "realizaste una transferencia", "hiciste una transferencia"};
    private static final String[] GASTOS = {"pagaste", "compraste", "compra ", "compra de", "consumo", "pago ", "pago de", "debito", "debitamos", "abonaste", "extrajiste", "retiraste", "realizaste un pago", "usaste tu tarjeta", "con tu tarjeta", "cobro de", "se pago", "se debito"};
    private static final String[] EXPLICITAS = {"pagaste", "compraste", "transferiste", "te transfirio", "recibiste", "enviaste"};

    private static final Pattern EXTRANJERA = Pattern.compile("(US\\$|U\\$S|USD|EUR|€)\\s*\\d", Pattern.CASE_INSENSITIVE);
    private static final Pattern MONTO = Pattern.compile("(?:AR\\$|\\$|ARS)\\s*(-?\\d[\\d.]*(?:,\\d{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern CUOTAS = Pattern.compile("(\\d{1,2} cuotas|\\bcuota\\s*\\d{1,2}\\s*(/|de)\\s*\\d{1,2}|\\bc\\.?\\d{2}/\\d{2})");
    private static final Pattern COMERCIO = Pattern.compile("\\s(?:en|a)\\s+([^.,!\\n$]{2,60}?)(?=\\s+(?:con|por|el|desde|y)\\b|[.,!\\n]|$)");

    static String normalizar(String t) {
        return Normalizer.normalize(t, Normalizer.Form.NFD).replaceAll("\\p{Mn}+", "").toLowerCase().replaceAll("\\s+", " ").trim();
    }

    private static boolean tiene(String n, String[] lista) {
        for (String x : lista) if (n.contains(x)) return true;
        return false;
    }

    static String cuenta(String paquete) {
        String p = paquete.toLowerCase();
        if (p.contains("uala") || p.contains("bancar")) return "Ualá";
        if (p.contains("mercadopago")) return "Mercado Pago";
        if (p.contains("naranja")) return "Naranja X";
        if (p.contains("patagonia")) return "Banco Patagonia";
        if (p.matches("(^|.*\\.)bna.*")) return "BNA+";
        return "Pago sin contacto";
    }

    /** "1.234,56" o "$ 12.500" → centavos (como textoACentavos de la app). */
    static long centavos(String original) {
        String t = original.replaceAll("[\\s\\u00a0$]", "");
        boolean neg = t.startsWith("-");
        if (neg) t = t.substring(1);
        if (t.isEmpty() || !t.matches("[\\d.,]+")) return 0;
        int lp = t.lastIndexOf('.');
        int lc = t.lastIndexOf(',');
        Character dec = null;
        if (lp >= 0 && lc >= 0) dec = lc > lp ? ',' : '.';
        else if (lc >= 0) dec = t.length() - lc - 1 <= 2 && t.indexOf(',') == lc ? ',' : null;
        else if (lp >= 0) dec = t.length() - lp - 1 <= 2 && t.indexOf('.') == lp ? '.' : null;
        String ent = t;
        String frac = "";
        if (dec != null) {
            int i = t.lastIndexOf(dec);
            ent = t.substring(0, i);
            frac = t.substring(i + 1);
        }
        ent = ent.replaceAll("[.,]", "");
        if (!ent.matches("\\d*") || !frac.matches("\\d{0,2}") || (ent.isEmpty() && frac.isEmpty())) return 0;
        try {
            long c = Long.parseLong(ent.isEmpty() ? "0" : ent) * 100 + Long.parseLong((frac + "00").substring(0, 2));
            return neg ? -c : c;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String comercio(String original) {
        Matcher m = COMERCIO.matcher(original);
        while (m.find()) {
            String v = m.group(1).trim();
            String n = normalizar(v);
            if (!n.isEmpty() && !n.startsWith("tu ") && !n.startsWith("su ") && !n.matches("\\d+") && !n.equals("cuotas") && !n.equals("ti")) return v;
        }
        return null;
    }

    static Resultado analizar(String paquete, String titulo, String texto) {
        Resultado r = new Resultado();
        r.cuenta = cuenta(paquete);
        StringBuilder b = new StringBuilder();
        if (titulo != null && !titulo.trim().isEmpty()) b.append(titulo.trim());
        if (texto != null && !texto.trim().isEmpty()) b.append(b.length() > 0 ? ". " : "").append(texto.trim());
        String original = b.toString();
        String n = normalizar(original);
        if (EXTRANJERA.matcher(original).find()) return r;
        Matcher m = MONTO.matcher(original);
        long monto = m.find() ? Math.abs(centavos(m.group(1))) : 0;
        boolean enviada = tiene(n, ENVIADAS);
        if (monto == 0) {
            // Ualá, Mercado Pago o un pago sin contacto avisan a veces sin el importe: se pregunta cuánto fue.
            if (tiene(n, FALLIDAS) || tiene(n, PROPIAS) || tiene(n, RECIBIDAS) || tiene(n, INGRESOS)) return r;
            if (!enviada && (!tiene(n, GASTOS) || tiene(n, PROMOCIONES))) return r;
            r.tipo = Tipo.SIN_MONTO;
            r.transferencia = enviada;
            String c = comercio(original);
            r.descripcion = enviada ? (c != null ? "una transferencia a " + c : "una transferencia") : (c != null ? "un pago en " + c : "un pago");
            return r;
        }
        if (tiene(n, FALLIDAS) || tiene(n, PROPIAS) || tiene(n, RECIBIDAS)) return r;
        if (!enviada && tiene(n, INGRESOS)) return r;
        boolean gasto = enviada || tiene(n, GASTOS) || r.cuenta.equals("Pago sin contacto");
        if (!gasto) return r;
        boolean explicita = false;
        for (String x : EXPLICITAS) if (n.contains(x)) explicita = true;
        if (tiene(n, PROMOCIONES) && !explicita) return r;
        if (!enviada && CUOTAS.matcher(n).find()) return r; // las cuotas llegan con el resumen
        r.tipo = Tipo.ANOTADO;
        r.monto = monto;
        r.transferencia = enviada;
        String c = comercio(original);
        r.descripcion = c != null ? c : enviada ? "Transferencia" : (titulo != null && !titulo.trim().isEmpty() ? titulo.trim() : r.cuenta);
        if (r.descripcion.length() > 60) r.descripcion = r.descripcion.substring(0, 60);
        return r;
    }
}
