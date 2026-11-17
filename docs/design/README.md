# Direction visuelle « Nature » (aperçus validés par le propriétaire, 17 nov. 2026)

Le propriétaire trouve ces deux aperçus « vraiment bien » : à garder comme référence pour la refonte de l'apparence. **Rien n'est encore appliqué à l'appli.**

- `apercu-nature-dessins.html` : version avec miniatures botaniques dessinées (SVG).
- `apercu-nature-photos.html` : version avec de vraies photos (Wikimedia Commons, incorporées en base64). **Version préférée.**

Principes : fond blanc à peine teinté de vert (`#eef1ea`, surface `#fbfcf9`), vert forêt profond (`#0c2a1a` à `#2d6a47`, `#5d9a63`, `#8dbb6e`), filets de 1 px à la place des contours épais et des ombres lourdes, beaucoup d'air, titres en Cormorant Garamond, texte en Inter 300/400, étiquettes en petites capitales espacées, icônes au trait de 1,2 px, miniatures rondes de 58 px, fiche plante ouverte sur une grande photo, frise des 12 mois (floraison en violet, taille en vert), carte « à la une » sur photo sous voile vert foncé, barre du bas à filet avec point sous l'onglet actif, thème sombre prévu.

Photos : lavande (Lavandula angustifolia june.jpg, CC0), romarin (Rosemary in bloom.JPG, Margalob, CC BY-SA 4.0), pommier (Malus domestica a1.jpg, Opioła Jerzy, CC BY 2.5), basilic (Ocimum basilicum 8zz.jpg, David J. Stang, CC BY-SA 4.0). Pour l'appli : une photo par espèce (173 fiches), crédit et licence affichés sur la fiche, photos réduites et mises en cache par le service worker, domaine à autoriser dans la CSP ou photos copiées dans `public/`.

**Mise en œuvre (17 nov. 2026)** : appliquée à l'appli, voir `CLAUDE.md`, « Direction visuelle Nature ».
