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
    if mode=='pivote90': return im.rotate(90, expand=True)
    if mode=='pivote270': return im.rotate(270, expand=True)
    if mode=='envers': return im.rotate(180, expand=True)
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
# ---- Anglais ----
ME = ['January','February','March','April','May','June','July','August','September','October','November','December']
EN = [
 ('basil-en','BASIL','basilic',['Genovese','Sow indoors March to May','Harvest June - September','Seed depth 0.25 inch','Spacing 10 inches apart','Germination 5-10 days','Full sun','Net wt. 1 g'], dict(semis=[3,4,5],recolte=[6,7,8,9],prof=0.6,esp=25,levee=10,soleil='soleil')),
 ('carrot-en','CARROT','carotte',['Nantes 2','Sow February to July','Harvest May to October','Sow 1 cm deep','Thin to 5 cm','Germination 10-15 days','Sun or partial shade','Net weight 5 g'], dict(semis=[2,3,4,5,6,7],recolte=[5,6,7,8,9,10],prof=1,esp=5,levee=15,soleil='mi-ombre')),
 ('tomato-en','TOMATO','tomate',['Moneymaker','Sow indoors February - April','Harvest July to October','Seed depth 0.5 cm','Spacing 50 cm','Germinates in 7-14 days','Full sun','100 seeds'], dict(semis=[2,3,4],recolte=[7,8,9,10],prof=0.5,esp=50,levee=14,soleil='soleil')),
]
for k,(sid,title,sp,lines,truth) in enumerate(EN):
    for v in range(2):
        fn = fonts[(i+3)%len(fonts)]; b = bgs[(i+2)%len(bgs)]; m = modes[(i+1)%len(modes)]
        add(f'{sid}-{v}','sachet',title,sp,lines,truth,fn,b,(20,20,20),48,'bandeau' if v else 'plain',m); i+=1
# ---- Grilles J F M A M J J A S O N D ----
def grid_card(cid, title, sp, labs, header, style, semis, recolte, fontn, bgk, mode):
    W,H = 1000,900
    im = bg(bgk,W,H); d = ImageDraw.Draw(im)
    d.text((60,40),title,font=font(fontn,90,True),fill=(20,20,20))
    d.text((60,170),'Variété courante',font=font(fontn,40),fill=(20,20,20))
    x0=340; cw=50; fh=font(fontn,32,True)
    if header=='lettres':
        for k,l in enumerate('JFMAMJJASOND'): d.text((x0+k*cw+14,260),l,font=fh,fill=(20,20,20))
    else:
        for k,l in enumerate(['JAN','FÉV','MAR','AVR','MAI','JUIN','JUIL','AOÛT','SEPT','OCT','NOV','DÉC']): d.text((x0+k*cw+2,262),l,font=font(fontn,16,True),fill=(20,20,20))
    rows=[(labs[0],semis),(labs[1],recolte),('Floraison' if labs[0]=='Semis' else 'Flowering',[6,7,8])]
    for r,(name,ms) in enumerate(rows):
        y=330+r*80
        d.text((60,y+6),name,font=font(fontn,38),fill=(20,20,20))
        for k in range(12):
            box=[x0+k*cw+2,y,x0+k*cw+cw-2,y+50]
            if style=='plein':
                d.rectangle(box,outline=(150,150,150),fill=(60,130,60) if k+1 in ms else None)
            elif style=='pale':
                d.rectangle(box,fill=(250,215,120) if k+1 in ms else (240,240,236))
            elif style=='croix':
                d.rectangle(box,outline=(170,170,170))
                if k+1 in ms: d.text((box[0]+12,y+4),'x',font=font(fontn,40,True),fill=(20,20,20))
            elif style=='barre':
                if k+1 in ms: d.rectangle([box[0]-2,y+8,box[2]+2,y+42],fill=(200,80,60))
    im = degrade(im, mode)
    fnm=f'{cid}.jpg'; im.convert('RGB').save(os.path.join(OUT,fnm), quality=88)
    cases.append(dict(file=fnm,id=cid,kind='sachet',species=sp,truth=dict(semis=semis,recolte=recolte),font=fontn,bg=bgk,defect='grille-'+mode))
G=[('grille-fr-plein','TOMATE','tomate',('Semis','Récolte'),'lettres','plein',[2,3,4],[7,8,9,10],'dejavu','blanc','net'),
   ('grille-fr-pale','LAITUE','laitue',('Semis','Récolte'),'lettres','pale',[3,4,5,6,7,8],[5,6,7,8,9,10],'carlito','vert','net'),
   ('grille-fr-croix','COURGETTE','courgette',('Semis','Récolte'),'lettres','croix',[4,5],[7,8,9,10],'free-sans','jaune','net'),
   ('grille-fr-barre','CAROTTE','carotte',('Semis','Récolte'),'mots','barre',[3,4,5,6,7],[6,7,8,9,10],'dejavu-serif','blanc','net'),
   ('grille-fr-penche','POIREAU','poireau',('Semis','Récolte'),'lettres','plein',[3,4,5],[9,10,11,12],'free-serif','blanc','penche'),
   ('grille-en-plein','BEANS','haricot-nain',('Sow','Harvest'),'lettres','plein',[5,6,7],[7,8,9],'dejavu','blanc','net'),
   ('grille-en-pale','SPINACH','epinard',('Sow','Harvest'),'mots','pale',[3,4,8,9],[5,6,10,11],'carlito','ciel','net'),
   ('grille-fr-flou','RADIS','radis',('Semis','Récolte'),'lettres','plein',[3,4,5,6,7,8,9],[4,5,6,7,8,9,10],'dejavu','blanc','flou')]
for g in G: grid_card(*g)
# ---- Étiquettes tenues de côté ou à l'envers (photo prise en paysage, sachet retourné) ----
for (sid,title,sp,lines,truth),mode in zip(SACHETS[:3]+SACHETS[3:6]+PLANTES[:2], ['pivote90','pivote270','envers','pivote90','pivote270','envers','pivote90','pivote270']):
    kind = 'plante' if (sid,title,sp,lines,truth) in PLANTES else 'sachet'
    add(f'{sid}-{mode}',kind,title,sp,lines,truth,fonts[i%len(fonts)],bgs[i%len(bgs)],(20,20,20),48,'plain',mode); i+=1
json.dump(cases, open(os.path.join(OUT,'corpus.json'),'w'), ensure_ascii=False, indent=1)
print(len(cases),'images dans',OUT)
