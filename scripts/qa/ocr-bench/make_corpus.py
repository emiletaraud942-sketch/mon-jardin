#!/usr/bin/env python3
"""Fabrique des étiquettes et sachets d'essai (polices, mises en page, défauts de prise de vue variés) + la vérité attendue.
Usage : python3 scripts/qa/ocr-bench/make_corpus.py <dossier de sortie>   (PIL requis)"""
import json, os, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
random.seed(7)
F = '/usr/share/fonts/truetype/'
FONTS = {
 'dejavu': (F+'dejavu/DejaVuSans.ttf', F+'dejavu/DejaVuSans-Bold.ttf'),
 'dejavu-serif': (F+'dejavu/DejaVuSerif.ttf', F+'dejavu/DejaVuSerif-Bold.ttf'),
 'free-sans': (F+'freefont/FreeSans.ttf', F+'freefont/FreeSansBold.ttf'),
 'free-serif': (F+'freefont/FreeSerif.ttf', F+'freefont/FreeSerifBold.ttf'),
 'carlito': (F+'crosextra/Carlito-Regular.ttf', F+'crosextra/Carlito-Bold.ttf'),
 'caladea': (F+'crosextra/Caladea-Regular.ttf', F+'crosextra/Caladea-Bold.ttf'),
 'mono': (F+'dejavu/DejaVuSansMono.ttf', F+'dejavu/DejaVuSansMono-Bold.ttf'),
 'italique': (F+'freefont/FreeSerifItalic.ttf', F+'freefont/FreeSerifBoldItalic.ttf'),
}
M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
def rng(a,b): return f'{M[a-1]} à {M[b-1]}'
# (id, titre affiché, espèce attendue, [lignes], vérité)
SACHETS = [
 ('tomate','TOMATE',   'tomate',  ['Variété : Marmande','Semis sous abri : '+rng(2,4),'Récolte : '+rng(7,10),'Profondeur : 1 cm','Germination : 8 à 12 jours','Distance entre plants : 50 cm','Exposition : plein soleil','Contenu : 1 g'], dict(semis=[2,3,4],recolte=[7,8,9,10],prof=1,esp=50,levee=12,soleil='soleil')),
 ('carotte','CAROTTE', 'carotte', ['Nantaise 2','Semer de '+M[2]+' à '+M[6],'Récolter de '+M[5]+' à '+M[9],'Semer à 1 cm de profondeur','Levée en 10 à 15 jours','Espacer de 5 cm','Soleil','Poids net : 5 g'], dict(semis=[3,4,5,6,7],recolte=[6,7,8,9,10],prof=1,esp=5,levee=15,soleil='soleil')),
 ('basilic','BASILIC', 'basilic', ['Basilic grand vert','Semis : avril à juin','Récolte : juin à septembre','Profondeur de semis : 0,5 cm','Germination : 5 à 10 jours','Espacement : 25 cm','Soleil / mi-ombre','Contenu : 0,5 g'], dict(semis=[4,5,6],recolte=[6,7,8,9],prof=0.5,esp=25,levee=10,soleil='mi-ombre')),
 ('courgette','COURGETTE','courgette',['Courgette verte','Semis : avril à mai','Récolte : juillet à octobre','Profondeur : 2 cm','Germination : 7 jours','Distance entre plants : 80 cm','Exposition : soleil','Contenu : 2 g'], dict(semis=[4,5],recolte=[7,8,9,10],prof=2,esp=80,levee=7,soleil='soleil')),
 ('radis','RADIS','radis',['Radis rond rouge','Semer de mars à septembre','Récolte 4 semaines après semis','Profondeur : 1 cm','Levée : 3 à 5 jours','Écartement : 3 cm','Soleil ou mi-ombre','Poids : 10 g'], dict(semis=[3,4,5,6,7,8,9],prof=1,esp=3,levee=5,soleil='mi-ombre')),
 ('laitue','LAITUE','laitue',['Laitue batavia','Semis : mars à août','Récolte : mai à octobre','Enterrer à 0,5 cm','Germination 6 à 10 jours','Distance entre plants 30 cm','Mi-ombre','Contenu : 1 g'], dict(semis=[3,4,5,6,7,8],recolte=[5,6,7,8,9,10],prof=0.5,esp=30,levee=10,soleil='mi-ombre')),
 ('haricot','HARICOT','haricot-nain',['Haricot vert nain','Semis : mai à juillet','Récolte : juillet à septembre','Profondeur : 3 cm','Germination : 8 jours','Distance : 10 cm','Plein soleil','Contenu : 25 g'], dict(semis=[5,6,7],recolte=[7,8,9],prof=3,esp=10,levee=8,soleil='soleil')),
 ('persil','PERSIL','persil',['Persil commun','Semis : mars à juillet','Récolte : toute l’année','Profondeur : 1 cm','Germination : 15 à 30 jours','Distance entre plants : 15 cm','Mi-ombre','Contenu : 3 g'], dict(semis=[3,4,5,6,7],prof=1,esp=15,levee=30,soleil='mi-ombre')),
]
PLANTES = [
 ('pommier-et','POMMIER','pommier',['Malus domestica','Golden Delicious','Hauteur adulte : 4 m','Plein soleil','Racines nues','Prix : 24,90 €'], dict(haut=None,soleil='soleil',prix='24,90',form='racines-nues')),
 ('lavande-et','LAVANDE','lavande',['Lavandula angustifolia','Variété Hidcote','Godet 1 L','Hauteur 60 cm','Exposition : soleil','12,50 €'], dict(haut=60,soleil='soleil',prix='12,50',form='godet')),
 ('romarin-et','ROMARIN','romarin',['Rosmarinus officinalis','Pot 2 L','Hauteur : 40 cm','Soleil','Mini-motte','8,95 €'], dict(haut=40,soleil='soleil',prix='8,95')),
 ('framboisier-et','FRAMBOISIER','framboisier',['Rubus idaeus','Variété Heritage','Racines nues','Hauteur : 150 cm','Mi-ombre','Prix TTC 6,50 €'], dict(haut=150,soleil='mi-ombre',prix='6,50',form='racines-nues')),
]
def font(name, size, bold=False): return ImageFont.truetype(FONTS[name][1 if bold else 0], size)
def bg(kind, w, h):
    cols = {'vert':(233,242,216),'blanc':(250,250,246),'kraft':(214,190,150),'jaune':(250,238,170),'rose':(246,222,226),'ciel':(214,230,244)}
    im = Image.new('RGB',(w,h),cols[kind])
    if kind=='kraft':  # grain
        px = im.load()
        for _ in range(w*h//6): px[random.randrange(w),random.randrange(h)] = tuple(max(0,c-random.randrange(0,25)) for c in cols[kind])
    return im
def draw(cid, title, lines, fontn, bgk, fg, size, layout):
    W,H = 1000,1400
    im = bg(bgk,W,H); d = ImageDraw.Draw(im)
    if layout=='bandeau': d.rectangle([0,0,W,230],fill=(40,90,50)); d.text((60,60),title,font=font(fontn,96,True),fill=(255,255,255))
    else: d.text((60,60),title,font=font(fontn,100,True),fill=fg)
    y=300
    for ln in lines:
        d.text((60,y),ln,font=font(fontn,size),fill=fg); y+=int(size*1.9)
    return im
def degrade(im, mode):
    if mode=='net': return im
    if mode=='flou': return im.filter(ImageFilter.GaussianBlur(2.2))
    if mode=='penche': return im.rotate(random.choice([-5,4]), expand=True, fillcolor=im.getpixel((2,2)))
    if mode=='sombre': return ImageEnhance.Brightness(ImageEnhance.Contrast(im).enhance(0.6)).enhance(0.65)
    if mode=='bruit':
        px = im.load(); w,h = im.size
        for _ in range(w*h//12):
            x,y = random.randrange(w),random.randrange(h); v=random.randrange(-60,60); r,g,b = px[x,y]; px[x,y]=(max(0,min(255,r+v)),max(0,min(255,g+v)),max(0,min(255,b+v)))
        return im
    if mode=='petit': return im.resize((560,784)).resize((1000,1400)) if False else im.resize((560,784))
    if mode=='jpeg': return im
    return im
cases = []
def add(cid, kind, title, species, lines, truth, fontn, bgk, fg, size, layout, mode):
    im = degrade(draw(cid,title,lines,fontn,bgk,fg,size,layout), mode)
    fn = f'{cid}.jpg'; im.convert('RGB').save(os.path.join(OUT,fn), quality=55 if mode=='jpeg' else 90)
    cases.append(dict(file=fn, id=cid, kind=kind, species=species, truth=truth, font=fontn, bg=bgk, defect=mode))
fonts = list(FONTS); bgs=['vert','blanc','kraft','jaune','rose','ciel']; modes=['net','net','flou','penche','sombre','bruit','petit','jpeg']
i=0
for (sid,title,sp,lines,truth) in SACHETS:
    for k in range(3):
        fn = fonts[i%len(fonts)]; b = bgs[i%len(bgs)]; m = modes[i%len(modes)]
        fg = (20,20,20) if b!='kraft' else (50,30,10)
        add(f'{sid}-{k}','sachet',title,sp,lines,truth,fn,b,fg,48 if k!=2 else 40,'bandeau' if k==1 else 'plain',m); i+=1
for (sid,title,sp,lines,truth) in PLANTES:
    for k in range(2):
        fn = fonts[i%len(fonts)]; b = bgs[(i+1)%len(bgs)]; m = modes[(i+2)%len(modes)]
        add(f'{sid}-{k}','plante',title,sp,lines,truth,fn,b,(20,20,20),52,'plain',m); i+=1
json.dump(cases, open(os.path.join(OUT,'corpus.json'),'w'), ensure_ascii=False, indent=1)
print(len(cases),'images dans',OUT)
