# PermaJardin

PWA française pour cartographier son jardin en 3D (données IGN), placer ses plantes au mètre près, choisir quoi planter où et savoir quand tailler, désherber, arroser, récolter. Budget : 0 €.

## Commandes
- `npm run dev` : serveur local (proxy des API externes inclus)
- `npm run typecheck` · `npm test` (vitest) · `npm run build`

## Architecture
- React 18 + TypeScript + Vite, PWA (vite-plugin-pwa), MapLibre (carte 2D), Three.js / React Three Fiber (3D), SunCalc.
- **Local-first** : état dans IndexedDB (`src/lib/store.ts`), photos dans IndexedDB (`src/lib/photos.ts`). Supabase optionnel (`src/lib/sync.ts`, `supabase/migrations`).
- **Appels réseau du navigateur** : `/ext/geopf`, `/ext/apicarto`, `/ext/meteo`, `/ext/meteo-archive` (proxys : vite.config.ts en dev, rewrites de vercel.json en prod), `/api/identify` (fonction serveur) et Supabase (`*.supabase.co`, seulement si `VITE_SUPABASE_*` est configuré). Tout autre domaine est bloqué par la CSP de `vercel.json` : toute nouvelle source externe passe par un proxy `/ext/*` ou demande une mise à jour de la CSP.
- **LiDAR HD** (`src/lib/lidar.ts`, branché via `src/lib/useLidar.ts`) : WMS-R `/ext/geopf/wms-r`, couches MNH/MNT, raster `image/x-bil;bits=32`. Un seul chargement par jardin (cache IndexedDB 90 j, case et bouton « Actualiser » dans Réglages, réglage `pj.lidar`). Alimente les ombres (`obstaclesFor(..., trees)` dans Où planter ? et la 3D), le dessin des arbres des environs (3D, plafond 80) et un relief plus fin calculé en mémoire (`chooseTerrain` : jamais écrit dans `Garden.terrain`). Noms de couches confirmés par GetCapabilities (suffixe `.WGS`) ; format x-bil NON vérifié en réel (IGN injoignable depuis le conteneur) : testé seulement avec un raster synthétique. Repli silencieux (relief RGE ALTI, aucune erreur affichée) si indisponible.
- **Fonction serveur** : `api/identify.ts` relaie Pl@ntNet (clé `PLANTNET_API_KEY` côté Vercel).
- **PWA** : service worker en mode `prompt` (vite.config.ts) : la nouvelle version attend et l'interface propose « Recharger » (`virtual:pwa-register/react`). Chunk `three` hors précache (mis en cache à la première ouverture de la 3D) ; `maplibre` reste précaché (la carte doit s'ouvrir hors ligne). Jamais de cache pour `/api/*`, `/ext/meteo*` ni le géocodage. `public/push-sw.js` (alertes de messages de l'entraide : gestionnaires `push` et `notificationclick`) est chargé par `workbox.importScripts`, hors précache. Icônes PNG générées depuis `public/icon.svg`.
- **Typage** : `npm run typecheck` vérifie `src/` (`tsconfig.json`) puis `api/` et `vite.config.ts` (`tsconfig.node.json`).
- **Repère** : coordonnées locales en mètres, x = est, y = nord, origine = centre du jardin (`src/lib/geo.ts`). En Three.js, Z = -nord.
- **Contrat de données** : `src/types/index.ts`. Ne change pas le format stocké sans migration.

## Qui possède quoi (équipe d'agents dans `.claude/agents/`)
| Domaine | Fichiers | Agent |
| --- | --- | --- |
| Fiches espèces (146) | `src/data/species/*` | agronome-permaculture |
| IGN, météo, géo | `src/lib/{ign,weather,geo,terrain}.ts` | dev-cartographie-ign |
| Scène 3D | `src/features/garden3d/*` | dev-3d |
| Règles métier | `src/engine/*` | dev-moteur-regles |
| Écrans, PWA | `src/App.tsx`, `src/features/*`, `src/components`, `src/styles` | dev-frontend-pwa |
| Supabase, /api | `supabase/`, `src/lib/sync.ts`, `api/` | dev-backend-supabase |
| Tests navigateur | — | qa-testeur |
| Déploiement, PWA, build | `vercel.json`, `vite.config.ts`, `index.html`, `public/`, `tsconfig*.json`, `docs/DEPLOIEMENT.md` | devops-vercel |

Orchestration : agent `chef-de-projet`. Skills : `ajouter-espece`, `deployer`, `verifier-api`.

## Conventions
- Interface et commentaires en français ; phrases courtes.
- Fidélité à la maquette Leafora (fond blanc, cartes à ombre douce, DM Serif Display + DM Sans) : les tailles de la maquette s'écrivent `calc(N * var(--px))` (1 px de maquette, qui suit la taille du texte choisie ; la base mobile est de 15 px). En-têtes de page : `src/components/PageHead.tsx` (remplace la barre du haut sur téléphone pour l'accueil et À faire).
- Couleurs de l'interface uniquement via les variables CSS de `:root` (thème clair et sombre). Exceptions assumées : la scène 3D (`src/features/garden3d/*`, couleurs de scène : sol, ciel, feuillages), les couches MapLibre (`MapView`, `SpotPicker` : le style de carte ne lit pas les variables CSS) et `couleur`/`couleurAccent` des fiches espèces (pastilles et feuillages).
- Moteurs (`src/engine`) purs et testés ; ils reçoivent `speciesById` en paramètre. Tests présents pour `calendar`, `growth`, `planting`, `sun` et `tasks`.
- Licences : IGN Licence Ouverte (commercial OK) ; Open-Meteo non commercial ; Pl@ntNet 500 identifications/jour partagées.

## Fiabilité des données
- Le format stocké porte un numéro de version (`STATE_VERSION` dans `src/lib/migrate.ts`). Toute évolution incompatible = `STATE_VERSION + 1` et une étape dans `migrateState`, avec un test.
- `migrateState` valide et corrige (`sanitize`) toute donnée qui entre : lecture d'IndexedDB au démarrage, import JSON, récupération Supabase. Jardins sans centre, plantes sans position, dates invalides, identifiants en double : écartés ou corrigés, avec avertissements. Un fichier d'une version plus récente est refusé.
- Quand une correction est faite au chargement, l'original est gardé (clé de sauvegarde IndexedDB) avant réécriture. L'écriture est vidée sur `pagehide`/`visibilitychange` et un échec de lecture ne remplace jamais les données par un état vide.
- L'export (`serializeState`) écrit toujours la version courante. Le stockage est demandé « persistant » (`navigator.storage.persist()`) ; l'interface signale l'échec.
- Déploiement et exploitation : voir `docs/DEPLOIEMENT.md`.
