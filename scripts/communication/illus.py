"""Deux illustrations dessinées (brin de lavande, avant / après) pour le journal photo du teaser.
Ce ne sont PAS de vraies photos : elles servent à montrer l'écran « Journal » avec deux entrées.
Usage : python3 illus.py dossier"""
import sys, os, random
from PIL import Image, ImageDraw

def dessin(path, tiges, ciel):
    W, H = 600, 450
    img = Image.new("RGB", (W, H), ciel)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 300, W, H], fill=(120, 96, 70))
    d.rectangle([0, 290, W, 310], fill=(110, 150, 90))
    rnd = random.Random(7)
    for i in range(tiges):
        x = 120 + i * (360 // max(tiges - 1, 1))
        h = 90 + rnd.randint(0, 40) + (i % 2) * 20
        d.line([(x, 300), (x + rnd.randint(-8, 8), 300 - h)], fill=(70, 120, 70), width=5)
        for k in range(7):
            y = 300 - h + k * 11
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(140, 100, 190) if tiges > 3 else (150, 140, 120))
    img.save(path)

os.makedirs(sys.argv[1], exist_ok=True)
dessin(os.path.join(sys.argv[1], "avant.png"), 2, (214, 226, 232))
dessin(os.path.join(sys.argv[1], "apres.png"), 5, (190, 214, 236))
