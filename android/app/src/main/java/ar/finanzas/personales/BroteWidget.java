package ar.finanzas.personales;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget grande (4 × 2): estado, lo último que se anotó y Gasto / Ingreso / Compartido. */
public class BroteWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, Brote.vistaGrande(c));
    }
}
