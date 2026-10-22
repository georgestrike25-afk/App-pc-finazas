package ar.finanzas.personales;

import android.app.Activity;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

/**
 * Anotación rápida (desde el widget o un aviso): Gasto / Ingreso / Compartido, el monto con un
 * teclado numérico y cuatro categorías generales. Se guarda en la cola local y la app lo registra.
 */
public class AnotarActivity extends Activity {
    private static final String[][] CATEGORIAS = {
        {"dia", "Día a día"}, {"transporte", "Transporte"}, {"servicios", "Servicios"}, {"otros", "Otros"},
    };
    private static final int[] ICONOS = {R.drawable.ic_cat_dia, R.drawable.ic_cat_transporte, R.drawable.ic_cat_servicios, R.drawable.ic_cat_otros};

    private String tipo = "gasto";
    private String categoria = "dia";
    private final StringBuilder entrada = new StringBuilder();
    private TextView monto;
    private TextView guardar;
    private LinearLayout tipos;
    private LinearLayout cats;
    private boolean oscuro;

    private String modo;
    private String clave;
    private String descripcion;
    private String cuenta;
    private long fecha;
    private boolean transferencia;

    private int color(int id) {
        return getColor(id);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private GradientDrawable fondo(int colorRelleno, float radio, int borde) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(colorRelleno);
        g.setCornerRadius(dp(radio));
        if (borde != 0) g.setStroke(dp(1.5f), borde);
        return g;
    }

    private TextView texto(String t, float sp, boolean negrita, int colorTexto) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        v.setTextColor(colorTexto);
        if (negrita) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        oscuro = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        Intent i = getIntent();
        modo = i.getStringExtra("modo");
        tipo = i.getStringExtra("tipo") != null ? i.getStringExtra("tipo") : "gasto";
        clave = i.getStringExtra("clave");
        descripcion = i.getStringExtra("descripcion");
        cuenta = i.getStringExtra("cuenta");
        fecha = i.getLongExtra("fecha", System.currentTimeMillis());
        transferencia = i.getBooleanExtra("transferencia", false);
        long inicial = i.getLongExtra("monto", 0);
        if (inicial > 0) {
            entrada.append(inicial / 100);
            if (inicial % 100 != 0) entrada.append(',').append(String.format(Locale.ROOT, "%02d", inicial % 100));
        }
        construir();
    }

    private void construir() {
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(oscuro ? 0x99000000 : 0x73000000);
        raiz.setOnClickListener(v -> finish());

        LinearLayout hoja = new LinearLayout(this);
        hoja.setOrientation(LinearLayout.VERTICAL);
        hoja.setClickable(true);
        GradientDrawable fh = new GradientDrawable();
        fh.setColor(color(R.color.brote_superficie));
        float r = dp(26);
        fh.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        hoja.setBackground(fh);
        hoja.setPadding(dp(18), dp(10), dp(18), dp(22));
        FrameLayout.LayoutParams ph = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        raiz.addView(hoja, ph);

        View agarre = new View(this);
        agarre.setBackground(fondo(color(R.color.brote_borde_fuerte), 2, 0));
        LinearLayout.LayoutParams pa = new LinearLayout.LayoutParams(dp(36), dp(4));
        pa.gravity = Gravity.CENTER_HORIZONTAL;
        pa.bottomMargin = dp(12);
        hoja.addView(agarre, pa);

        // Encabezado: logo, título y de dónde vino
        LinearLayout cab = new LinearLayout(this);
        cab.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.brote_marca);
        cab.addView(logo, new LinearLayout.LayoutParams(dp(28), dp(28)));
        LinearLayout tt = new LinearLayout(this);
        tt.setOrientation(LinearLayout.VERTICAL);
        tt.setPadding(dp(10), 0, 0, 0);
        tt.addView(texto("reemplazar".equals(modo) ? "Cambiar categoría" : "Anotar", 17, true, color(R.color.brote_texto)));
        String hora = new SimpleDateFormat("HH:mm", new Locale("es", "AR")).format(new Date(fecha));
        String origen = cuenta != null ? (descripcion != null ? descripcion + " · " : "") + cuenta + " · hoy " + hora : "Anotación rápida";
        tt.addView(texto(origen, 12.5f, false, color(R.color.brote_texto2)));
        cab.addView(tt);
        hoja.addView(cab);

        // Tipo: gasto, ingreso o compartido
        tipos = new LinearLayout(this);
        tipos.setBackground(fondo(color(R.color.brote_superficie2), 14, 0));
        tipos.setPadding(dp(4), dp(4), dp(4), dp(4));
        String[][] ts = {{"gasto", "Gasto"}, {"ingreso", "Ingreso"}, {"compartido", "Compartido"}};
        int[] ti = {R.drawable.ic_menos, R.drawable.ic_mas, R.drawable.ic_compartido};
        for (int k = 0; k < ts.length; k++) {
            final String valor = ts[k][0];
            LinearLayout op = new LinearLayout(this);
            op.setGravity(Gravity.CENTER);
            op.setTag(valor);
            op.setPadding(0, dp(9), 0, dp(9));
            ImageView ic = new ImageView(this);
            ic.setImageResource(ti[k]);
            op.addView(ic, new LinearLayout.LayoutParams(dp(16), dp(16)));
            TextView tv = texto(ts[k][1], 14, true, color(R.color.brote_texto2));
            tv.setPadding(dp(6), 0, 0, 0);
            op.addView(tv);
            op.setContentDescription(ts[k][1]);
            op.setOnClickListener(v -> {
                tipo = valor;
                pintar();
            });
            tipos.addView(op, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        }
        LinearLayout.LayoutParams pt = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pt.topMargin = dp(14);
        hoja.addView(tipos, pt);

        // Monto
        monto = texto("", 44, true, color(R.color.brote_texto));
        monto.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams pm = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pm.topMargin = dp(12);
        hoja.addView(monto, pm);

        // Categorías generales
        cats = new LinearLayout(this);
        for (int k = 0; k < CATEGORIAS.length; k++) {
            final String valor = CATEGORIAS[k][0];
            LinearLayout op = new LinearLayout(this);
            op.setOrientation(LinearLayout.VERTICAL);
            op.setGravity(Gravity.CENTER);
            op.setTag(valor);
            op.setPadding(0, dp(10), 0, dp(10));
            ImageView ic = new ImageView(this);
            ic.setImageResource(ICONOS[k]);
            ic.setPadding(dp(8), dp(8), dp(8), dp(8));
            op.addView(ic, new LinearLayout.LayoutParams(dp(36), dp(36)));
            TextView tv = texto(CATEGORIAS[k][1], 12, true, color(R.color.brote_texto2));
            tv.setPadding(0, dp(6), 0, 0);
            op.addView(tv);
            op.setContentDescription(CATEGORIAS[k][1]);
            op.setOnClickListener(v -> {
                categoria = valor;
                pintar();
            });
            LinearLayout.LayoutParams pc = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            if (k > 0) pc.leftMargin = dp(8);
            cats.addView(op, pc);
        }
        LinearLayout.LayoutParams pcs = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pcs.topMargin = dp(12);
        hoja.addView(cats, pcs);

        // Teclado numérico
        String[] teclas = {"1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"};
        LinearLayout fila = null;
        for (int k = 0; k < teclas.length; k++) {
            if (k % 3 == 0) {
                fila = new LinearLayout(this);
                LinearLayout.LayoutParams pf = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
                pf.topMargin = dp(k == 0 ? 14 : 6);
                hoja.addView(fila, pf);
            }
            final String t = teclas[k];
            TextView tecla = texto(t, 20, false, color(R.color.brote_texto));
            tecla.setGravity(Gravity.CENTER);
            tecla.setBackground(fondo(color(R.color.brote_superficie2), 12, 0));
            tecla.setContentDescription(t.equals("⌫") ? "Borrar" : t);
            tecla.setOnClickListener(v -> tecla(t));
            LinearLayout.LayoutParams pk = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            if (k % 3 > 0) pk.leftMargin = dp(6);
            fila.addView(tecla, pk);
        }

        // Acciones
        LinearLayout acc = new LinearLayout(this);
        TextView no = texto(clave != null ? "No registrar" : "Cancelar", 15, true, color(R.color.brote_texto));
        no.setGravity(Gravity.CENTER);
        no.setBackground(fondo(0, 14, color(R.color.brote_borde_fuerte)));
        no.setOnClickListener(v -> noRegistrar());
        acc.addView(no, new LinearLayout.LayoutParams(0, dp(52), 1));
        guardar = texto("Guardar", 15, true, color(R.color.brote_primario_texto));
        guardar.setGravity(Gravity.CENTER);
        guardar.setBackground(fondo(color(R.color.brote_primario), 14, 0));
        guardar.setOnClickListener(v -> guardar());
        LinearLayout.LayoutParams pg = new LinearLayout.LayoutParams(0, dp(52), 1.4f);
        pg.leftMargin = dp(10);
        acc.addView(guardar, pg);
        LinearLayout.LayoutParams pac = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pac.topMargin = dp(16);
        hoja.addView(acc, pac);

        setContentView(raiz);
        pintar();
    }

    private void tecla(String t) {
        if (t.equals("⌫")) {
            if (entrada.length() > 0) entrada.deleteCharAt(entrada.length() - 1);
        } else if (t.equals(",")) {
            if (entrada.indexOf(",") < 0) entrada.append(entrada.length() == 0 ? "0," : ",");
        } else {
            int coma = entrada.indexOf(",");
            if (coma >= 0 && entrada.length() - coma > 2) return; // hasta dos decimales
            if (coma < 0 && entrada.length() >= 9) return;
            if (entrada.toString().equals("0")) entrada.setLength(0);
            entrada.append(t);
        }
        pintar();
    }

    private long centavos() {
        return entrada.length() == 0 ? 0 : Analisis.centavos(entrada.toString().replace(".", ""));
    }

    private void pintar() {
        String e = entrada.toString();
        String ent = e.contains(",") ? e.substring(0, e.indexOf(',')) : e;
        String dec = e.contains(",") ? e.substring(e.indexOf(',')) : "";
        long n = ent.isEmpty() ? 0 : Long.parseLong(ent);
        monto.setText(Brote.pesos(n * 100) + dec);
        boolean listo = centavos() > 0;
        guardar.setAlpha(listo ? 1f : 0.45f);
        guardar.setEnabled(listo);
        for (int k = 0; k < tipos.getChildCount(); k++) {
            LinearLayout op = (LinearLayout) tipos.getChildAt(k);
            boolean on = tipo.equals(op.getTag());
            int fondoOn = oscuro ? color(R.color.brote_lima) : color(R.color.brote_superficie);
            op.setBackground(on ? fondo(fondoOn, 10, 0) : null);
            int c = on ? (oscuro ? color(R.color.brote_bosque) : color(R.color.brote_texto)) : color(R.color.brote_texto2);
            ((TextView) op.getChildAt(1)).setTextColor(c);
            ((ImageView) op.getChildAt(0)).setImageTintList(ColorStateList.valueOf(c));
            op.setSelected(on);
        }
        cats.setVisibility(tipo.equals("ingreso") ? View.GONE : View.VISIBLE);
        for (int k = 0; k < cats.getChildCount(); k++) {
            LinearLayout op = (LinearLayout) cats.getChildAt(k);
            boolean on = categoria.equals(op.getTag());
            op.setBackground(fondo(on ? color(R.color.brote_seleccion) : 0, 14, on ? color(R.color.brote_primario) : color(R.color.brote_borde)));
            ImageView ic = (ImageView) op.getChildAt(0);
            ic.setBackground(fondo(on ? color(R.color.brote_lima) : color(R.color.brote_superficie2), 11, 0));
            ic.setImageTintList(ColorStateList.valueOf(on ? color(R.color.brote_bosque) : color(R.color.brote_texto)));
            ((TextView) op.getChildAt(1)).setTextColor(on ? color(R.color.brote_texto) : color(R.color.brote_texto2));
            op.setSelected(on);
        }
    }

    private void guardar() {
        long c = centavos();
        if (c <= 0) return;
        String etiqueta = "Día a día";
        for (String[] k : CATEGORIAS) if (k[0].equals(categoria)) etiqueta = k[1];
        String concepto = descripcion != null && !descripcion.isEmpty() && !descripcion.equals("Pago") && !descripcion.equals("Transferencia")
                ? descripcion
                : tipo.equals("ingreso") ? "Ingreso" : (transferencia ? "Transferencia" : etiqueta);
        try {
            JSONObject o = new JSONObject();
            o.put("id", UUID.randomUUID().toString());
            o.put("accion", "guardar");
            o.put("tipo", tipo);
            o.put("categoria", categoria);
            o.put("monto", c);
            o.put("descripcion", concepto);
            if (cuenta != null) o.put("cuenta", cuenta);
            o.put("fecha", fecha);
            o.put("transferencia", transferencia);
            if (clave != null) o.put("clave", clave);
            o.put("reemplaza", "reemplazar".equals(modo));
            Brote.agregar(this, o);
        } catch (Exception e) {
            Toast.makeText(this, "No se pudo guardar. Probá de nuevo.", Toast.LENGTH_LONG).show();
            return;
        }
        String que = tipo.equals("ingreso") ? "Ingreso" : tipo.equals("compartido") ? "Compartido" : etiqueta;
        Brote.ultimo(this, "Se sumó: " + concepto, (cuenta != null ? cuenta + " · " : "") + "recién · " + que, tipo.equals("ingreso") ? c : c);
        Brote.resolverPendiente(this, clave);
        Avisos.quitar(this, clave);
        Brote.actualizarWidgets(this);
        Toast.makeText(this, "Anotado: " + Brote.pesos(c), Toast.LENGTH_SHORT).show();
        finish();
    }

    private void noRegistrar() {
        if (clave != null) {
            try {
                JSONObject o = new JSONObject();
                o.put("accion", "reemplazar".equals(modo) ? "deshacer" : "descartar");
                o.put("clave", clave);
                o.put("fecha", System.currentTimeMillis());
                Brote.agregar(this, o);
            } catch (Exception ignorada) {
                // sin cambios
            }
            Brote.resolverPendiente(this, clave);
            Avisos.quitar(this, clave);
            Brote.actualizarWidgets(this);
        }
        finish();
    }
}
