"""Recolle des bandes de capture (défilement réel) en une image longue.
Usage : coller.py sortie.png echelle bande1.png decalage1 bande2.png decalage2 ... (décalages en px CSS)"""
import sys
from PIL import Image
out, k = sys.argv[1], int(sys.argv[2])
parts = [(sys.argv[i], int(float(sys.argv[i + 1]) * k)) for i in range(3, len(sys.argv), 2)]
first = Image.open(parts[0][0]); w, h = first.size
H = parts[-1][1] + h
canvas = Image.new("RGB", (w, H))
for f, off in parts:
    canvas.paste(Image.open(f).convert("RGB"), (0, off))
canvas.save(out)
