#!/usr/bin/env python3
"""
Genera las animaciones de los iconos de los widgets (AnimatedVectorDrawable) en
app/src/main/res/drawable/anim_wx_*.xml.

Los widgets no pueden ejecutar código de animación: se usa un ProgressBar indeterminado con uno de
estos vectores animados como dibujo, superpuesto al icono. Android repite la animación sola, en el
hilo de dibujo del launcher, y la detiene cuando la pantalla de inicio no está visible.

Son capas de efecto (destellos, estrellas, gotas, copos, relámpago, bruma, nube) que funcionan sobre
cualquier estilo de icono: a color, mono o 3D.
"""
import os
import random

OUT = os.path.join(os.path.dirname(__file__), "..", "app", "src", "main", "res", "drawable")
NS = 'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"'


def avd(name, body, targets):
    xml = [f'<?xml version="1.0" encoding="utf-8"?>',
           f'<!-- Generado por tools/aura_anim.py: no editar a mano. -->',
           f'<animated-vector {NS}>',
           '  <aapt:attr name="android:drawable">',
           '    <vector android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48">',
           body,
           '    </vector>',
           '  </aapt:attr>']
    for target, animators in targets:
        xml.append(f'  <target android:name="{target}">')
        xml.append('    <aapt:attr name="android:animation">')
        xml.append('      <set>')
        xml.extend(f'        {a}' for a in animators)
        xml.append('      </set>')
        xml.append('    </aapt:attr>')
        xml.append('  </target>')
    xml.append('</animated-vector>')
    with open(os.path.join(OUT, f"anim_wx_{name}.xml"), "w") as f:
        f.write("\n".join(xml) + "\n")


def anim(prop, values, duration, offset=0, interp="@android:interpolator/linear", vtype="floatType"):
    return (f'<objectAnimator android:propertyName="{prop}" android:valueFrom="{values[0]}" android:valueTo="{values[1]}"'
            f' android:duration="{duration}" android:startOffset="{offset}" android:valueType="{vtype}"'
            f' android:interpolator="{interp}" />')


def keyframes(prop, frames, duration, offset=0):
    """frames: lista de (fracción, valor)."""
    kf = "".join(f'<keyframe android:fraction="{f}" android:value="{v}" />' for f, v in frames)
    return (f'<objectAnimator android:duration="{duration}" android:startOffset="{offset}">'
            f'<propertyValuesHolder android:propertyName="{prop}" android:valueType="floatType">{kf}</propertyValuesHolder>'
            f'</objectAnimator>')


SPARK = "M0,-3 L0.8,-0.8 L3,0 L0.8,0.8 L0,3 L-0.8,0.8 L-3,0 L-0.8,-0.8 Z"


def sparkle():
    # Destellos dorados que aparecen y se apagan alrededor del sol.
    spots = [(7, 9, 1.0), (41, 7, 0.8), (43, 31, 0.9), (6, 33, 0.7)]
    body, targets = [], []
    for i, (x, y, s) in enumerate(spots):
        body.append(f'      <group android:name="s{i}" android:translateX="{x}" android:translateY="{y}" android:scaleX="0" android:scaleY="0">'
                    f'<path android:pathData="{SPARK}" android:fillColor="#FFF1B8" /></group>')
        frames = [(0, 0), (0.5, s), (1, 0)]
        targets.append((f"s{i}", [keyframes("scaleX", frames, 900, i * 600), keyframes("scaleY", frames, 900, i * 600)]))
    avd("sparkle", "\n".join(body), targets)


def stars():
    spots = [(8, 8, 1.6), (40, 6, 1.2), (44, 26, 1.4), (5, 30, 1.1), (24, 4, 0.9)]
    body, targets = [], []
    for i, (x, y, r) in enumerate(spots):
        body.append(f'      <path android:name="t{i}" android:fillAlpha="0" android:fillColor="#FFFFFF"'
                    f' android:pathData="M{x - r},{y} a{r},{r} 0 1,0 {2 * r},0 a{r},{r} 0 1,0 {-2 * r},0" />')
        targets.append((f"t{i}", [keyframes("fillAlpha", [(0, 0), (0.5, 0.95), (1, 0)], 1400, i * 520)]))
    avd("stars", "\n".join(body), targets)


def falling(name, items, color, clip_top, length, width, cycle, flake=False, bolt=False):
    rnd = random.Random(name)
    body = [f'      <group android:name="clip"><clip-path android:pathData="M0,{clip_top} L48,{clip_top} L48,48 L0,48 Z" />']
    targets = []
    for i in range(items):
        x = 10 + (i * 28 / max(1, items - 1)) + rnd.uniform(-2, 2)
        y0 = clip_top - length - 1
        if flake:
            path = f'<path android:fillColor="{color}" android:pathData="M{x - 1.4},{y0} a1.4,1.4 0 1,0 2.8,0 a1.4,1.4 0 1,0 -2.8,0" />'
        else:
            path = (f'<path android:strokeColor="{color}" android:strokeWidth="{width}" android:strokeLineCap="round"'
                    f' android:pathData="M{x:.1f},{y0} l-{length * 0.25:.1f},{length}" />')
        body.append(f'        <group android:name="p{i}">{path}</group>')
        travel = 48 - clip_top + length + 2
        dur = int(cycle * (1.6 if flake else 1) * rnd.uniform(0.85, 1.15))
        off = int(i * cycle / items * 1.3) % cycle
        ani = [anim("translateY", (0, travel), dur, off)]
        if flake:
            ani.append(keyframes("translateX", [(0, 0), (0.5, 2.5), (1, 0)], dur, off))
        targets.append((f"p{i}", ani))
    body.append('      </group>')
    if bolt:
        body.append('      <path android:name="bolt" android:fillAlpha="0" android:fillColor="#FFE27A"'
                    ' android:pathData="M27,22 L20,34 L25,34 L21,46 L31,31 L26,31 L30,22 Z" />')
        targets.append(("bolt", [keyframes("fillAlpha", [(0, 0), (0.06, 1), (0.12, 0.2), (0.18, 1), (0.3, 0), (1, 0)], 2400, 300)]))
    avd(name, "\n".join(body), targets)


def mist():
    body, targets = [], []
    for i, y in enumerate((30, 36, 42)):
        body.append(f'      <group android:name="m{i}"><path android:strokeColor="#E8EEF3" android:strokeAlpha="0.75" android:strokeWidth="2"'
                    f' android:strokeLineCap="round" android:pathData="M10,{y} L34,{y}" /></group>')
        d = 1 if i % 2 == 0 else -1
        targets.append((f"m{i}", [keyframes("translateX", [(0, 0), (0.5, 5 * d), (1, 0)], 2600, i * 200)]))
    avd("mist", "\n".join(body), targets)


def cloud():
    body = ('      <group android:name="c"><path android:fillColor="#FFFFFF" android:fillAlpha="0.55"'
            ' android:pathData="M4,12 a4,4 0 0,1 4,-4 a5,5 0 0,1 9,1 a3.5,3.5 0 0,1 1,7 L8,16 a4,4 0 0,1 -4,-4 Z" /></group>')
    targets = [("c", [keyframes("translateX", [(0, -18), (1, 44)], 6000)])]
    avd("cloud", body, targets)


if __name__ == "__main__":
    sparkle()
    stars()
    falling("rain", 6, "#D8ECFF", 28, 5, 1.6, 700)
    falling("storm", 6, "#D8ECFF", 28, 5, 1.6, 650, bolt=True)
    falling("snow", 6, "#FFFFFF", 26, 0, 0, 1400, flake=True)
    mist()
    cloud()
    print("anim_wx_*: 7 animaciones")
