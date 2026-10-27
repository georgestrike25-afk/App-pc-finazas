#!/usr/bin/env python3
"""
Genera todos los recursos de marca de EnTono a partir de una única definición de formas.

Salidas:
  app/src/main/res/drawable/ic_launcher_background.xml   fondo del ícono adaptable
  app/src/main/res/drawable/ic_launcher_foreground.xml   ícono detallado (clavijero + medidor)
  app/src/main/res/drawable/ic_launcher_monochrome.xml   versión de un color (íconos temáticos de Android 13+)
  app/src/main/res/drawable/ic_entono_mark.xml           versión simplificada para tamaños chicos
  app/src/main/res/drawable/entono_splash_branding.xml   logotipo "EnTono" para la pantalla de inicio (Android 12+)
  app/src/main/java/com/afinador/acustico/ui/brand/WordmarkPaths.kt   contornos del logotipo para Compose
  docs/marca/*.svg                                        vistas previas y logotipo completo

Con --png además renderiza docs/marca/*.png con el Chromium de Playwright.

El logotipo usa los contornos de Inter ExtraBold / Medium (SIL Open Font License 1.1), convertidos a
trazados: la app no necesita incluir la fuente.
Uso:  python3 branding/generar_marca.py [--png]
"""
import math
import os
import subprocess
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "app/src/main/res")
DOCS = os.path.join(ROOT, "docs/marca")
KOTLIN = os.path.join(ROOT, "app/src/main/java/com/afinador/acustico/ui/brand/WordmarkPaths.kt")

GRAPHITE = "#1E1E1E"
GREEN = "#00C853"
GREEN_DARK = "#0A6B45"
GREEN_LIGHT = "#69F0AE"
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
FONT_MEDIUM = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"

# --------------------------------------------------------------------------------------------
# Formas. Coordenadas en la grilla de 108 × 108 de los íconos adaptables de Android; la zona segura
# es el círculo de radio 33 centrado en (54, 54).
# fill/stroke: color "#RRGGBB", o ("linear", x1, y1, x2, y2, [(pos, color), …]),
#              o ("radial", cx, cy, r, [(pos, color), …]). Colores "#AARRGGBB" admiten transparencia.
# --------------------------------------------------------------------------------------------
CX, CY = 54.0, 54.0
METAL = [(0.0, "#F7F9FA"), (0.45, "#C3CAD1"), (0.75, "#79828A"), (1.0, "#DCE1E6")]
WOOD = [(0.0, "#4A2410"), (0.22, "#7A3F1C"), (0.5, "#9C5528"), (0.78, "#7A3F1C"), (1.0, "#4A2410")]


def polar(r, deg):
    a = math.radians(deg)
    return CX + r * math.cos(a), CY + r * math.sin(a)


def fmt(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def arc_path(r, a0, a1):
    x0, y0 = polar(r, a0)
    x1, y1 = polar(r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{fmt(x0)},{fmt(y0)} A{fmt(r)},{fmt(r)} 0 {large},1 {fmt(x1)},{fmt(y1)}"


def line(p, q):
    return f"M{fmt(p[0])},{fmt(p[1])} L{fmt(q[0])},{fmt(q[1])}"


def rrect(x, y, w, h, r):
    return (f"M{fmt(x + r)},{fmt(y)} H{fmt(x + w - r)} A{fmt(r)},{fmt(r)} 0 0,1 {fmt(x + w)},{fmt(y + r)} "
            f"V{fmt(y + h - r)} A{fmt(r)},{fmt(r)} 0 0,1 {fmt(x + w - r)},{fmt(y + h)} "
            f"H{fmt(x + r)} A{fmt(r)},{fmt(r)} 0 0,1 {fmt(x)},{fmt(y + h - r)} "
            f"V{fmt(y + r)} A{fmt(r)},{fmt(r)} 0 0,1 {fmt(x + r)},{fmt(y)} Z")


def circle(cx, cy, r):
    return f"M{fmt(cx - r)},{fmt(cy)} A{fmt(r)},{fmt(r)} 0 1,0 {fmt(cx + r)},{fmt(cy)} A{fmt(r)},{fmt(r)} 0 1,0 {fmt(cx - r)},{fmt(cy)} Z"


# Clavijero 3+3 con corona en pico, que se angosta hacia la cejuela.
HEADSTOCK = ("M45.2,75 L44.3,60 L41.7,35.2 C41.4,31.6 43.1,30 46.2,29.7 C50.2,29.4 52.6,28.6 54,26.6 "
             "C55.4,28.6 57.8,29.4 61.8,29.7 C64.9,30 66.6,31.6 66.3,35.2 L63.7,60 L62.8,75 Z")
POST_Y = [39.5, 50.5, 61.5]
NUT_Y = 75.0
STRING_X = [46.9 + i * 2.84 for i in range(6)]  # cuerdas 6 → 1 sobre la cejuela


def post_x(left, y):
    # Los postes siguen el borde inclinado del clavijero.
    t = (y - 30) / 45
    half = 12.3 - 3.0 * t
    return CX - half * 0.55 if left else CX + half * 0.55


def gauge(detailed, color=GREEN):
    """Arco del medidor de afinación sobre el clavijero, con la marca central encendida."""
    out = []
    a0, a1 = 148, 392  # anillo abierto abajo que rodea el clavijero
    if detailed:
        out.append(dict(d=arc_path(31, a0, a1), stroke=color, width=7.5, alpha=0.18, cap="round"))
    out.append(dict(d=arc_path(31, a0, a1), stroke=color, width=3.2 if detailed else 4.2, cap="round"))
    if detailed:
        for deg in range(234, 307, 12):
            if deg == 270:
                continue
            major = deg in (246, 294)
            out.append(dict(d=line(polar(25.6 if major else 26.4, deg), polar(28.4, deg)), stroke=color,
                            width=1.3 if major else 0.9, alpha=0.9 if major else 0.6, cap="round"))
    # Marca central (afinado), más brillante.
    out.append(dict(d=line(polar(22.5, 270), polar(34.0, 270)), stroke=GREEN_LIGHT if detailed else color,
                    width=2.6 if detailed else 3.4, cap="round"))
    return out


def tuner_keys(detailed, mono=None):
    out = []
    for y in POST_Y:
        for left in (True, False):
            edge = CX - 12.0 if left else CX + 12.0
            kx = 33.2 if left else 68.8
            shaft_end = kx + 5.2 if left else kx + 0.8
            out.append(dict(d=rrect(min(edge, shaft_end), y - 0.9, abs(edge - shaft_end), 1.8, 0.6),
                            fill=mono or "#8A939B"))
            out.append(dict(d=rrect(kx, y - 3.5, 6.0, 7.0, 2.2),
                            fill=mono or ("linear", kx, y - 3.5, kx, y + 3.5, METAL)))
            if detailed:
                out.append(dict(d=rrect(kx, y - 3.5, 6.0, 7.0, 2.2), stroke="#33000000", width=0.4))
    return out


def headstock(detailed, mono=None):
    out = []
    # Diapasón visible debajo de la cejuela.
    out.append(dict(d=rrect(46.0, NUT_Y - 1, 16.0, 26.0, 0.5),
                    fill=mono or ("linear", 46, 0, 62, 0, [(0, "#20130B"), (0.5, "#3A2416"), (1, "#20130B")])))
    out.append(dict(d=HEADSTOCK, fill=mono or ("linear", 41.5, 0, 66.5, 0, WOOD)))
    if mono:
        return out
    if detailed:
        # Brillo de laca y filete de madera clara en el borde.
        out.append(dict(d=HEADSTOCK, fill=("linear", 0, 27, 0, 75, [(0, "#30FFFFFF"), (0.4, "#00FFFFFF"), (1, "#40000000")])))
        out.append(dict(d=HEADSTOCK, stroke="#D9A066", width=0.9))
        # Incrustación: aguja de afinador.
        out.append(dict(d="M54,33.2 C55.5,35 55.9,37.4 54,41.8 C52.1,37.4 52.5,35 54,33.2 Z", fill="#E6E9EC", alpha=0.9))
        out.append(dict(d="M54,35.2 C54.6,36.3 54.7,37.6 54,39.6 C53.3,37.6 53.4,36.3 54,35.2 Z", fill=GREEN))
        # Cuerdas desde los postes hasta la cejuela y sobre el diapasón.
        for i, nut_x in enumerate(STRING_X):
            left = i <= 2
            row = i if left else 5 - i
            y = POST_Y[row]
            px = post_x(left, y)
            color = "#D8BD86" if i <= 3 else "#E8ECEF"
            out.append(dict(d=line((px, y), (nut_x, NUT_Y)) + " " + line((nut_x, NUT_Y), (nut_x, 101)),
                            stroke=color, width=0.55 if i <= 2 else 0.45))
        # Postes metálicos.
        for row, y in enumerate(POST_Y):
            for left in (True, False):
                px = post_x(left, y)
                out.append(dict(d=circle(px, y, 2.5), fill=("radial", px - 0.8, y - 0.8, 3.2, METAL)))
                out.append(dict(d=circle(px, y, 0.9), fill="#4A5056"))
    # Cejuela de hueso.
    out.append(dict(d=rrect(45.0, NUT_Y - 1.1, 18.0, 2.4, 0.6),
                    fill=("linear", 0, NUT_Y - 1.1, 0, NUT_Y + 1.3, [(0, "#FBF6EA"), (1, "#D8CDB5")])))
    return out


def foreground():
    return gauge(True) + tuner_keys(True) + headstock(True)


def simple_mark():
    return gauge(False) + tuner_keys(False) + headstock(False)


def monochrome():
    white = "#FFFFFF"
    return gauge(False, color=white) + tuner_keys(False, mono=white) + headstock(False, mono=white)


def background():
    return [
        dict(d="M0,0 H108 V108 H0 Z", fill=("radial", 54, 46, 78, [(0, "#2B2D2C"), (0.6, "#222322"), (1, GRAPHITE)])),
        dict(d=circle(54, 54, 40), fill=("radial", 54, 54, 40, [(0, "#0000C853"), (0.72, "#1A00C853"), (1, "#0000C853")])),
    ]


# --------------------------------------------------------------------------------------------
# Logotipo a partir de la fuente.
# --------------------------------------------------------------------------------------------
def text_path(font_file, text, size, x=0.0, baseline=0.0, tracking=0.0):
    font = TTFont(font_file)
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs)
    cursor = 0.0
    for ch in text:
        name = cmap[ord(ch)]
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x + cursor, baseline))
        glyphs[name].draw(tpen)
        cursor += glyphs[name].width * scale + tracking
    return pen.getCommands(), cursor - tracking


def wordmark(size=100.0):
    """Trazados de "En" y "Tono"; devuelve (en, tono, ancho, alto de mayúscula)."""
    en, en_w = text_path(FONT_BOLD, "En", size, 0, size * 0.7275, tracking=-size * 0.01)
    tono, tono_w = text_path(FONT_BOLD, "Tono", size, en_w - size * 0.005, size * 0.7275, tracking=-size * 0.01)
    return en, tono, en_w - size * 0.005 + tono_w, size * 0.7275


# --------------------------------------------------------------------------------------------
# Escritura de vectores Android y SVG.
# --------------------------------------------------------------------------------------------
def android_color(c):
    return c.upper()


def svg_color(c):
    if len(c) == 9:
        a = int(c[1:3], 16) / 255
        return f"#{c[3:]}", a
    return c, 1.0


def android_gradient(spec, attr):
    kind = spec[0]
    stops = "\n".join(f'                    <item android:offset="{fmt(o)}" android:color="{android_color(c)}" />' for o, c in spec[-1])
    if kind == "linear":
        _, x1, y1, x2, y2, _ = spec
        geom = (f'android:type="linear" android:startX="{fmt(x1)}" android:startY="{fmt(y1)}" '
                f'android:endX="{fmt(x2)}" android:endY="{fmt(y2)}"')
    else:
        _, cx, cy, r, _ = spec
        geom = f'android:type="radial" android:centerX="{fmt(cx)}" android:centerY="{fmt(cy)}" android:gradientRadius="{fmt(r)}"'
    return (f'            <aapt:attr name="{attr}">\n                <gradient {geom}>\n{stops}\n'
            f'                </gradient>\n            </aapt:attr>\n')


def to_vector(elements, w_dp, h_dp, vw, vh, comment):
    body = []
    for e in elements:
        attrs = [f'android:pathData="{e["d"]}"']
        inner = ""
        fill = e.get("fill")
        stroke = e.get("stroke")
        if isinstance(fill, str):
            attrs.append(f'android:fillColor="{android_color(fill)}"')
        elif fill is not None:
            inner += android_gradient(fill, "android:fillColor")
        if isinstance(stroke, str):
            attrs.append(f'android:strokeColor="{android_color(stroke)}"')
        if stroke is not None:
            attrs.append(f'android:strokeWidth="{fmt(e.get("width", 1))}"')
            attrs.append(f'android:strokeLineCap="{e.get("cap", "butt")}"')
            attrs.append('android:strokeLineJoin="round"')
        if "alpha" in e:
            attrs.append(f'android:{"strokeAlpha" if stroke else "fillAlpha"}="{fmt(e["alpha"])}"')
        attr_text = "\n        ".join(attrs)
        if inner:
            body.append(f"    <path\n        {attr_text}>\n{inner}    </path>")
        else:
            body.append(f"    <path\n        {attr_text} />")
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f"<!-- {comment}\n     Generado por branding/generar_marca.py: no editar a mano. -->\n"
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    xmlns:aapt="http://schemas.android.com/aapt"\n'
        f'    android:width="{fmt(w_dp)}dp"\n    android:height="{fmt(h_dp)}dp"\n'
        f'    android:viewportWidth="{fmt(vw)}"\n    android:viewportHeight="{fmt(vh)}">\n'
        + "\n".join(body) + "\n</vector>\n"
    )


def to_svg_group(elements, prefix):
    defs, body = [], []
    for i, e in enumerate(elements):
        attrs = [f'd="{e["d"]}"']
        fill = e.get("fill")
        stroke = e.get("stroke")
        if fill is None:
            attrs.append('fill="none"')
        elif isinstance(fill, str):
            c, a = svg_color(fill)
            attrs.append(f'fill="{c}"' + (f' fill-opacity="{fmt(a)}"' if a < 1 else ""))
        else:
            gid = f"{prefix}g{i}"
            stops = "".join(
                f'<stop offset="{fmt(o)}" stop-color="{svg_color(c)[0]}" stop-opacity="{fmt(svg_color(c)[1])}"/>' for o, c in fill[-1])
            if fill[0] == "linear":
                _, x1, y1, x2, y2, _ = fill
                defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}">{stops}</linearGradient>')
            else:
                _, cx, cy, r, _ = fill
                defs.append(f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}">{stops}</radialGradient>')
            attrs.append(f'fill="url(#{gid})"')
        if stroke is not None:
            c, a = svg_color(stroke)
            attrs.append(f'stroke="{c}" stroke-width="{fmt(e.get("width", 1))}" stroke-linecap="{e.get("cap", "butt")}" stroke-linejoin="round"')
            if a < 1:
                attrs.append(f'stroke-opacity="{fmt(a)}"')
        if "alpha" in e:
            attrs.append(f'{"stroke-opacity" if stroke else "fill-opacity"}="{fmt(e["alpha"])}"')
        body.append(f"<path {' '.join(attrs)}/>")
    return "".join(defs), "".join(body)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print("escrito", os.path.relpath(path, ROOT))


def icon_svg(elements_fg, size=1024, rounded=True, with_bg=True, bg_color=None):
    """Vista previa del ícono: muestra la zona de 72 × 72 que deja ver el lanzador."""
    bdefs, bbody = to_svg_group(background(), "b") if with_bg else ("", "")
    fdefs, fbody = to_svg_group(elements_fg, "f")
    clip = '<clipPath id="r"><rect x="18" y="18" width="72" height="72" rx="16"/></clipPath>' if rounded else ""
    clip_attr = ' clip-path="url(#r)"' if rounded else ""
    bg_rect = f'<rect width="108" height="108" fill="{bg_color}"/>' if bg_color else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="18 18 72 72">'
            f"<defs>{clip}{bdefs}{fdefs}</defs>"
            f"<g{clip_attr}>{bg_rect}{bbody}{fbody}</g></svg>")


def main():
    write(os.path.join(RES, "drawable/ic_launcher_background.xml"),
          to_vector(background(), 108, 108, 108, 108, "Fondo grafito del ícono de EnTono."))
    write(os.path.join(RES, "drawable/ic_launcher_foreground.xml"),
          to_vector(foreground(), 108, 108, 108, 108, "Ícono de EnTono: clavijero 3+3 con medidor de afinación."))
    write(os.path.join(RES, "drawable/ic_launcher_monochrome.xml"),
          to_vector(monochrome(), 108, 108, 108, 108, "Ícono de EnTono de un solo color (íconos temáticos)."))
    # Marca simplificada: recortada a la zona visible para usarla dentro de la app.
    mark = to_vector(simple_mark(), 48, 48, 108, 108, "Marca simplificada de EnTono, sin detalles finos, para tamaños chicos.")
    mark = mark.replace('android:viewportWidth="108"\n    android:viewportHeight="108">',
                        'android:viewportWidth="72"\n    android:viewportHeight="72">\n    <group android:translateX="-18" android:translateY="-18">')
    mark = mark.replace("\n</vector>\n", "\n    </group>\n</vector>\n")
    write(os.path.join(RES, "drawable/ic_entono_mark.xml"), mark)

    # Logotipo.
    en, tono, width, cap = wordmark(100.0)
    sub, sub_w = text_path(FONT_MEDIUM, "AFINADOR DE GUITARRA", 22.0, 0, 0, tracking=5.0)
    write(KOTLIN,
          "package com.afinador.acustico.ui.brand\n\n"
          "// Generado por branding/generar_marca.py a partir de Inter ExtraBold (SIL OFL 1.1): no editar a mano.\n\n"
          "/** Trazados del logotipo \"EnTono\" en una grilla de [WORDMARK_WIDTH] × [WORDMARK_HEIGHT]. */\n"
          f'internal const val WORDMARK_EN = "{en}"\n\n'
          f'internal const val WORDMARK_TONO = "{tono}"\n\n'
          f"internal const val WORDMARK_WIDTH = {width:.1f}f\n\n"
          f"internal const val WORDMARK_HEIGHT = {cap:.1f}f\n")

    # Pantalla de inicio de Android 12+: logotipo de 200 × 80 dp sobre grafito.
    pad_x = (width * 80 / 200 / 0.62 - width) / 2  # ancho del lienzo para una relación 200:80 con margen
    vw = width + 2 * pad_x
    vh = vw * 80 / 200
    ty = (vh - cap) / 2
    branding = [dict(d=en, fill="#F2F2F2"), dict(d=tono, fill=GREEN)]
    xml = to_vector(branding, 200, 80, vw, vh, "Logotipo EnTono para la pantalla de inicio (Android 12+).")
    xml = xml.replace(f'android:viewportHeight="{fmt(vh)}">',
                      f'android:viewportHeight="{fmt(vh)}">\n    <group android:translateX="{fmt(pad_x)}" android:translateY="{fmt(ty)}">')
    xml = xml.replace("\n</vector>\n", "\n    </group>\n</vector>\n")
    write(os.path.join(RES, "drawable/entono_splash_branding.xml"), xml)

    # Vistas previas y logotipo completo (como la referencia, con texto) en docs/marca.
    write(os.path.join(DOCS, "entono-icono.svg"), icon_svg(foreground()))
    write(os.path.join(DOCS, "entono-icono-play-store.svg"), icon_svg(foreground(), size=512, rounded=False))
    write(os.path.join(DOCS, "entono-icono-simple.svg"), icon_svg(simple_mark()))
    write(os.path.join(DOCS, "entono-icono-monocromo.svg"), icon_svg(monochrome(), with_bg=False, bg_color="#3A4A44"))
    bdefs, bbody = to_svg_group(background(), "b")
    fdefs, fbody = to_svg_group(foreground(), "f")
    s = 1024 / 108
    wm_scale = 0.56 * 1024 / width
    sub_scale = 0.62 * 1024 / sub_w
    full = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
        f'<defs><clipPath id="r"><rect width="1024" height="1024" rx="200"/></clipPath>{bdefs}{fdefs}</defs>'
        '<g clip-path="url(#r)">'
        f'<g transform="scale({s:.4f})">{bbody}</g>'
        f'<g transform="translate(512 372) scale(7.6) translate(-54 -54)">{fbody}</g>'
        f'<g transform="translate({(1024 - width * wm_scale) / 2:.1f} 752) scale({wm_scale:.4f})">'
        f'<path d="{en}" fill="#F2F2F2"/><path d="{tono}" fill="{GREEN}"/></g>'
        f'<g transform="translate({(1024 - sub_w * sub_scale * 0.62) / 2:.1f} 905) scale({sub_scale * 0.62:.4f})"><path d="{sub}" fill="#C9CFCC"/></g>'
        f'<path d="M{(1024 - sub_w * sub_scale * 0.62) / 2 - 90:.0f},897 h60 M{(1024 + sub_w * sub_scale * 0.62) / 2 + 30:.0f},897 h60" stroke="{GREEN}" stroke-width="5" stroke-linecap="round"/>'
        "</g></svg>"
    )
    write(os.path.join(DOCS, "entono-logo-completo.svg"), full)

    if "--png" in sys.argv:
        render_pngs()


def render_pngs():
    jobs = [
        ("entono-logo-completo.svg", "entono-logo-completo-1024.png", 1024),
        ("entono-icono.svg", "entono-icono-1024.png", 1024),
        ("entono-icono-play-store.svg", "entono-icono-play-store-512.png", 512),
        ("entono-icono.svg", "entono-icono-192.png", 192),
        ("entono-icono.svg", "entono-icono-48.png", 48),
        ("entono-icono-simple.svg", "entono-icono-simple-96.png", 96),
        ("entono-icono-simple.svg", "entono-icono-simple-48.png", 48),
        ("entono-icono-simple.svg", "entono-icono-simple-24.png", 24),
        ("entono-icono-monocromo.svg", "entono-icono-monocromo-192.png", 192),
    ]
    script = """
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [src, dst, size] of JSON.parse(process.argv[process.argv.length - 1])) {
    const svg = fs.readFileSync(src, 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`);
    await page.screenshot({ path: dst, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('png', dst);
  }
  await browser.close();
})();
"""
    import json
    args = [[os.path.join(DOCS, a), os.path.join(DOCS, b), n] for a, b, n in jobs]
    subprocess.run(["node", "-e", script, json.dumps(args)], check=True)


if __name__ == "__main__":
    main()
