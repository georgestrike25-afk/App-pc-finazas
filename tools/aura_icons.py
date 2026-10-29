#!/usr/bin/env python3
"""
Generador de la iconografía de Aura.

Una única descripción geométrica produce:
  * VectorDrawables Android (app/src/main/res/drawable/ic_wx_*_base.xml / *_accent.xml)
  * El icono adaptativo (ic_launcher_background / _foreground / _monochrome)
  * SVG equivalentes para documentación y revisión visual (docs/assets/icons/)

Cada icono meteorológico se divide en dos capas:
  base   -> partes neutras (nubes, niebla, viento, nieve). Se tiñen con el color de icono del widget.
  accent -> partes de color (sol dorado, luna, lluvia, rayo). Se tiñen solo en el modo monocromo.
Así un widget claro puede tener nubes azul noche y sol dorado sin rasterizar nada.

Uso: python3 tools/aura_icons.py   (desde la raíz del repositorio)
"""
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app", "src", "main", "res")
DOCS = os.path.join(ROOT, "docs", "assets", "icons")

SOLAR = "#FFC857"
MOON = "#F3DFA2"
RAIN = "#8CC8EB"
NEUTRAL = "#FFFFFF"
NIGHT = "#101D2B"

# Variante más profunda de cada acento para widgets con tinta oscura (fondos claros).
ACCENT_ON_LIGHT = {SOLAR: "#F0A93A", MOON: "#D69E2E", RAIN: "#2F86BF"}

V = 48          # viewport de los iconos meteorológicos
STROKE = 2.5    # grosor uniforme de línea


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


# ---------------------------------------------------------------- primitivas

def circle_d(cx, cy, r, ccw=False):
    sweep = 0 if ccw else 1
    return (f"M{f(cx - r)},{f(cy)}A{f(r)},{f(r)} 0 1,{sweep} {f(cx + r)},{f(cy)}"
            f"A{f(r)},{f(r)} 0 1,{sweep} {f(cx - r)},{f(cy)}Z")


def line_d(x1, y1, x2, y2):
    return f"M{f(x1)},{f(y1)}L{f(x2)},{f(y2)}"


def rays_d(cx, cy, r1, r2, n, phase=0.0):
    out = []
    for i in range(n):
        a = math.radians(phase + i * 360.0 / n)
        out.append(line_d(cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + r2 * math.cos(a), cy + r2 * math.sin(a)))
    return "".join(out)


def circle_intersections(c1, c2):
    (x1, y1, r1), (x2, y2, r2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(r1 * r1 - a * a, 0))
    xm, ym = x1 + a * (x2 - x1) / d, y1 + a * (y2 - y1) / d
    p1 = (xm + h * (y2 - y1) / d, ym - h * (x2 - x1) / d)
    p2 = (xm - h * (y2 - y1) / d, ym + h * (x2 - x1) / d)
    return p1, p2


def upper(points):
    return min(points, key=lambda p: p[1])


def arc_to(c, p_from, p_to, clockwise=True):
    cx, cy, r = c
    a1 = math.atan2(p_from[1] - cy, p_from[0] - cx)
    a2 = math.atan2(p_to[1] - cy, p_to[0] - cx)
    span = (a2 - a1) % (2 * math.pi) if clockwise else (a1 - a2) % (2 * math.pi)
    large = 1 if span > math.pi else 0
    sweep = 1 if clockwise else 0
    return f"A{f(r)},{f(r)} 0 {large},{sweep} {f(p_to[0])},{f(p_to[1])}"


def cloud_d(circles, bottom, grow=0.0, ccw=False):
    """Nube como unión de círculos (izquierda, superior(es), derecha) sobre una base plana."""
    cs = [(x, y, r + grow) for (x, y, r) in circles]
    b = bottom + grow
    left, right = cs[0], cs[-1]
    lx = left[0] - math.sqrt(left[2] ** 2 - (b - left[1]) ** 2)
    rx = right[0] + math.sqrt(right[2] ** 2 - (b - right[1]) ** 2)
    joints = [upper(circle_intersections(cs[i], cs[i + 1])) for i in range(len(cs) - 1)]
    pts = [(lx, b)] + joints + [(rx, b)]
    if not ccw:
        d = f"M{f(pts[0][0])},{f(pts[0][1])}"
        for i, c in enumerate(cs):
            d += arc_to(c, pts[i], pts[i + 1], clockwise=True)
        return d + "Z"
    rp = list(reversed(pts))
    rc = list(reversed(cs))
    d = f"M{f(rp[0][0])},{f(rp[0][1])}"
    for i, c in enumerate(rc):
        d += arc_to(c, rp[i], rp[i + 1], clockwise=False)
    return d + "Z"


def outside_d(shape_ccw_d, size=V):
    """Región = lienzo menos la forma (la forma debe ir en sentido antihorario)."""
    return f"M-4,-4H{size + 4}V{size + 4}H-4Z" + shape_ccw_d


def crescent_d(cx, cy, r, cut_dx, cut_dy, cut_r):
    outer = (cx, cy, r)
    inner = (cx + cut_dx, cy + cut_dy, cut_r)
    p, q = circle_intersections(outer, inner)
    # Recorre el borde exterior por el lado opuesto al corte y vuelve por el interior.
    mid_angle = math.atan2(-cut_dy, -cut_dx)
    far = (cx + r * math.cos(mid_angle), cy + r * math.sin(mid_angle))

    def ang(pt, c):
        return math.atan2(pt[1] - c[1], pt[0] - c[0])

    # Elegir el orden de p,q de forma que recorrer en sentido horario desde p pase por "far".
    def passes(a_from, a_to, a_mid):
        span = (a_to - a_from) % (2 * math.pi)
        return (a_mid - a_from) % (2 * math.pi) < span

    if not passes(ang(p, outer), ang(q, outer), ang(far, outer)):
        p, q = q, p
    d = f"M{f(p[0])},{f(p[1])}" + arc_to(outer, p, q, clockwise=True)
    d += arc_to(inner, q, p, clockwise=False) + "Z"
    return d


def sparkle_d(cx, cy, s):
    return line_d(cx - s, cy, cx + s, cy) + line_d(cx, cy - s, cx, cy + s)


def flake_d(cx, cy, s):
    out = ""
    for k in range(3):
        a = math.radians(90 + k * 60)
        out += line_d(cx - s * math.cos(a), cy - s * math.sin(a), cx + s * math.cos(a), cy + s * math.sin(a))
    return out


# --------------------------------------------------------------- elementos

class El:
    """Elemento dibujable: trazo o relleno, con recorte opcional (región a conservar)."""

    def __init__(self, d, stroke=None, fill=None, width=STROKE, clip=None):
        self.d, self.stroke, self.fill, self.width, self.clip = d, stroke, fill, width, clip


def S(d, color=NEUTRAL, width=STROKE, clip=None):
    return El(d, stroke=color, width=width, clip=clip)


def F(d, color=NEUTRAL, clip=None):
    return El(d, fill=color, clip=clip)


# Geometría de nubes compartida
# (círculos izquierda→derecha, base). Los círculos extremos sobrepasan la base ~1.5 para redondear las esquinas.
CLOUD_PARTLY = ([(19.0, 35.0, 5.5), (27.5, 29.0, 8.5), (35.5, 34.0, 6.5)], 39.0)
CLOUD_HIGH = ([(14.5, 26.0, 6.0), (24.5, 19.0, 9.5), (33.5, 25.0, 7.0)], 30.5)
CLOUD_FRONT = ([(15.5, 35.5, 6.0), (25.5, 28.5, 9.0), (34.0, 34.5, 6.5)], 40.0)
CLOUD_BACK = ([(12.0, 25.0, 4.5), (20.0, 17.5, 7.5), (28.5, 23.0, 5.5)], 28.0)


def cloud(spec, clip=None):
    return S(cloud_d(*spec), clip=clip)


def outside_cloud(spec, gap=2.6):
    circles, bottom = spec
    return outside_d(cloud_d(circles, bottom, grow=gap, ccw=True))


def sun(cx, cy, disc, r1, r2, n=8, clip=None, color=SOLAR):
    return [F(circle_d(cx, cy, disc), color, clip=clip), S(rays_d(cx, cy, r1, r2, n), color, clip=clip)]


def icons():
    part_clip = outside_cloud(CLOUD_PARTLY)
    return {
        "clear_day": {"base": [], "accent": sun(24, 24, 7.5, 12, 17)},
        "clear_night": {
            "base": [],
            "accent": [F(crescent_d(22.5, 25.5, 12.5, 7.5, -6.5, 10.5), MOON),
                       S(sparkle_d(35.5, 11.5, 2.6), MOON, width=2.0),
                       S(sparkle_d(39.5, 22.5, 1.8), MOON, width=1.8)],
        },
        "partly_cloudy_day": {
            "base": [cloud(CLOUD_PARTLY)],
            "accent": sun(17.5, 18.5, 5.8, 9.3, 13.0, clip=part_clip),
        },
        "partly_cloudy_night": {
            "base": [cloud(CLOUD_PARTLY)],
            "accent": [F(crescent_d(17.5, 19.5, 9.5, 5.5, -5.0, 8.0), MOON, clip=part_clip),
                       S(sparkle_d(33.5, 10.5, 2.2), MOON, width=1.8, clip=part_clip)],
        },
        "cloudy": {
            "base": [cloud(CLOUD_BACK, clip=outside_cloud(CLOUD_FRONT)), cloud(CLOUD_FRONT)],
            "accent": [],
        },
        "drizzle": {
            "base": [cloud(CLOUD_HIGH)],
            "accent": [F(circle_d(x, y, 1.45), RAIN) for (x, y) in [(17, 36.5), (25, 36.5), (33, 36.5), (21, 42.5), (29, 42.5)]],
        },
        "rain": {
            "base": [cloud(CLOUD_HIGH)],
            "accent": [S(line_d(x, 35.5, x - 2.6, 42.5), RAIN) for x in (18.5, 26, 33.5)],
        },
        "thunderstorm": {
            "base": [cloud(CLOUD_HIGH)],
            "accent": [F("M26.5,32L19.5,41.2H24.6L21.6,47.5L31.6,37.4H26.6L30.6,32Z", SOLAR)],
        },
        "snow": {
            "base": [cloud(CLOUD_HIGH), S(flake_d(16, 38, 3.3), width=1.9), S(flake_d(24.5, 43.5, 3.3), width=1.9),
                     S(flake_d(33, 38, 3.3), width=1.9)],
            "accent": [],
        },
        "fog": {
            "base": [S(line_d(13, 15.5, 35, 15.5)), S(line_d(8.5, 22.5, 39.5, 22.5)), S(line_d(11, 29.5, 37, 29.5)),
                     S(line_d(16, 36.5, 32, 36.5))],
            "accent": [],
        },
        "wind": {
            "base": [S("M7,19H28.5A5,5 0 1,0 23.5,14"), S("M7,26.5H36A5.5,5.5 0 1,1 30.5,32"), S("M7,34H18")],
            "accent": [],
        },
    }


# ------------------------------------------------------------------ salida

def vd_element(e, color_override=None):
    attrs = [f'android:pathData="{e.d}"']
    if e.fill:
        attrs.append(f'android:fillColor="{color_override or e.fill}"')
    if e.stroke:
        attrs += [f'android:strokeColor="{color_override or e.stroke}"', f'android:strokeWidth="{f(e.width)}"',
                  'android:strokeLineCap="round"', 'android:strokeLineJoin="round"']
    path = "    <path " + "\n        ".join(attrs) + " />\n"
    if e.clip:
        return f'    <group>\n        <clip-path android:pathData="{e.clip}" />\n    ' + path.replace("\n    ", "\n        ") + "    </group>\n"
    return path


def vector_drawable(elements, size_dp=48, viewport=V, extra_ns=""):
    head = (f'<?xml version="1.0" encoding="utf-8"?>\n<!-- Generado por tools/aura_icons.py. No editar a mano. -->\n'
            f'<vector xmlns:android="http://schemas.android.com/apk/res/android"{extra_ns}\n'
            f'    android:width="{size_dp}dp"\n    android:height="{size_dp}dp"\n'
            f'    android:viewportWidth="{viewport}"\n    android:viewportHeight="{viewport}">\n')
    return head + "".join(vd_element(e) for e in elements) + "</vector>\n"


_clip_seq = [0]


def svg_elements(elements, neutral_color=None, accent_override=None):
    out, defs = [], []
    for e in elements:
        color = e.fill or e.stroke
        if accent_override:
            color = accent_override
        elif neutral_color and color == NEUTRAL:
            color = neutral_color
        clip_attr = ""
        if e.clip:
            _clip_seq[0] += 1
            cid = f"c{_clip_seq[0]}"
            defs.append(f'<clipPath id="{cid}"><path d="{e.clip}" clip-rule="nonzero"/></clipPath>')
            clip_attr = f' clip-path="url(#{cid})"'
        if e.fill:
            out.append(f'<path d="{e.d}" fill="{color}"{clip_attr}/>')
        else:
            out.append(f'<path d="{e.d}" fill="none" stroke="{color}" stroke-width="{f(e.width)}" '
                       f'stroke-linecap="round" stroke-linejoin="round"{clip_attr}/>')
    return "".join(defs), "".join(out)


def svg_icon(layers, neutral_color=NEUTRAL, mono=None, size=96, light=False):
    d1, b = svg_elements(layers["base"], neutral_color, mono)
    accent_mono = mono
    if light and layers["accent"]:
        accent_mono = ACCENT_ON_LIGHT.get(layers["accent"][0].fill or layers["accent"][0].stroke)
    d2, a = svg_elements(layers["accent"], neutral_color, accent_mono)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {V} {V}">'
            f'<defs>{d1}{d2}</defs>{b}{a}</svg>')


# ---------------------------------------------------------- icono de marca

L = 108  # viewport del icono adaptativo


def brand_sun(color=SOLAR, cx=54.0, cy=54.0, scale=0.84):
    return [F(circle_d(cx, cy, 12.5 * scale), color),
            S(rays_d(cx, cy, 18.5 * scale, 26.5 * scale, 12, phase=-90), color, width=2.6 * scale)]


def launcher_background_xml():
    return ('<?xml version="1.0" encoding="utf-8"?>\n<!-- Generado por tools/aura_icons.py. No editar a mano. -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    xmlns:aapt="http://schemas.android.com/aapt"\n'
            '    android:width="108dp"\n    android:height="108dp"\n'
            '    android:viewportWidth="108"\n    android:viewportHeight="108">\n'
            f'    <path android:pathData="M0,0h108v108h-108z" android:fillColor="{NIGHT}" />\n'
            '    <path android:pathData="M0,0h108v108h-108z">\n'
            '        <aapt:attr name="android:fillColor">\n'
            '            <gradient android:type="radial" android:centerX="54" android:centerY="40"\n'
            '                android:gradientRadius="74" android:startColor="#FF1F4560" android:endColor="#00101D2B" />\n'
            '        </aapt:attr>\n    </path>\n</vector>\n')


def brand_svg(size=512, rounded=True):
    _, sun_svg = svg_elements(brand_sun())
    rx = f' rx="{L * 0.22}"' if rounded else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {L} {L}">'
            f'<defs><radialGradient id="g" cx="54" cy="40" r="74" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="#1F4560"/><stop offset="1" stop-color="#101D2B" stop-opacity="0"/>'
            f'</radialGradient></defs>'
            f'<rect width="{L}" height="{L}"{rx} fill="{NIGHT}"/><rect width="{L}" height="{L}"{rx} fill="url(#g)"/>'
            f'{sun_svg}</svg>')


def on_light(layers):
    colors = [e.fill or e.stroke for e in layers["accent"]]
    hexc = ACCENT_ON_LIGHT.get(colors[0], "#244B5B") if colors else "#244B5B"
    return "0xFF" + hexc[1:] + ".toInt()"


def rrect_d(x, y, w, h, r):
    return (f"M{f(x + r)},{f(y)}H{f(x + w - r)}A{f(r)},{f(r)} 0 0,1 {f(x + w)},{f(y + r)}V{f(y + h - r)}"
            f"A{f(r)},{f(r)} 0 0,1 {f(x + w - r)},{f(y + h)}H{f(x + r)}A{f(r)},{f(r)} 0 0,1 {f(x)},{f(y + h - r)}"
            f"V{f(y + r)}A{f(r)},{f(r)} 0 0,1 {f(x + r)},{f(y)}Z")


UI_STROKE = 1.8


def ui_icons():
    """Iconos de interfaz (24 dp) en el mismo lenguaje de línea que la iconografía meteorológica."""
    U = lambda d: S(d, width=UI_STROKE)
    return {
        "home": [U("M4.5,10.5L12,4.5L19.5,10.5V19.5H4.5Z"), U("M10,19.5V14.5H14V19.5")],
        "forecast": [U(rrect_d(4, 5.5, 16, 14, 2)), U("M4,10H20"), U("M8.5,3.5V7"), U("M15.5,3.5V7")],
        "widgets": [U(rrect_d(4, 4, 6.8, 6.8, 1.6)), U(rrect_d(13.2, 4, 6.8, 6.8, 1.6)),
                    U(rrect_d(4, 13.2, 6.8, 6.8, 1.6)), U(rrect_d(13.2, 13.2, 6.8, 6.8, 1.6))],
        "settings": [U("M4,7H7M11,7H20"), U(circle_d(9, 7, 2)), U("M4,12H13M17,12H20"), U(circle_d(15, 12, 2)),
                     U("M4,17H6M10,17H20"), U(circle_d(8, 17, 2))],
        "location": [U("M12,21C12,21 5.5,14.8 5.5,9.8A6.5,6.5 0 0,1 18.5,9.8C18.5,14.8 12,21 12,21Z"), U(circle_d(12, 9.8, 2.3))],
        "gps": [U(circle_d(12, 12, 6.5)), F(circle_d(12, 12, 2.2)), U("M12,2.5V5.5M12,18.5V21.5M2.5,12H5.5M18.5,12H21.5")],
        "refresh": [U("M18.5,12A6.5,6.5 0 1,1 16.6,7.4"), U("M17.2,3.8V7.8H13.2")],
        "back": [U("M14.5,5L7.5,12L14.5,19")],
        "search": [U(circle_d(10.5, 10.5, 6)), U("M15,15L20,20")],
        "add": [U("M12,5V19M5,12H19")],
        "check": [U("M5,12.5L10,17.5L19,7")],
        "close": [U("M6.5,6.5L17.5,17.5M17.5,6.5L6.5,17.5")],
        "customize": [U("M12,3.8C12,3.8 6,10.2 6,14.2A6,6 0 0,0 18,14.2C18,10.2 12,3.8 12,3.8Z")],
        "info": [U(circle_d(12, 12, 8.5)), U("M12,11V16.5"), F(circle_d(12, 7.8, 1.1))],
        "studio": [U(rrect_d(3.5, 4.5, 17, 15, 2.5)), U("M6.5,16.5L10.5,12L13.5,15L15.2,13.3L17.5,16.5"),
                   F("M16,6.6L16.6,8.2L18.2,8.8L16.6,9.4L16,11L15.4,9.4L13.8,8.8L15.4,8.2Z")],
        "undo": [U("M9,6.5L5,10.5L9,14.5"), U("M5,10.5H14.5A4.5,4.5 0 0,1 14.5,19.5H10")],
        "redo": [U("M15,6.5L19,10.5L15,14.5"), U("M19,10.5H9.5A4.5,4.5 0 0,0 9.5,19.5H14")],
        "brush": [U("M19,4.5L11.2,12.3"), U("M10.5,12.5C8,12.5 6.5,14.2 6.5,16.4C6.5,17.9 5.6,19 4.5,19.5C7.5,20.8 12.5,20 12.6,15.3Z")],
        "eraser": [U("M9,19.5H19.5"), U("M5.6,14.6L13.6,6.6A2,2 0 0,1 16.4,6.6L19,9.2A2,2 0 0,1 19,12L11.5,19.5H9.8Z"), U("M9.5,10.7L15,16.2")],
        "invert": [U(circle_d(12, 12, 8)), F("M12,4A8,8 0 0,1 12,20Z")],
        "auto": [U("M12,3.5L13.7,9.3L19.5,11L13.7,12.7L12,18.5L10.3,12.7L4.5,11L10.3,9.3Z"), F(circle_d(18.5, 18.5, 1.2))],
        "image": [U(rrect_d(3.5, 4.5, 17, 15, 2.5)), U("M6.5,16.5L10.5,12L13.5,15L15.2,13.3L17.5,16.5"), U(circle_d(15.5, 8.8, 1.4))],
    }


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


def main():
    drawable = os.path.join(RES, "drawable")
    all_icons = icons()
    for name, layers in all_icons.items():
        write(os.path.join(drawable, f"ic_wx_{name}_base.xml"), vector_drawable(layers["base"] or [F("M0,0Z", "#00000000")]))
        write(os.path.join(drawable, f"ic_wx_{name}_accent.xml"), vector_drawable(layers["accent"] or [F("M0,0Z", "#00000000")]))
        write(os.path.join(DOCS, f"{name}.svg"), svg_icon(layers))
        write(os.path.join(DOCS, "mono", f"{name}.svg"), svg_icon(layers, mono="#FFFFFF"))
        write(os.path.join(DOCS, "light", f"{name}.svg"), svg_icon(layers, neutral_color="#244B5B", light=True))

    write(os.path.join(drawable, "ic_launcher_background.xml"), launcher_background_xml())
    write(os.path.join(drawable, "ic_launcher_foreground.xml"), vector_drawable(brand_sun(), size_dp=108, viewport=L))
    write(os.path.join(drawable, "ic_launcher_monochrome.xml"), vector_drawable(brand_sun("#FFFFFFFF"), size_dp=108, viewport=L))
    # Marca para la app (cabeceras, splash): el sol solo, recortado al contenido.
    write(os.path.join(drawable, "ic_aura_mark.xml"),
          vector_drawable(brand_sun(cx=24, cy=24, scale=23 / 27.8), size_dp=48, viewport=V))
    write(os.path.join(DOCS, "..", "brand", "aura_icon.svg"), brand_svg())
    write(os.path.join(DOCS, "..", "brand", "aura_icon_square.svg"), brand_svg(rounded=False))
    _, mark = svg_elements(brand_sun(cx=24, cy=24, scale=23 / 27.8))
    write(os.path.join(DOCS, "..", "brand", "aura_mark.svg"),
          f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 48 48">{mark}</svg>')

    for name, elements in ui_icons().items():
        write(os.path.join(drawable, f"ic_ui_{name}.xml"), vector_drawable(elements, size_dp=24, viewport=24))

    # Tabla Kotlin condición -> recursos (para widgets y app).
    kt = ["// Generado por tools/aura_icons.py. No editar a mano.", "package app.aura.ui.icons", "",
          "import app.aura.R", "import app.aura.core.weather.WeatherCondition", "",
          "/** Capas vectoriales de cada condición: base (neutra, tintable) y acento (color de marca). */",
          "data class WeatherIconLayers(",
          "    val base: Int,",
          "    val accent: Int,",
          "    val hasBase: Boolean,",
          "    val hasAccent: Boolean,",
          "    /** Tono del acento para superficies claras, donde el dorado pálido perdería contraste. */",
          "    val accentOnLight: Int,",
          "    /** Ilustración con volumen (WebP generado por tools/aura_3d.py). */",
          "    val realistic: Int,",
          "    /** Escena de fondo del cielo para esta condición. */",
          "    val scene: Int,",
          ")", "",
          "object WeatherIcons {",
          "    fun layers(condition: WeatherCondition): WeatherIconLayers = when (condition) {"]
    for name, layers in all_icons.items():
        enum = name.upper()
        kt.append(f"        WeatherCondition.{enum} -> WeatherIconLayers(R.drawable.ic_wx_{name}_base, "
                  f"R.drawable.ic_wx_{name}_accent, hasBase = {str(bool(layers['base'])).lower()}, "
                  f"hasAccent = {str(bool(layers['accent'])).lower()}, accentOnLight = {on_light(layers)}, "
                  f"realistic = R.drawable.ic3d_{name}, scene = R.drawable.scene_{name})")
    kt += ["    }", "}", ""]
    write(os.path.join(ROOT, "app", "src", "main", "java", "app", "aura", "ui", "icons", "WeatherIcons.kt"), "\n".join(kt))
    print(f"{len(all_icons)} iconos meteorológicos + icono adaptativo generados")


if __name__ == "__main__":
    main()
