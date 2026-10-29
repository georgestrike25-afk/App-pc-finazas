#!/usr/bin/env python3
"""
Generador de layouts RemoteViews de los widgets de Aura.

RemoteViews no permite cambiar en tiempo de ejecución la familia tipográfica ni la sombra del texto,
así que cada composición (tipo × tamaño) se genera en sus variantes de tipografía y sombra. El resto
(colores, tamaños de texto, opacidad, alineación, espaciado y visibilidad) se ajusta en ejecución.

Uso: python3 tools/aura_widgets.py   (desde la raíz del repositorio)
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAYOUT = os.path.join(ROOT, "app", "src", "main", "res", "layout")
KT = os.path.join(ROOT, "app", "src", "main", "java", "app", "aura", "widget", "WidgetLayouts.kt")

TYPES = ["clock", "weather", "duo", "forecast", "night"]
SIZES = ["small", "medium", "large"]
FONTS = [("light", "sans-serif-light"), ("regular", "sans-serif"), ("medium", "sans-serif-medium"),
         ("condensed", "sans-serif-condensed"), ("thin", "sans-serif-thin"), ("black", "sans-serif-black"),
         ("serif", "serif"), ("mono", "monospace")]
SHADOWS = [False, True]

NS = 'xmlns:android="http://schemas.android.com/apk/res/android"'


class Ctx:
    def __init__(self, font, shadow, preview=False):
        self.font, self.shadow, self.preview = font, shadow, preview

    def shadow_attrs(self):
        if not self.shadow:
            return ""
        return ' android:shadowColor="#66000000" android:shadowDy="1" android:shadowRadius="6"'

    def sample(self, real, placeholder="—"):
        return real if self.preview else placeholder


def text(c, vid, size, hero=False, default="", extra="", bold=False, width="wrap_content"):
    family = c.font if hero else ("sans-serif-medium" if bold else "sans-serif")
    return (f'<TextView android:id="@+id/{vid}" android:layout_width="{width}" android:layout_height="wrap_content"'
            f' android:fontFamily="{family}" android:textSize="{size}sp" android:textColor="#FFFFFFFF"'
            f' android:maxLines="1" android:includeFontPadding="false" android:text="{default}"{c.shadow_attrs()}{extra} />')


def clock_row(c, size):
    ampm = max(12, round(size * 0.28))
    return (f'<LinearLayout android:id="@+id/w_time_row" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:orientation="horizontal" android:baselineAligned="true">'
            f'<TextClock android:id="@+id/w_time" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:fontFamily="{c.font}" android:textSize="{size}sp" android:textColor="#FFFFFFFF" android:maxLines="1"'
            f' android:includeFontPadding="false" android:format12Hour="h:mm" android:format24Hour="HH:mm"'
            f' android:letterSpacing="-0.02"{c.shadow_attrs()} />'
            # Variante «horas en negrita»: dos TextClock (horas / :minutos) que el renderizador alterna con w_time.
            f'<TextClock android:id="@+id/w_time_h" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:fontFamily="sans-serif-medium" android:textStyle="bold" android:textSize="{size}sp" android:textColor="#FFFFFFFF"'
            f' android:maxLines="1" android:includeFontPadding="false" android:format12Hour="h" android:format24Hour="HH"'
            f' android:visibility="gone"{c.shadow_attrs()} />'
            f'<TextClock android:id="@+id/w_time_m" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:fontFamily="{c.font}" android:textSize="{size}sp" android:textColor="#FFFFFFFF" android:maxLines="1"'
            f' android:includeFontPadding="false" android:format12Hour=":mm" android:format24Hour=":mm"'
            f' android:visibility="gone"{c.shadow_attrs()} />'
            f'<TextClock android:id="@+id/w_ampm" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:layout_marginStart="4dp" android:fontFamily="sans-serif" android:textSize="{ampm}sp"'
            f' android:textColor="#FFFFFFFF" android:maxLines="1" android:includeFontPadding="false"'
            f' android:format12Hour="a" android:format24Hour="" android:visibility="gone"{c.shadow_attrs()} />'
            f'</LinearLayout>')


def date(c, size, margin=2):
    return (f'<TextClock android:id="@+id/w_date" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:layout_marginTop="{margin}dp" android:fontFamily="sans-serif" android:textSize="{size}sp"'
            f' android:textColor="#FFFFFFFF" android:maxLines="1" android:includeFontPadding="false"'
            f' android:format12Hour="EEE d MMM" android:format24Hour="EEE d MMM"{c.shadow_attrs()} />')


def icon(prefix, dp, margin=""):
    return (f'<FrameLayout android:id="@+id/{prefix}" android:layout_width="{dp}dp" android:layout_height="{dp}dp"{margin}>'
            f'<ImageView android:id="@+id/{prefix}_base" android:layout_width="match_parent" android:layout_height="match_parent"'
            f' android:importantForAccessibility="no" android:scaleType="fitCenter" android:src="@drawable/ic_wx_partly_cloudy_day_base" />'
            f'<ImageView android:id="@+id/{prefix}_accent" android:layout_width="match_parent" android:layout_height="match_parent"'
            f' android:importantForAccessibility="no" android:scaleType="fitCenter" android:src="@drawable/ic_wx_partly_cloudy_day_accent" />'
            f'<ImageView android:id="@+id/{prefix}_3d" android:layout_width="match_parent" android:layout_height="match_parent"'
            f' android:importantForAccessibility="no" android:scaleType="fitCenter" android:visibility="gone" />'
            f'</FrameLayout>')


def temp(c, size, vid="w_temp"):
    return text(c, vid, size, hero=True, default=c.sample("21°", "—°"))


def place(c, size=13, margin=""):
    return text(c, "w_place", size, default=c.sample("Madrid", ""), extra=margin + ' android:ellipsize="end"')


def hilo(c, size=13, margin=""):
    return text(c, "w_hilo", size, default=c.sample("24° / 14°", ""), extra=margin)


def condition(c, size=14, margin=""):
    return text(c, "w_condition", size, default=c.sample("Parcialmente nublado", ""), bold=True, extra=margin + ' android:ellipsize="end"')


def status(c, size=11, margin=' android:layout_marginTop="2dp"'):
    return text(c, "w_status", size, default="", extra=margin + ' android:visibility="gone"')


def col(vid, children, gravity="start", extra=""):
    return (f'<LinearLayout android:id="@+id/{vid}" android:layout_width="wrap_content" android:layout_height="wrap_content"'
            f' android:orientation="vertical" android:gravity="{gravity}"{extra}>' + "".join(children) + '</LinearLayout>')


def row(vid, children, gravity="center_vertical", extra="", width="wrap_content"):
    return (f'<LinearLayout android:id="@+id/{vid}" android:layout_width="{width}" android:layout_height="wrap_content"'
            f' android:orientation="horizontal" android:gravity="{gravity}"{extra}>' + "".join(children) + '</LinearLayout>')


def divider(vertical=True):
    if vertical:
        return ('<ImageView android:id="@+id/w_divider" android:layout_width="1dp" android:layout_height="40dp"'
                ' android:layout_marginStart="16dp" android:layout_marginEnd="16dp" android:importantForAccessibility="no"'
                ' android:scaleType="fitXY" android:src="@drawable/widget_hairline" />')
    return ('<ImageView android:id="@+id/w_divider" android:layout_width="match_parent" android:layout_height="1dp"'
            ' android:layout_marginTop="10dp" android:layout_marginBottom="8dp" android:importantForAccessibility="no"'
            ' android:scaleType="fitXY" android:src="@drawable/widget_hairline" />')


def hours(c, n, time_sp=12, icon_dp=24, temp_sp=13, margin_top=10):
    cells = []
    for i in range(n):
        cells.append(
            f'<LinearLayout android:id="@+id/w_h{i}" android:layout_width="0dp" android:layout_height="wrap_content"'
            f' android:layout_weight="1" android:orientation="vertical" android:gravity="center_horizontal">'
            + text(c, f"w_h{i}_time", time_sp, default=c.sample(f"{14 + i} h", ""))
            + icon(f"w_h{i}_icon", icon_dp, ' android:layout_marginTop="4dp" android:layout_marginBottom="4dp"')
            + text(c, f"w_h{i}_temp", temp_sp, default=c.sample(f"{21 - i}°", ""))
            + '</LinearLayout>')
    return (f'<LinearLayout android:id="@+id/w_hours" android:layout_width="match_parent" android:layout_height="wrap_content"'
            f' android:layout_marginTop="{margin_top}dp" android:orientation="horizontal" android:baselineAligned="false">'
            + "".join(cells) + '</LinearLayout>')


def days(c, n):
    rows = []
    for i in range(n):
        rows.append(
            f'<LinearLayout android:id="@+id/w_d{i}" android:layout_width="match_parent" android:layout_height="wrap_content"'
            f' android:layout_marginTop="6dp" android:orientation="horizontal" android:gravity="center_vertical">'
            + text(c, f"w_d{i}_name", 14, default=c.sample(["Hoy", "jue", "vie", "sáb", "dom"][i], ""),
                   width="0dp", extra=' android:layout_weight="1"')
            + icon(f"w_d{i}_icon", 22, ' android:layout_marginStart="8dp" android:layout_marginEnd="12dp"')
            + text(c, f"w_d{i}_range", 14, default=c.sample(f"{24 - i}° / {14 - i}°", ""), extra=' android:minWidth="72dp" android:gravity="end"')
            + '</LinearLayout>')
    return (f'<LinearLayout android:id="@+id/w_days" android:layout_width="match_parent" android:layout_height="wrap_content"'
            f' android:orientation="vertical">' + "".join(rows) + '</LinearLayout>')


def spacer_w(dp):
    return f'<FrameLayout android:layout_width="{dp}dp" android:layout_height="1dp" />'


def flex():
    return '<FrameLayout android:layout_width="0dp" android:layout_height="1dp" android:layout_weight="1" />'


ML = ' android:layout_marginStart="{}dp"'
MT = ' android:layout_marginTop="{}dp"'


def composition(t, s, c):
    """Devuelve (orientación del contenedor, hijos)."""
    if t == "clock":
        if s == "small":
            return "vertical", [clock_row(c, 44)]
        if s == "medium":
            return "vertical", [clock_row(c, 58), date(c, 14, 4)]
        return "vertical", [clock_row(c, 84), date(c, 17, 6)]
    if t == "weather":
        if s == "small":
            return "vertical", [icon("w_icon", 30), temp(c, 24).replace('/>', ' android:layout_marginTop="2dp" />', 1)]
        if s == "medium":
            return "horizontal", [icon("w_icon", 44), spacer_w(10), temp(c, 44),
                                  col("w_col", [place(c), hilo(c, 13, MT.format(2)), status(c)], extra=ML.format(12))]
        return "horizontal", [icon("w_icon", 52), spacer_w(12), temp(c, 52),
                              col("w_col", [condition(c), place(c, 13, MT.format(2)), hilo(c, 13, MT.format(2)), status(c)],
                                  extra=ML.format(14))]
    if t == "duo":
        if s == "small":
            return "vertical", [clock_row(c, 44),
                                row("w_wx_row", [icon("w_icon", 20), spacer_w(6), temp(c, 18), place(c, 13, ML.format(8))],
                                    extra=MT.format(4))]
        if s == "medium":
            return "horizontal", [col("w_clock_col", [clock_row(c, 56), date(c, 13, 4)]), divider(True),
                                  col("w_col", [row("w_wx_row", [icon("w_icon", 30), spacer_w(8), temp(c, 30)]),
                                                place(c, 13, MT.format(4)), status(c)])]
        return "vertical", [clock_row(c, 76), date(c, 15, 4),
                            row("w_wx_row", [icon("w_icon", 32), spacer_w(10), temp(c, 32),
                                             col("w_col", [condition(c, 13), text(c, "w_meta", 12, default=c.sample("Madrid · 24° / 14°", ""), extra=MT.format(2)), status(c)],
                                                 extra=ML.format(12))], extra=MT.format(14))]
    if t == "forecast":
        if s == "small":
            return "horizontal", [icon("w_icon", 34), spacer_w(8), temp(c, 34), spacer_w(14),
                                  '<LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical">'
                                  + hours(c, 3, 11, 20, 12, 0) + '</LinearLayout>']
        top = row("w_top", [col("w_clock_col", [clock_row(c, 44 if s == "medium" else 52),
                                               date(c, 13, 4)] if s == "large" else [clock_row(c, 44)]),
                            flex(),
                            col("w_col", [row("w_wx_row", [icon("w_icon", 30), spacer_w(8), temp(c, 30 if s == "medium" else 34)]),
                                          place(c, 12, MT.format(2)), status(c)], gravity="end")],
                  width="match_parent")
        if s == "medium":
            return "vertical", [top, hours(c, 5)]
        return "vertical", [top, hours(c, 6, margin_top=14), divider(False), days(c, 5)]
    if t == "night":
        if s == "small":
            return "vertical", [clock_row(c, 40),
                                row("w_wx_row", [icon("w_icon", 18), spacer_w(6), temp(c, 16)], extra=MT.format(4))]
        if s == "medium":
            return "horizontal", [clock_row(c, 56), flex(),
                                  col("w_col", [row("w_wx_row", [icon("w_icon", 24), spacer_w(6), temp(c, 20)]),
                                                date(c, 12, 4)], gravity="end")]
        return "vertical", [clock_row(c, 80), date(c, 15, 4),
                            row("w_wx_row", [icon("w_icon", 22), spacer_w(8), temp(c, 22), condition(c, 13, ML.format(10))],
                                extra=MT.format(12))]
    raise ValueError(t)


def main_icon_dp(t, s):
    import re
    _, children = composition(t, s, Ctx("sans-serif", False))
    m = re.search(r'android:id="@\+id/w_icon" android:layout_width="(\d+)dp"', "".join(children))
    return int(m.group(1)) if m else 0


def layout_xml(t, s, c):
    orientation, children = composition(t, s, c)
    body = "\n        ".join(children)
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por tools/aura_widgets.py ({t} · {s}). No editar a mano. -->
<FrameLayout {NS}
    android:id="@android:id/background"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView android:id="@+id/w_scene" android:layout_width="match_parent" android:layout_height="match_parent"
        android:importantForAccessibility="no" android:scaleType="centerCrop"
        android:background="@drawable/widget_scene_outline" android:clipToOutline="true"
        android:visibility="gone" />

    <ImageView android:id="@+id/w_bg" android:layout_width="match_parent" android:layout_height="match_parent"
        android:importantForAccessibility="no" android:scaleType="fitXY"
        android:src="@drawable/{'widget_panel_preview' if c.preview else 'widget_panel'}"
        android:visibility="{'visible' if c.preview else 'gone'}" />

    <ImageView android:id="@+id/w_edge" android:layout_width="match_parent" android:layout_height="match_parent"
        android:importantForAccessibility="no" android:scaleType="fitXY" android:src="@drawable/widget_panel_edge"
        android:visibility="gone" />

    <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
        android:orientation="{orientation}" android:gravity="center_vertical|start" android:padding="14dp">
        {body}
    </LinearLayout>
</FrameLayout>
'''


def main():
    os.makedirs(LAYOUT, exist_ok=True)
    for old in os.listdir(LAYOUT):
        if old.startswith("w_") and old.endswith(".xml"):
            os.remove(os.path.join(LAYOUT, old))
    names = []
    for t in TYPES:
        for s in SIZES:
            for fname, family in FONTS:
                for sh in SHADOWS:
                    name = f"w_{t}_{s}_{fname}{'_sh' if sh else ''}"
                    with open(os.path.join(LAYOUT, name + ".xml"), "w", encoding="utf-8") as fh:
                        fh.write(layout_xml(t, s, Ctx(family, sh)))
                    names.append(name)
        # Vista previa del selector de widgets (Android 12+): composición mediana con valores de muestra.
        with open(os.path.join(LAYOUT, f"w_{t}_preview.xml"), "w", encoding="utf-8") as fh:
            fh.write(layout_xml(t, "medium" if t != "forecast" else "medium", Ctx("sans-serif-light", True, preview=True)))

    kt = [
        "// Generado por tools/aura_widgets.py. No editar a mano.",
        "package app.aura.widget",
        "",
        "import app.aura.R",
        "import app.aura.core.style.FontChoice",
        "import app.aura.core.widget.SizeClass",
        "import app.aura.core.widget.WidgetType",
        "",
        "object WidgetLayouts {",
        "    fun layout(type: WidgetType, size: SizeClass, font: FontChoice, shadow: Boolean): Int =",
        "        TABLE[((type.ordinal * SizeClass.entries.size + size.ordinal) * FontChoice.entries.size + font.ordinal) * 2 + if (shadow) 1 else 0]",
        "",
        "    private val TABLE = intArrayOf(",
    ]
    kt += [f"        R.layout.{n}," for n in names]
    kt += ["    )", ""]
    kt += ["    /** Tamaño base (dp) del icono principal de cada composición; 0 si no tiene. */",
           "    fun iconDp(type: WidgetType, size: SizeClass): Int = ICON_DP[type.ordinal * SizeClass.entries.size + size.ordinal]", "",
           "    private val ICON_DP = intArrayOf(" + ", ".join(str(main_icon_dp(t, z)) for t in TYPES for z in SIZES) + ")", "}", ""]
    os.makedirs(os.path.dirname(KT), exist_ok=True)
    with open(KT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(kt))
    print(f"{len(names)} layouts de widget + {len(TYPES)} vistas previas generados")


if __name__ == "__main__":
    main()
