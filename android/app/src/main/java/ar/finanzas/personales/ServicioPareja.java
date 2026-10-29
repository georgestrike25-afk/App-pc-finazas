package ar.finanzas.personales;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Modo pareja con Brote cerrado (opcional): mantiene vivo el "buzón" del celular para que el otro
 * celular le pueda dejar los gastos compartidos aunque no se haya abierto Brote. Android exige mostrar
 * una notificación fija mientras tanto; se puede apagar desde Compartidos.
 */
public class ServicioPareja extends Service {
    static final String CANAL = "brote_conexion";
    private static final int ID = 7300;

    static boolean activo(Context c) {
        return Brote.prefs(c).getBoolean("segundoPlano", false);
    }

    static void cambiar(Context c, boolean on) {
        Brote.prefs(c).edit().putBoolean("segundoPlano", on).apply();
        Intent i = new Intent(c, ServicioPareja.class);
        if (on) {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } else {
            c.stopService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager m = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && m.getNotificationChannel(CANAL) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Recibir gastos compartidos", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Brote queda atento para recibir los gastos compartidos de tu pareja con la app cerrada.");
            ch.setShowBadge(false);
            m.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        Notification n = b.setSmallIcon(R.drawable.ic_notif_brote)
                .setColor(0xFF123C3A)
                .setContentTitle("Brote recibe los gastos compartidos")
                .setContentText("Se puede apagar en Gastos → Compartidos.")
                .setOngoing(true)
                .setShowWhen(false)
                .setContentIntent(Brote.abrirApp(this, ID))
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID, n);
        ServidorPareja.iniciar(getApplicationContext());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!activo(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        ServidorPareja.iniciar(getApplicationContext());
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
