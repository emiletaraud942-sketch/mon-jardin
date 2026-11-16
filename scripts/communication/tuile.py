"""Fond de carte SCHÉMATIQUE pour les captures : une tuile vert pâle quadrillée, répétée partout.
Ce n'est pas une photo aérienne : l'IGN n'est pas joignable depuis l'atelier, les tuiles sont simulées.
Usage : python3 tuile.py sortie.png"""
import sys
from PIL import Image, ImageDraw

N = 256
img = Image.new("RGB", (N, N), (157, 187, 134))
d = ImageDraw.Draw(img)
# Quadrillage fin tous les 64 px, trait plus marqué au bord de la tuile : un papier de plan, rien de réaliste.
for k in range(0, N, 64):
    c = (175, 201, 154) if k == 0 else (166, 194, 144)
    d.line([(k, 0), (k, N)], fill=c, width=1)
    d.line([(0, k), (N, k)], fill=c, width=1)
img.save(sys.argv[1])
