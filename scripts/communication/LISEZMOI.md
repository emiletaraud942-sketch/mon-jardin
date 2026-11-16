# Atelier du teaser de 30 s

Fabrique `PermaJardin-teaser-30s-16x9.mp4` et `-9x16.mp4` (dans `docs/communication/`) : les 6 phases pour bien utiliser l'appli, sans voix, 30 i/s. Les captures, images et sons intermédiaires ne sont pas versionnés (dossier `TEASER_WORK`, par défaut `/tmp/permajardin-teaser`).

## Ordre de fabrication
1. `npm ci`, puis `npx vite build` et `npx vite preview --port 4823` sur une copie propre du dépôt (`git worktree add`). Variable `TEASER_BASE` = adresse du serveur.
2. `python3 tuile.py $TEASER_WORK/tuile.png` : fond de carte **schématique** (quadrillage vert). Les tuiles IGN sont simulées (réseau coupé) : ce fond n'est **jamais** une photo aérienne et la vidéo ne le présente pas comme telle. Le bandeau « © IGN » visible sur les écrans est celui de l'appli.
3. `python3 illus.py $TEASER_WORK/illus` : deux dessins (pas des photos) pour le journal de la plante.
4. `node capture.mjs` : Playwright, 393 × 852, densité 3, tactile, thème clair, jardin d'exemple, réseau simulé comme `e2e/mocks.ts` (`commun.mjs`). Écrit `shots/*.png` et `meta.json` (positions des touchers). Les défilements sont de vraies captures recollées (`coller.py`).
5. `python3 qr.py $TEASER_WORK/qr.png` : QR vers `https://mon-jardin-app.vercel.app`, vérifié par décodage (OpenCV) ; le script échoue si le décodage ne redonne pas l'adresse. Outils : `pip install qrcode opencv-python-headless`.
6. `node render.mjs 16x9` puis `node render.mjs 9x16` : 900 images chacune depuis `scene.html` (fonction `render(t)` déterministe). Le script refuse un chevauchement de mouvements ou une transition de plus de 0,4 s. Avec des temps en arguments, il écrit des images d'essai.
7. `python3 musique.py $TEASER_WORK/musique.wav` : musique synthétisée, −16 LUFS mesurés.
8. `./monter.sh 16x9` et `./monter.sh 9x16` : H.264 yuv420p, faststart, AAC.

`PW_CHROMIUM_PATH` : chemin d'un Chromium déjà installé (sinon celui de Playwright).

## Limites
- Carte et météo simulées (IGN injoignable depuis l'atelier). Rien n'a été testé sur un vrai iPhone ; le téléphone est dessiné (aucun logo ni image d'Apple).
- Le son a été mesuré, pas écouté.
