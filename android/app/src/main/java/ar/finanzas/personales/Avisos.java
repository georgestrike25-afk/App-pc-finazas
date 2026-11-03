package ar.finanzas.personales;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Avisos propios de Brote: "Se anotó…" (con Deshacer) y "¿Cuánto fue?" (con Anotar / No registrar). */
final class Avisos {
    private Avisos() {}

    static final String CANAL = "brote_avisos";

    static boolean permitido(Context c) {
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static NotificationManager gestor(Context c) {
        NotificationManager m = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && m.getNotificationChannel(CANAL) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Gastos detectados", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Avisa cuando Brote anota un gasto solo o cuando un aviso no trae el monto.");
            m.createNotificationChannel(ch);
        }
        return m;
    }

    static int id(String clave) {
        return clave == null ? 0 : clave.hashCode();
    }

    private static Notification.Builder base(Context c) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CANAL) : new Notification.Builder(c);
        return b.setSmallIcon(R.drawable.ic_notif_brote).setColor(0xFF123C3A).setAutoCancel(true).setShowWhen(true);
    }

    private static PendingIntent accion(Context c, String accion, String clave) {
        Intent i = new Intent(c, AccionReceiver.class);
        i.setAction(accion);
        i.putExtra("clave", clave);
        return PendingIntent.getBroadcast(c, (accion + clave).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent anotar(Context c, String modo, String clave, long monto, String descripcion, String cuenta, long fecha, boolean transferencia) {
        Intent i = new Intent(c, AnotarActivity.class);
        i.putExtra("modo", modo);
        i.putExtra("tipo", "gasto");
        i.putExtra("clave", clave);
        i.putExtra("monto", monto);
        i.putExtra("descripcion", descripcion);
        i.putExtra("cuenta", cuenta);
        i.putExtra("fecha", fecha);
        i.putExtra("transferencia", transferencia);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return PendingIntent.getActivity(c, (modo + clave).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "Se anotó $ 4.500" con Deshacer y Cambiar categoría. */
    static void anotado(Context c, String clave, long monto, String descripcion, String cuenta, long fecha, boolean transferencia) {
        if (!permitido(c)) return;
        Notification n = base(c)
                .setContentTitle("Se anotó " + Brote.pesos(monto))
                .setContentText(descripcion + " · " + cuenta + ". Se descuenta de tu plata hasta cobrar.")
                .setStyle(new Notification.BigTextStyle().bigText(descripcion + " · " + cuenta + ". Se descuenta de tu plata hasta cobrar."))
                .setContentIntent(Brote.abrirApp(c, id(clave)))
                .addAction(new Notification.Action.Builder(null, "Deshacer", accion(c, AccionReceiver.DESHACER, clave)).build())
                .addAction(new Notification.Action.Builder(null, "Cambiar categoría", anotar(c, "reemplazar", clave, monto, descripcion, cuenta, fecha, transferencia)).build())
                .build();
        gestor(c).notify(id(clave), n);
    }

    /** "¿Cuánto fue?" con Anotar y No registrar. */
    static void sinMonto(Context c, String clave, String descripcion, String cuenta, long fecha, boolean transferencia) {
        if (!permitido(c)) return;
        String titulo = transferencia ? "¿Cuánto fue? Transferencia" : "¿Cuánto fue? Pago";
        String texto = cuenta + " avisó " + descripcion + " sin el monto.";
        PendingIntent abrir = anotar(c, "sinmonto", clave, 0, transferencia ? "Transferencia" : "Pago", cuenta, fecha, transferencia);
        Notification n = base(c)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setContentIntent(abrir)
                .addAction(new Notification.Action.Builder(null, "Anotar", abrir).build())
                .addAction(new Notification.Action.Builder(null, "No registrar", accion(c, AccionReceiver.DESCARTAR, clave)).build())
                .build();
        gestor(c).notify(id(clave), n);
    }

    static void quitar(Context c, String clave) {
        if (clave != null) gestor(c).cancel(id(clave));
    }
}
