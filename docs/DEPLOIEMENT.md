# Déployer PermaJardin sur Vercel

Guide pas à pas, gratuit (offre Hobby de Vercel + offre gratuite de Supabase). Comptez 15 minutes.

## 1. Avant de commencer
- Le dépôt est sur GitHub et `npm run typecheck && npm test && npm run build` passe en local.
- Un compte Vercel (connexion avec GitHub).
- Facultatif : un compte Supabase (synchronisation) et une clé Pl@ntNet (identification par photo).

## 2. Importer le dépôt dans Vercel
1. Vercel > **Add New… > Project** > choisir le dépôt GitHub de PermaJardin > **Import**.
2. Vercel détecte **Vite** (`vercel.json` le précise aussi) : laissez les réglages par défaut.
   - Build command : `npm run build` · Output directory : `dist` · Install command : `npm install`.
3. Dépliez **Environment Variables** et ajoutez, si vous les avez (toutes sont facultatives) :

   | Nom | Valeur | Rôle |
   | --- | --- | --- |
   | `PLANTNET_API_KEY` | clé gratuite de https://my.plantnet.org | Identification par photo (serveur uniquement). Cochez **Production seulement** (pas Preview ni Development) et *Sensitive* |
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` | Synchronisation entre appareils |
   | `VITE_SUPABASE_ANON_KEY` | clé « anon public » du projet Supabase | Idem (clé publique, jamais `service_role`) |

   Les variables `VITE_*` sont lues **au build** : après les avoir ajoutées ou modifiées, faites **Redeploy**.
4. **Deploy**. Le premier déploiement prend 1 à 2 minutes.

## 3. Branche de production et domaines
- Project Settings > **Git** > *Production Branch* : `main`. Les autres branches reçoivent une URL de prévisualisation.
- Project Settings > **Domains** : ajoutez votre domaine (Vercel indique l'enregistrement DNS à créer, `CNAME` ou `A`) ; le certificat HTTPS est automatique. L'adresse `https://<projet>.vercel.app` reste valable.
- HTTPS est indispensable : sans lui, ni la PWA installable, ni le service worker, ni les notifications, ni la caméra ne fonctionnent.

## 4. Supabase (facultatif : synchronisation)
1. Créez un projet sur https://supabase.com (offre gratuite). Notez *Project URL* et la clé *anon public* (Project Settings > API) pour les variables ci-dessus.
2. **Appliquez les migrations** de `supabase/migrations/` dans l'ordre des noms de fichier :
   - `20261017000000_garden_snapshots.sql` (table et règles RLS),
   - `20261018000000_snapshots_hardening.sql` (droits, idempotente),
   - `20261019000000_security_hardening.sql` (retire `TRUNCATE` et les droits inutiles, impose un objet JSON, ajoute `delete_my_account()` ; **ne pas l'oublier** : sans elle, le droit à l'effacement du compte n'existe pas côté serveur),
   - `20261027000000_snapshots_no_anonymous.sql` (refuse les connexions anonymes Supabase ; rejouable).

   Soit dans Supabase > **SQL Editor** (coller chaque fichier, *Run*), soit avec le CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
3. Supabase > **Authentication > URL Configuration** :
   - *Site URL* : `https://<domaine>`
   - *Redirect URLs* : `https://<domaine>/**` (couvre le retour sur `https://<domaine>/#reglages`), et `http://localhost:5173/**` pour le développement.

   Sans cela, le lien magique de connexion est refusé. Il doit être ouvert dans **le même navigateur** que celui où il a été demandé.
4. Redéployez sur Vercel si vous venez d'ajouter `VITE_SUPABASE_*`.

## 5. Vérifications après déploiement
Remplacez `<domaine>` par votre adresse.

1. **Page d'accueil** : `https://<domaine>/` affiche l'écran d'accueil ; rien en rouge dans la console du navigateur (F12).
2. **Proxy IGN** : `https://<domaine>/ext/geopf/geocodage/search?q=nantes&limit=1` renvoie du JSON (`"type":"FeatureCollection"`). Si c'est du HTML, les rewrites de `vercel.json` ne sont pas appliqués.
3. **Fonction d'identification** (la requête doit venir du même site : les appels « cross-site » sont refusés en 403) :
   ```bash
   # Sans clé configurée : 503
   curl -i -X POST https://<domaine>/api/identify -H 'Content-Type: application/json' -d '{"images":["AAAA"]}'
   # Sans image : 400
   curl -i -X POST https://<domaine>/api/identify -H 'Content-Type: application/json' -d '{}'
   ```
   Attendu : **503** tant que `PLANTNET_API_KEY` est absente (ordre des contrôles : méthode, origine, limite de débit, clé), **400** si la clé est présente mais qu'aucune photo valide n'est envoyée, **200** avec une vraie photo (testez depuis l'appli : *Plantes > Identifier*).
4. **En-têtes de sécurité** : `curl -I https://<domaine>/` montre `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`. `curl -I https://<domaine>/sw.js` montre `Cache-Control: no-cache`.
5. **PWA** : DevTools > Application > *Manifest* (4 icônes, aucune erreur) et *Service Workers* (activé).
6. Créez un jardin de démonstration : la carte, la 3D et les tâches s'affichent.

## 6. Installer l'appli sur le téléphone
- **iPhone / iPad (Safari uniquement)** : ouvrir le site > bouton Partager > **Sur l'écran d'accueil** > Ajouter. Les notifications ne fonctionnent qu'une fois installée (iOS 16.4 minimum).
- **Android (Chrome)** : menu ⋮ > **Installer l'application** (ou la bannière proposée).
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

Les « rappels » sont une notification **locale**, au plus une fois par jour, affichée à l'ouverture de l'appli : il n'y a pas de notification poussée en arrière-plan.

## 7. Mettre à jour l'appli (service worker)
- Chaque déploiement produit de nouveaux fichiers ; le service worker les télécharge en arrière-plan.
- Le service worker est en mode « prompt » : la nouvelle version **attend**. L'appli affiche « Nouvelle version disponible — Recharger » ; elle ne recharge jamais la page sans prévenir (vous ne perdez pas de saisie). En cliquant, la nouvelle version prend la main et la page se recharge.
- Si le bandeau n'apparaît pas : fermez complètement l'appli (et les autres onglets du site) puis rouvrez-la ; ou DevTools > Application > Service Workers > *Update* / *skipWaiting*.
- Le gros fichier de la 3D (~230 ko compressés) n'est pas préchargé à l'installation : il est gardé en cache à la première ouverture de l'onglet 3D. Ouvrez la 3D une fois en ligne avant d'aller au jardin sans réseau. La carte, elle, est préchargée. Les tuiles IGN déjà vues restent disponibles hors ligne.

## 8. Quotas et licences
- **Pl@ntNet** : 500 identifications par jour pour **toute** l'appli (clé gratuite partagée). L'appli limite aussi chaque visiteur (20 demandes / 10 min par instance). Au-delà : erreur 429, retour le lendemain.
- **Open-Meteo** : gratuit pour un usage **non commercial** uniquement (CC BY 4.0). Pour un usage commercial, il faut une clé payante ou une autre source météo.
- **IGN Géoplateforme** : Licence Ouverte 2.0, usage commercial possible, avec mention de la source (inclut le LiDAR HD : « © IGN – LiDAR HD », `LIDAR_ATTRIBUTION` dans `src/lib/lidar.ts`).
- **Vercel Hobby** : usage non commercial, limites généreuses (bande passante 100 Go/mois). **Supabase gratuit** : 500 Mo de base ; un projet inactif est mis en pause après 7 jours (réactivable d'un clic).

## 9. Dépannage
| Symptôme | Cause probable | Que faire |
| --- | --- | --- |
| **Écran blanc** au lancement | Ancien service worker qui sert des fichiers supprimés, ou fichier JS non chargé | Recharger ; sinon DevTools > Application > *Clear site data* (les jardins sont dans IndexedDB : exportez d'abord depuis Réglages si possible). Console F12 pour l'erreur exacte. |
| Écran blanc **uniquement en 3D** | Chunk 3D introuvable hors ligne / WebGL indisponible | Ouvrir l'onglet 3D une fois en ligne ; essayer un autre navigateur ; activer l'accélération matérielle. |
| **Tuiles grises** sur la carte | Proxy `/ext/geopf` non appliqué, IGN indisponible ou hors ligne | Tester l'URL de l'étape 5.2 ; vérifier que `vercel.json` est à la racine et que les rewrites sont dans le déploiement (Deployment > *Source* / *Functions*). |
| **403** sur `/ext/...` ou `/api/identify` | *Deployment Protection* de Vercel active (prévisualisations), ou appel d'un autre site refusé par `api/identify` | Settings > Deployment Protection : désactiver pour la production ; appeler l'API depuis l'appli et non depuis un autre domaine. |
| 404 en rechargeant `/quelquechose` | Rewrite SPA absent | Contrôler la dernière règle de `vercel.json` ; Output Directory = `dist`. |
| Console : « violates the following Content Security Policy » | Une nouvelle ressource externe est utilisée | Autoriser son domaine dans `vercel.json` (`connect-src`, `img-src`…) — jamais `unsafe-eval` ni `script-src` externe sans raison. |
| Identification : « pas encore activée » (503) | `PLANTNET_API_KEY` absente | Ajouter la variable dans Vercel (Production) puis **Redeploy**. |
| Identification : 429 | Quota quotidien Pl@ntNet ou limite par visiteur atteints | Réessayer plus tard. |
| Synchronisation absente dans Réglages | `VITE_SUPABASE_*` absentes au build | Ajouter les variables puis **Redeploy**. |
| Lien magique refusé | URL de redirection non autorisée côté Supabase, ou ouvert dans un autre navigateur | Étape 4.3 ; ouvrir le lien dans le navigateur d'où il a été demandé. |
| L'appli reste sur l'ancienne version | Mise à jour en attente | Étape 7 : « Recharger » sur le bandeau, ou fermer tous les onglets. |
