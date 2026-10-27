# PermaJardin

Votre jardin en 3D à partir de la photo aérienne et du cadastre de l'IGN, avec l'ombre réelle du soleil, vos plantes à leur place exacte, et la liste de ce qu'il faut faire cette semaine.

## Ce que fait la V1
- **Carte** : photo aérienne IGN, cadastre, parcelle et bâtiments voisins ; placement des plantes par glisser-déposer (≈ 20 cm de précision) ; envergure actuelle ou adulte.
- **3D** : relief RGE ALTI, orthophoto au sol, bâtiments extrudés (BD TOPO), arbres qui grandissent (« dans N ans »), ombres réelles selon la date et l'heure, carte d'ensoleillement.
- **Plantes** : inventaire avec photos, état, notes ; identification par photo (Pl@ntNet).
- **Entretien** : tâches de la semaine (taille, désherbage, arrosage, protection gel, récolte…) calculées à partir de 162 fiches espèces et de la météo (gel, pluie, bilan hydrique) ; calendrier de l'année ; rappel quotidien (notification locale, voir « Limites »).
- **Planter** : score « quelle plante pour cet endroit » (ensoleillement simulé, pente, sol, bons et mauvais voisins, distance légale art. 671 du Code civil) ; que semer ce mois-ci selon les gelées locales.
- **Catalogue** : 162 espèces (légumes, aromatiques, fleurs, engrais verts, vivaces, petits fruits, fruitiers, arbres et haies) avec fiche d'entretien.
- **Réglages** : plusieurs jardins, sol, export/import (avec validation du fichier), synchronisation Supabase optionnelle.

## Démarrer
```bash
npm install
npm run dev          # serveur local, proxys /ext/* inclus
npm run typecheck    # src/, api/ et vite.config.ts
npm test             # vitest
npm run build        # typecheck + build de production (dist/)
```
Mise en ligne sur Vercel : voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Variables d'environnement (toutes optionnelles, modèle dans `.env.example`)
| Variable | Où | Rôle |
| --- | --- | --- |
| `PLANTNET_API_KEY` | Vercel (serveur) | Identification par photo. Clé gratuite sur my.plantnet.org |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel (build) | Synchronisation entre appareils (appliquer `supabase/migrations`) |

## Limites à connaître
- **Données locales** : vos jardins sont stockés dans le navigateur de l'appareil (IndexedDB). Sans synchronisation, effacer les données du site les supprime : exportez régulièrement depuis Réglages.
- **Rappels** : une **notification locale, au plus une fois par jour, à l'ouverture de l'appli**, s'il y a des tâches prioritaires. Il n'y a **pas de notification poussée en arrière-plan** : l'appli fermée, rien n'est envoyé. Sur iPhone, les notifications exigent l'appli installée sur l'écran d'accueil (iOS 16.4 minimum).
- **Hors ligne** : l'appli s'ouvre sans réseau, mais l'IGN et la météo ont besoin de connexion ; seules les tuiles déjà vues et la dernière orthophoto 3D sont gardées en cache. Le service worker ne met jamais la météo en cache.
- **Identification par photo** : 500 identifications par jour pour toute l'appli (quota Pl@ntNet gratuit partagé), et une limite par visiteur.
- **Open-Meteo** : service gratuit pour un usage **non commercial** uniquement ; l'usage commercial de l'appli demanderait une clé payante ou une autre source météo.
- **Précision** : le placement vise ≈ 20 cm ; la parcelle cadastrale, le relief et les bâtiments sont ceux de l'IGN et peuvent être décalés ou datés.
- **Règles d'entretien** : repères généraux d'après les fiches espèces et la météo, à adapter à votre sol et votre microclimat.
- **Distance de plantation** : l'avertissement lié à l'art. 671 du Code civil est indicatif (limite parcellaire cadastrale, pas un bornage).
- **Service worker** : une mise à jour est proposée par un bandeau « Recharger » ; elle n'est jamais appliquée sans votre accord.

## Sources
IGN Géoplateforme (Licence Ouverte 2.0) · Open-Meteo (CC BY 4.0, non commercial) · Pl@ntNet · Code civil art. 671.
