#!/usr/bin/env python3
"""Collecte une photo libre par espèce (Wikipédia -> Wikimedia Commons). Reprend où elle s'est arrêtée.
Usage : python3 scripts/photos/fetch.py   (lit species.json, écrit public/plantes/<id>.jpg et credits.json)"""
import json, os, re, io, sys, time, urllib.parse, urllib.request, urllib.error
from PIL import Image
UA = 'PermaJardinPhotos/1.0 (appli de jardinage, collecte de photos libres)'
OK = ('cc0', 'cc by', 'cc-by', 'public domain', 'pd', 'cc by-sa')
BAD = ('köhler', 'koehler', 'koeh', 'illustration', 'plate', 'herbarium', 'map', 'drawing', 'flora', 'botanical', 'sketch', 'engraving')
import ssl
CTX = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None))
D = 'public/plantes'; os.makedirs(D, exist_ok=True)
CRED = os.path.join(D, 'credits.json')
cred = json.load(open(CRED)) if os.path.exists(CRED) else {}
miss = json.load(open('scripts/photos/missing.json')) if os.path.exists('scripts/photos/missing.json') else []
def get(url, binary=False, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30, context=CTX) as r:
                b = r.read(); return b if binary else json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code == 404: return {} if not binary else None
            time.sleep(45)  # 429 : on attend, on ne conclut rien
        except Exception:
            time.sleep(10 * (i + 1))
    return get(url, binary, tries)  # on insiste : la limite de Wikimedia est partagée
def candidates(latin):
    name = re.sub(r'\s*[×x]\s*', ' ', latin).strip()
    title = urllib.parse.quote(name.replace(' ', '_'))
    d = get('https://en.wikipedia.org/api/rest_v1/page/summary/' + title)
    out = []
    if d and d.get('originalimage'): out.append(d['originalimage']['source'])
    return out
def info(fn):
    q = urllib.parse.quote('File:' + fn)
    d = get('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=LicenseShortName|Artist|ImageDescription&titles=' + q)
    if not d: return None
    for p in d['query']['pages'].values():
        ii = p.get('imageinfo')
        if ii: return ii[0]['extmetadata']
for sp in json.load(open('scripts/photos/species.json')):
    sid = sp['id']
    if sid in cred or sid in miss: continue
    done = False
    for src in candidates(sp['latin']):
        m = re.search(r'/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)', src)
        if not m: continue
        fn = urllib.parse.unquote(m.group(1))
        low = fn.lower()
        if low.endswith(('.svg', '.png', '.gif', '.tif', '.tiff')) or any(b in low for b in BAD): continue
        meta = info(fn); time.sleep(3)
        if not meta: continue
        lic = meta.get('LicenseShortName', {}).get('value', '')
        if not any(lic.lower().startswith(o) for o in OK): continue
        art = re.sub(r'<[^>]+>', '', meta.get('Artist', {}).get('value', '')).strip()[:80] or 'Auteur inconnu'
        h = __import__('hashlib').md5(fn.replace(' ', '_').encode()).hexdigest()
        th = f'https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{urllib.parse.quote(fn.replace(" ", "_"))}/960px-{urllib.parse.quote(fn.replace(" ", "_"))}'
        b = get(th, True); time.sleep(3)
        if not b: continue
        try:
            im = Image.open(io.BytesIO(b)).convert('RGB')
        except Exception: continue
        if im.width < 300: continue
        w = 640; im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS) if im.width > w else im
        im.save(os.path.join(D, sid + '.jpg'), 'JPEG', quality=72, optimize=True, progressive=True)
        cred[sid] = {'f': fn, 'a': art, 'l': lic}
        json.dump(cred, open(CRED, 'w'), ensure_ascii=False, indent=0)
        print('OK', sid, lic, flush=True); done = True; break
    if not done:
        miss.append(sid); json.dump(miss, open('scripts/photos/missing.json', 'w')); print('--', sid, flush=True)
    time.sleep(3)
