#!/usr/bin/env python3
"""
Arte «3D» de Aura: iconos con volumen (degradados, brillo, sombras suaves) y escenas de fondo
por condición meteorológica.

Se describe en SVG (con filtros de desenfoque que VectorDrawable no admite), se renderiza con
Chromium/Playwright y se exporta a WebP con ImageMagick:
  app/src/main/res/drawable-nodpi/ic3d_<condición>.webp   (384×384, fondo transparente)
  app/src/main/res/drawable-nodpi/scene_<condición>.webp  (1200×600)
  docs/assets/3d/*.svg  (fuentes para revisión)

Uso: python3 tools/aura_3d.py   (requiere node + playwright y ImageMagick)
"""
import json
import math
import os
import random
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from aura_icons import cloud_d, crescent_d  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "app", "src", "main", "res", "drawable-nodpi")
DOCS = os.path.join(ROOT, "docs", "assets", "3d")

CONDITIONS = ["clear_day", "clear_night", "partly_cloudy_day", "partly_cloudy_night", "cloudy", "drizzle",
              "rain", "thunderstorm", "snow", "fog", "wind"]

DEFS = """
<filter id="blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
<filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6"/></filter>
<radialGradient id="sun" cx="0.38" cy="0.34" r="0.75">
  <stop offset="0" stop-color="#FFFBE0"/><stop offset="0.28" stop-color="#FFE27A"/>
  <stop offset="0.7" stop-color="#FFC233"/><stop offset="1" stop-color="#F29A0E"/>
</radialGradient>
<radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#FFD25A" stop-opacity="0.85"/><stop offset="0.55" stop-color="#FFC233" stop-opacity="0.35"/>
  <stop offset="1" stop-color="#FFB21E" stop-opacity="0"/>
</radialGradient>
<radialGradient id="moon" cx="0.35" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#FFFBEA"/><stop offset="0.5" stop-color="#F6E3A8"/><stop offset="1" stop-color="#D7B565"/>
</radialGradient>
<radialGradient id="moonGlow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#F6E3A8" stop-opacity="0.55"/><stop offset="1" stop-color="#F6E3A8" stop-opacity="0"/>
</radialGradient>
<linearGradient id="cloudLight" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#EEF3F8"/><stop offset="1" stop-color="#B7C4D4"/>
</linearGradient>
<linearGradient id="cloudGrey" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#E4EAF0"/><stop offset="0.5" stop-color="#B9C5D2"/><stop offset="1" stop-color="#8694A6"/>
</linearGradient>
<linearGradient id="cloudDark" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#A9B5C3"/><stop offset="0.5" stop-color="#6F7D90"/><stop offset="1" stop-color="#465366"/>
</linearGradient>
<linearGradient id="drop" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#D6F0FF"/><stop offset="1" stop-color="#2F8FDB"/>
</linearGradient>
<linearGradient id="bolt" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0" stop-color="#FFF6C2"/><stop offset="0.45" stop-color="#FFC857"/><stop offset="1" stop-color="#F08A0A"/>
</linearGradient>
<linearGradient id="wind" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0.95"/>
  <stop offset="1" stop-color="#DCE8F2"/>
</linearGradient>
"""


_ids = [0]


def cloud3d(circles, bottom, fill="cloudLight", shadow=0.28):
    d = cloud_d(circles, bottom)
    _ids[0] += 1
    cid = f"cc{_ids[0]}"
    hl = "".join(
        f'<ellipse cx="{x - r * 0.25:.2f}" cy="{y - r * 0.45:.2f}" rx="{r * 0.55:.2f}" ry="{r * 0.32:.2f}" fill="#FFFFFF" opacity="0.75" filter="url(#blur2)"/>'
        for (x, y, r) in circles[1:-1] + circles[:1])
    return (f'<path d="{d}" fill="#0B1622" opacity="{shadow}" transform="translate(1.5 4)" filter="url(#blur4)"/>'
            f'<path d="{d}" fill="url(#{fill})"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="0.8"/>'
            f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})">{hl}</g>')


def sun3d(cx, cy, r, rays=True):
    out = f'<circle cx="{cx}" cy="{cy}" r="{r * 1.9}" fill="url(#sunGlow)"/>'
    if rays:
        for i in range(12):
            a = math.radians(i * 30 - 90)
            x1, y1 = cx + r * 1.28 * math.cos(a), cy + r * 1.28 * math.sin(a)
            x2, y2 = cx + r * 1.62 * math.cos(a), cy + r * 1.62 * math.sin(a)
            out += (f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#FFC233" '
                    f'stroke-width="{r * 0.16:.2f}" stroke-linecap="round" opacity="0.9"/>')
    out += (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sun)"/>'
            f'<ellipse cx="{cx - r * 0.32}" cy="{cy - r * 0.38}" rx="{r * 0.42}" ry="{r * 0.26}" fill="#FFFFFF" opacity="0.55" filter="url(#blur2)"/>')
    return out


def moon3d(cx, cy, r):
    d = crescent_d(cx, cy, r, r * 0.6, -r * 0.52, r * 0.85)
    return (f'<circle cx="{cx}" cy="{cy}" r="{r * 1.8}" fill="url(#moonGlow)"/>'
            f'<path d="{d}" fill="url(#moon)"/>'
            f'<circle cx="{cx - r * 0.45}" cy="{cy + r * 0.25}" r="{r * 0.12}" fill="#C9A85A" opacity="0.45"/>'
            f'<circle cx="{cx - r * 0.2}" cy="{cy + r * 0.62}" r="{r * 0.08}" fill="#C9A85A" opacity="0.4"/>')


def star(cx, cy, s, op=0.9):
    return (f'<path d="M{cx},{cy - s}Q{cx + s * 0.18},{cy - s * 0.18} {cx + s},{cy}Q{cx + s * 0.18},{cy + s * 0.18} {cx},{cy + s}'
            f'Q{cx - s * 0.18},{cy + s * 0.18} {cx - s},{cy}Q{cx - s * 0.18},{cy - s * 0.18} {cx},{cy - s}Z" fill="#FFF6D6" opacity="{op}"/>')


def drop(x, y, s=1.0):
    return (f'<path d="M{x},{y}C{x + 2.6 * s},{y + 4 * s} {x + 3.4 * s},{y + 6 * s} {x + 3.4 * s},{y + 7.6 * s}'
            f'A3.4,3.4 0 0,1 {x - 3.4 * s},{y + 7.6 * s}C{x - 3.4 * s},{y + 6 * s} {x - 2.6 * s},{y + 4 * s} {x},{y}Z" '
            f'fill="url(#drop)"/><ellipse cx="{x - 1.1 * s}" cy="{y + 6.6 * s}" rx="{0.8 * s}" ry="{1.4 * s}" fill="#FFFFFF" opacity="0.7"/>')


def flake(x, y, s):
    arms = "".join(
        f'<line x1="{x}" y1="{y}" x2="{x + s * math.cos(math.radians(a)):.2f}" y2="{y + s * math.sin(math.radians(a)):.2f}"/>'
        for a in range(0, 360, 60))
    return (f'<g stroke="#9DB8D6" stroke-width="2.6" stroke-linecap="round" opacity="0.5" filter="url(#blur1)">{arms}</g>'
            f'<g stroke="#FFFFFF" stroke-width="1.7" stroke-linecap="round">{arms}</g><circle cx="{x}" cy="{y}" r="1.3" fill="#FFFFFF"/>')


C_LOW = [(36, 66, 11), (54, 55, 16), (73, 64, 12)]
C_HIGH = [(28, 48, 12), (48, 36, 18), (69, 46, 13)]
C_BACK = [(24, 45, 9), (40, 34, 13), (56, 42, 10)]


def bolt3d():
    d = "M53,57L39,77H49L44,94L64,70H53L59,57Z"
    return (f'<path d="{d}" fill="#FFC857" filter="url(#glow)" opacity="0.8"/>'
            f'<path d="{d}" fill="url(#bolt)" stroke="#FFF3C4" stroke-width="0.8" stroke-linejoin="round"/>')


def icon_svg(name):
    if name == "clear_day":
        body = sun3d(50, 50, 22)
    elif name == "clear_night":
        body = moon3d(46, 52, 26) + star(76, 24, 5) + star(84, 46, 3, 0.7) + star(22, 22, 3, 0.6)
    elif name == "partly_cloudy_day":
        body = sun3d(38, 38, 17) + cloud3d(C_LOW, 75)
    elif name == "partly_cloudy_night":
        body = moon3d(38, 38, 19) + star(74, 18, 4) + cloud3d(C_LOW, 75)
    elif name == "cloudy":
        body = cloud3d(C_BACK, 51, "cloudGrey", 0.18) + cloud3d([(34, 66, 12), (54, 54, 18), (74, 64, 13)], 76)
    elif name == "drizzle":
        body = cloud3d(C_HIGH, 58, "cloudGrey") + "".join(drop(x, y, 0.6) for x, y in [(34, 72), (50, 76), (66, 72), (42, 86), (58, 86)])
    elif name == "rain":
        body = cloud3d(C_HIGH, 58, "cloudGrey") + "".join(drop(x, y, 1.0) for x, y in [(33, 70), (50, 76), (67, 70)])
    elif name == "thunderstorm":
        body = cloud3d(C_HIGH, 58, "cloudDark", 0.35) + bolt3d() + drop(30, 72, 0.8) + drop(72, 72, 0.8)
    elif name == "snow":
        body = cloud3d(C_HIGH, 58, "cloudLight") + flake(33, 77, 6) + flake(51, 86, 6) + flake(69, 77, 6)
    elif name == "fog":
        bands = "".join(
            f'<rect x="{x}" y="{y}" width="{w}" height="7" rx="3.5" fill="#FFFFFF" opacity="{o}" filter="url(#blur1)"/>'
            for x, y, w, o in [(18, 58, 64, 0.95), (12, 70, 76, 0.85), (22, 82, 56, 0.7)])
        body = cloud3d([(30, 42, 11), (50, 32, 16), (69, 41, 12)], 51, "cloudGrey", 0.15) + bands
    elif name == "wind":
        body = (cloud3d([(46, 40, 9), (60, 31, 13), (76, 39, 10)], 47, "cloudLight", 0.15) +
                "".join(f'<path d="{d}" fill="none" stroke="url(#wind)" stroke-width="{w}" stroke-linecap="round"/>'
                        for d, w in [("M10,58H62A9,9 0 1,0 53,49", 5.2), ("M6,70H74A10,10 0 1,1 64,80", 5.2), ("M16,82H44", 4.2)]))
    else:
        raise ValueError(name)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 100 100"><defs>{DEFS}</defs>{body}</svg>'


# ------------------------------------------------------------------ escenas

def sky(stops):
    s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="sky" x1="0" y1="0" x2="0.25" y2="1">{s}</linearGradient><rect width="200" height="100" fill="url(#sky)"/>'


def soft_cloud(cx, cy, scale, color="#FFFFFF", op=0.9, blur="blur2"):
    parts = [(-14, 4, 9), (-3, -3, 13), (11, 2, 10), (22, 6, 7), (-24, 8, 6)]
    blobs = "".join(f'<circle cx="{cx + dx * scale:.1f}" cy="{cy + dy * scale:.1f}" r="{r * scale:.1f}"/>' for dx, dy, r in parts)
    base = f'<rect x="{cx - 26 * scale:.1f}" y="{cy + 4 * scale:.1f}" width="{50 * scale:.1f}" height="{9 * scale:.1f}" rx="{4.5 * scale:.1f}"/>'
    return (f'<g fill="#0B1622" opacity="{op * 0.18}" filter="url(#blur4)" transform="translate(0 {3 * scale:.1f})">{blobs}{base}</g>'
            f'<g fill="{color}" opacity="{op}" filter="url(#{blur})">{blobs}{base}</g>'
            f'<g fill="#FFFFFF" opacity="{op * 0.35}" filter="url(#blur2)" transform="translate(0 {-2 * scale:.1f})">'
            + "".join(f'<circle cx="{cx + dx * scale:.1f}" cy="{cy + dy * scale - r * scale * 0.35:.1f}" r="{r * scale * 0.55:.1f}"/>' for dx, dy, r in parts[:3])
            + '</g>')


def scrim(strength):
    return (f'<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0B1622" stop-opacity="{strength}"/>'
            f'<stop offset="0.6" stop-color="#0B1622" stop-opacity="{strength * 0.35}"/><stop offset="1" stop-color="#0B1622" stop-opacity="0"/></linearGradient>'
            f'<rect width="200" height="100" fill="url(#scrim)"/>')


def stars(seed, n):
    rnd = random.Random(seed)
    return "".join(f'<circle cx="{rnd.uniform(0, 200):.1f}" cy="{rnd.uniform(0, 70):.1f}" r="{rnd.uniform(0.2, 0.7):.2f}" '
                   f'fill="#FFFFFF" opacity="{rnd.uniform(0.35, 0.95):.2f}"/>' for _ in range(n))


def rain_streaks(seed, n, op):
    rnd = random.Random(seed)
    out = ""
    for _ in range(n):
        x, y, l = rnd.uniform(-10, 205), rnd.uniform(10, 100), rnd.uniform(5, 11)
        out += f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x - l * 0.28:.1f}" y2="{y + l:.1f}" stroke="#D4E8F7" stroke-width="0.45" opacity="{rnd.uniform(op * 0.5, op):.2f}"/>'
    return out


def snow_dots(seed, n):
    rnd = random.Random(seed)
    return "".join(f'<circle cx="{rnd.uniform(0, 200):.1f}" cy="{rnd.uniform(0, 100):.1f}" r="{rnd.uniform(0.4, 1.4):.2f}" '
                   f'fill="#FFFFFF" opacity="{rnd.uniform(0.5, 0.95):.2f}" filter="url(#blur1)"/>' for _ in range(n))


def scene_svg(name):
    day = [(0, "#1F67C4"), (0.55, "#4F9BE6"), (1, "#A9D6F7")]
    night = [(0, "#050B18"), (0.6, "#0E2240"), (1, "#22406A")]
    if name == "clear_day":
        body = sky(day) + sun3d(160, 26, 13) + soft_cloud(40, 82, 0.8, op=0.45, blur="blur4") + scrim(0.25)
    elif name == "clear_night":
        body = sky(night) + stars(7, 90) + moon3d(160, 28, 13) + scrim(0.2)
    elif name == "partly_cloudy_day":
        body = sky(day) + sun3d(150, 30, 14) + soft_cloud(160, 62, 1.25) + soft_cloud(60, 84, 1.0, op=0.85) + scrim(0.3)
    elif name == "partly_cloudy_night":
        body = sky(night) + stars(11, 60) + moon3d(150, 28, 12) + soft_cloud(160, 64, 1.2, "#9FB0C6", 0.75) + soft_cloud(55, 86, 1.0, "#7F91A8", 0.6) + scrim(0.2)
    elif name == "cloudy":
        body = (sky([(0, "#5D6E83"), (0.6, "#8C9CAF"), (1, "#BCC7D3")]) + soft_cloud(150, 30, 1.6, "#E7EDF3", 0.95, "blur2") +
                soft_cloud(60, 50, 1.4, "#D5DEE7", 0.9, "blur2") + soft_cloud(130, 86, 1.6, "#F2F5F8", 0.95) + scrim(0.35))
    elif name == "drizzle":
        body = (sky([(0, "#4A5B70"), (0.6, "#72849A"), (1, "#A2B0BF")]) + soft_cloud(150, 22, 1.7, "#B5C2D0", 0.95, "blur2") +
                soft_cloud(50, 26, 1.5, "#A4B2C2", 0.9, "blur2") + rain_streaks(3, 70, 0.45) + scrim(0.35))
    elif name == "rain":
        body = (sky([(0, "#2E3B4C"), (0.55, "#4C5D72"), (1, "#7A8A9C")]) + soft_cloud(150, 18, 1.9, "#8592A3", 0.95, "blur2") +
                soft_cloud(45, 20, 1.7, "#76849A", 0.95, "blur2") + rain_streaks(5, 160, 0.75) +
                '<rect y="80" width="200" height="20" fill="#C9D6E2" opacity="0.18" filter="url(#blur4)"/>' + scrim(0.3))
    elif name == "thunderstorm":
        body = (sky([(0, "#151B26"), (0.55, "#273244"), (1, "#424F66")]) +
                '<ellipse cx="140" cy="45" rx="45" ry="30" fill="#8FA2C8" opacity="0.35" filter="url(#glow)"/>' +
                soft_cloud(150, 18, 2.0, "#5A667A", 0.95, "blur2") + soft_cloud(45, 22, 1.8, "#4A5668", 0.95, "blur2") +
                '<path d="M146,34L134,58H143L137,82L157,52H147L153,34Z" fill="url(#bolt)" filter="url(#blur1)"/>' +
                '<path d="M146,34L134,58H143L137,82L157,52H147L153,34Z" fill="#FFE9A6" opacity="0.6" filter="url(#glow)"/>' +
                rain_streaks(9, 110, 0.6) + scrim(0.25))
    elif name == "snow":
        body = (sky([(0, "#7D93AB"), (0.6, "#AFBFCF"), (1, "#E3EAF1")]) + soft_cloud(150, 20, 1.7, "#E9EEF4", 0.95, "blur2") +
                soft_cloud(50, 24, 1.5, "#DCE4EC", 0.9, "blur2") + snow_dots(4, 120) +
                '<rect y="86" width="200" height="14" fill="#FFFFFF" opacity="0.7" filter="url(#blur4)"/>' + scrim(0.45))
    elif name == "fog":
        bands = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="9" rx="4.5" fill="#FFFFFF" opacity="{o}" filter="url(#blur4)"/>'
                        for x, y, w, o in [(-20, 30, 150, 0.5), (70, 48, 160, 0.55), (-10, 66, 170, 0.6), (60, 84, 160, 0.65)])
        body = sky([(0, "#8995A2"), (0.6, "#B4BDC6"), (1, "#D5DBE0")]) + bands + scrim(0.45)
    elif name == "wind":
        streaks = "".join(f'<path d="M{x},{y}q30,-6 60,0t60,0" fill="none" stroke="#FFFFFF" stroke-width="{w}" opacity="{o}" filter="url(#blur1)"/>'
                          for x, y, w, o in [(-10, 30, 1.2, 0.5), (40, 48, 0.9, 0.45), (0, 64, 1.4, 0.55), (80, 78, 1.0, 0.4)])
        body = (sky([(0, "#2F5E8F"), (0.6, "#5F8EBD"), (1, "#A3C3DE")]) + soft_cloud(160, 30, 1.2, "#EEF3F8", 0.8, "blur2") +
                soft_cloud(70, 22, 0.9, "#E3EAF1", 0.6, "blur2") + streaks + scrim(0.3))
    else:
        raise ValueError(name)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice">'
            f'<defs>{DEFS}</defs>{body}</svg>')


RENDER_JS = r"""
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage();
  for (const j of jobs) {
    await p.setViewportSize({ width: j.w, height: j.h });
    await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(j.svg, 'utf8')}</body></html>`);
    await p.locator('svg').screenshot({ path: j.png, omitBackground: true });
  }
  await b.close();
})();
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DOCS, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="aura3d-")
    jobs = []
    for name in CONDITIONS:
        for kind, svg, w, h in (("ic3d", icon_svg(name), 384, 384), ("scene", scene_svg(name), 1200, 600)):
            svg_path = os.path.join(DOCS, f"{kind}_{name}.svg")
            with open(svg_path, "w", encoding="utf-8") as fh:
                fh.write(svg)
            jobs.append({"svg": svg_path, "png": os.path.join(tmp, f"{kind}_{name}.png"), "w": w, "h": h,
                         "out": os.path.join(OUT, f"{kind}_{name}.webp"), "kind": kind})
    with open(os.path.join(tmp, "jobs.json"), "w") as fh:
        json.dump(jobs, fh)
    script = os.path.join(tmp, "render.js")
    with open(script, "w") as fh:
        fh.write(RENDER_JS)
    subprocess.run(["node", script, os.path.join(tmp, "jobs.json")], check=True)
    for j in jobs:
        quality = "88" if j["kind"] == "ic3d" else "80"
        subprocess.run(["convert", j["png"], "-define", "webp:alpha-quality=95", "-quality", quality, j["out"]], check=True)
    print(f"{len(jobs)} imágenes 3D generadas en {OUT}")


if __name__ == "__main__":
    main()
