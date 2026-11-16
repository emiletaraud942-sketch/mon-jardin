"""QR code de l'adresse de l'appli, vérifié par décodage.
Écrit un PNG (modules noirs sur fond blanc, marge de 4 modules) et REFUSE de conclure si le décodage ne redonne pas exactement l'adresse.
Usage : python3 qr.py sortie.png [adresse]   (outils : pip install qrcode opencv-python-headless)"""
import sys
import qrcode, cv2
from qrcode.constants import ERROR_CORRECT_Q

url = sys.argv[2] if len(sys.argv) > 2 else "https://mon-jardin-app.vercel.app"
q = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=20, border=4)
q.add_data(url); q.make(fit=True)
q.make_image(fill_color="black", back_color="white").save(sys.argv[1])
img = cv2.imread(sys.argv[1])
# Décodage de l'image telle quelle, puis réduite (comme à l'écran) : les deux doivent redonner l'adresse.
ok = []
for scale in (1.0, 0.25):
    im = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale != 1.0 else img
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(im)
    ok.append(data == url); print(f"échelle {scale} : décodé = {data!r}")
if not all(ok):
    print("ÉCHEC : QR non décodé, ne pas l'utiliser"); sys.exit(1)
print("OK : QR décodé vers", url, "version", q.version)
