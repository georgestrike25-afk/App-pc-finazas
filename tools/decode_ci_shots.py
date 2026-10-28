#!/usr/bin/env python3
"""Extrae las capturas codificadas en base64 del registro de CI (paso «Capturas en el registro»)."""
import base64, os, re, sys

log, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
text = open(log, encoding="utf-8", errors="ignore").read()
n = 0
for m in re.finditer(r"AURA_SHOT_BEGIN (\S+)\s+(?:\S+\s+)?([A-Za-z0-9+/=]{100,})", text):
    name = os.path.splitext(m.group(1))[0] + ".jpg"
    with open(os.path.join(out, name), "wb") as fh:
        fh.write(base64.b64decode(m.group(2)))
    n += 1
print(f"{n} capturas")
