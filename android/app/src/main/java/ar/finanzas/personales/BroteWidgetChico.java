package ar.finanzas.personales;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget chico (2 × 2): plata hasta cobrar y botón Anotar. */
public class BroteWidgetChico extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Brote.vistaChica(c));
    }
}
