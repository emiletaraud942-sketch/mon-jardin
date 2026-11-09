# Déployer PermaJardin sur Vercel

Guide pas à pas, gratuit (offre Hobby de Vercel + offre gratuite de Supabase). Comptez 15 minutes.

## 1. Avant de commencer
- Le dépôt est sur GitHub et `npm run typecheck && npm test && npm run build && npm run check:bundle` passe en local (`npm run e2e` déroule en plus le test de bout en bout : il sert le dossier `dist/` ; hors CI, il lui faut un Chromium, via `npx playwright install chromium` ou `PW_CHROMIUM_PATH`).
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

   Les variables de l'entraide (`NEIGHBORS_SUPABASE_URL`, `NEIGHBORS_SUPABASE_PUBLISHABLE`, `NEIGHBORS_VAPID_PUBLIC`) et de la météo (`VITE_WEATHER_PROVIDER`) sont décrites dans la table en tête de [`.env.example`](../.env.example) (§4.2 et §4 quater). Ne mettez pas les variables `NEIGHBORS_*` en Preview : elles pointent sur la production.

   Les variables `VITE_*` sont lues **au build** : après les avoir ajoutées ou modifiées, faites **Redeploy**.
4. **Deploy**. Le premier déploiement prend 1 à 2 minutes.

## 3. Branche de production et domaines
- Project Settings > **Git** > *Production Branch* : `main`. Les autres branches reçoivent une URL de prévisualisation.
- Project Settings > **Domains** : ajoutez votre domaine (Vercel indique l'enregistrement DNS à créer, `CNAME` ou `A`) ; le certificat HTTPS est automatique. L'adresse `https://<projet>.vercel.app` reste valable.
- HTTPS est indispensable : sans lui, ni la PWA installable, ni le service worker, ni les notifications, ni la caméra ne fonctionnent.

## 4. Supabase (facultatif)

Deux projets **séparés** : la **synchronisation** (§4.1) et l'**entraide** (§4.2). Ne réutilisez jamais l'un pour l'autre, ni un projet d'une autre application.

### 4.1 Synchronisation entre appareils
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

   Authentication > Emails > Templates : les modèles « Confirm signup » et « Magic Link » doivent contenir `{{ .Token }}` (l'appli demande un **code** à saisir, pas un lien à ouvrir ; voir ACTIONS-PROPRIETAIRE.md). Sans cela, l'e-mail ne contient pas le code.
4. Redéployez sur Vercel si vous venez d'ajouter `VITE_SUPABASE_*`.

### 4.2 Entraide entre voisins (projet dédié)
Le détail (schéma, règles, modération, incident) est dans [ENTRAIDE.md](ENTRAIDE.md). Ne réutilisez jamais le projet de la synchronisation. En résumé, **ACTIONS DU PROPRIÉTAIRE** dans le SQL Editor du projet dédié, dans l'ordre (dossier `supabase/neighbors/migrations/`) :
1. `20261023000000_neighbors.sql`, `20261025000000_neighbors_v2.sql`, `20261025010000_neighbors_v3_read.sql`, `20261025020000_neighbors_v4_events.sql`, `20261025030000_neighbors_v5_push.sql` (alertes), `20261025040000_neighbors_v6_cell_size.sql` (quartier de 2 ou 5 km), `20261027000000_neighbors_v7_hardening.sql` (durcissement), `20261029000000_neighbors_v8_gardens.sql` (jardins partagés), puis `20261104000000_neighbors_v9_hardening2.sql` **en dernier**. Toutes sont rejouables ; si vous rejouez un ancien fichier, rejouez ensuite les suivants. Le banc `supabase/neighbors/tests/run.sh` se lance sur une base **jetable** (jamais sur le projet) ; la CI le fait déjà (job `sql`).
2. Authentication > Providers : Email seul ; **Anonymous sign-ins désactivés** ; SMTP dédié ; CAPTCHA ; pas de Realtime ; seul le schéma `public` exposé (le schéma `neighbors_private` ne doit **jamais** être ajouté à *Exposed schemas*).
3. **Alertes** (facultatif) : fonction Edge `notify-message` (§4 quater).
4. **Purge quotidienne** : fonction Edge `purge-neighbors-photos` et `supabase/neighbors/cron.sql` (tout y est en commentaire ; à activer à la main, §4 quater).

### 4 bis. Remplacer le joker `https://*.supabase.co` de la CSP par les deux hôtes exacts (ACTION DU PROPRIÉTAIRE)
Aujourd'hui `connect-src` autorise n'importe quel projet Supabase (`https://*.supabase.co`) : un script injecté pourrait envoyer des données vers un projet qui n'est pas le vôtre. Une fois les deux projets créés :
1. Relevez les deux adresses exactes : `https://<ref-synchro>.supabase.co` et `https://<ref-entraide>.supabase.co` (Project Settings > API > Project URL). Si un seul projet est utilisé, n'en mettez qu'un.
2. Dans `vercel.json`, dans la valeur de `Content-Security-Policy`, remplacez `connect-src 'self' https://*.supabase.co` par `connect-src 'self' https://<ref-synchro>.supabase.co https://<ref-entraide>.supabase.co`.
3. Dans `src/lib/security/vercel-config.test.ts`, adaptez l'attente `expect(csp['connect-src']).toEqual(["'self'", 'https://*.supabase.co'])` avec ces deux adresses, puis `npm test`.
4. Déployez, ouvrez l'appli avec les deux fonctions (connexion de synchro, entraide avec photo) et vérifiez dans la console (F12) qu'aucune ligne « violates the following Content Security Policy » n'apparaît. Les photos de l'entraide, l'authentification et l'API passent toutes par le même hôte du projet.
5. Retour arrière en cas de blocage : remettre le joker, redéployer.
(Il faut refaire cette modification si un projet est recréé : la référence change.)

### 4 ter. Pare-feu Vercel (ACTION DU PROPRIÉTAIRE, le dépôt ne peut pas le faire)
Vercel > le projet PermaJardin > **Firewall** (ou Security > Firewall) > *Configure* > *Add Rule*. Les noms exacts des menus changent : suivre l'intention.
1. **Limitation de débit sur `/api/identify`** : par exemple 10 requêtes par minute et par IP, action *Deny* ou *Rate limit*. C'est le seul limiteur réellement partagé entre instances (celui du code est un garde-fou par instance, et le quota Pl@ntNet de 500 par jour est commun à toute l'appli).
2. **Limitation de débit sur `/ext/*`** : par exemple 120 requêtes par minute et par IP (les tuiles de carte en demandent beaucoup : ne pas descendre trop bas). Sans cela, un tiers peut utiliser les proxys comme relais vers l'IGN et Open-Meteo.
3. **Méthodes sur `/ext/*`** : règle personnalisée « le chemin commence par `/ext/` ET la méthode n'est ni GET ni HEAD : *Deny* ». `vercel.json` ne sait pas filtrer les méthodes d'un rewrite (seulement des conditions d'en-tête, de cookie, d'hôte ou de paramètre), d'où cette règle.
4. Settings > Deployment Protection : protéger les prévisualisations ; la production reste publique.
Vérification : après la règle, `for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code} " https://<domaine>/api/identify -X POST -H 'Content-Type: application/json' -d '{}'; done` doit finir par des 429 (ou 403 selon l'action). **Non testé ici.**

### 4 quater. Alertes de nouveaux messages et purge quotidienne (ACTIONS DU PROPRIÉTAIRE)
Projet **dédié à l'entraide** uniquement. Pas à pas dans [ENTRAIDE.md](ENTRAIDE.md) (« Alertes de nouveaux messages… » et « Entretien quotidien »). Résumé :
1. **Clés VAPID** : `node supabase/functions/notify-message/vapid-keys.mjs` (trois lignes : clé publique, clé privée, secret du webhook). Gardez-les dans un gestionnaire de mots de passe ; jamais dans le dépôt, un e-mail ou une variable `VITE_`/`NEIGHBORS_`.
2. **Secrets de la fonction** : `npx supabase secrets set --project-ref <REF> VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT="mailto:<contact>" NOTIFY_WEBHOOK_SECRET=…` (ou Dashboard > Edge Functions > Secrets). `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis tout seuls et ne sortent jamais de la fonction.
3. **Déployer** : `npx supabase functions deploy notify-message --no-verify-jwt --project-ref <REF>`, puis Database > Webhooks : table `messages`, évènement *Insert*, URL `https://<REF>.supabase.co/functions/v1/notify-message`, en-tête `x-webhook-secret`.
4. **Clé publique pour l'appli** : Vercel > `NEIGHBORS_VAPID_PUBLIC` = la clé publique (Production), puis Redeploy.
5. **Purge** : `npx supabase functions deploy purge-neighbors-photos --no-verify-jwt --project-ref <REF>`, secret `PURGE_SECRET` (16 caractères au moins, 32 recommandés), puis activer à la main `supabase/neighbors/cron.sql` (pg_cron, pg_net, secret rangé dans le Vault). Sans cela, « annonces supprimées après 60 jours, photos comprises » est faux.
6. Essai de bout en bout avec deux comptes de test (voir ENTRAIDE.md) ; Logs de la fonction : compteurs seulement.

## 5. Vérifications après déploiement
Remplacez `<domaine>` par votre adresse.

1. **Page d'accueil** : `https://<domaine>/` affiche l'écran d'accueil ; rien en rouge dans la console du navigateur (F12).
2. **Proxy IGN** : `https://<domaine>/ext/geopf/geocodage/search?q=nantes&limit=1` renvoie du JSON (`"type":"FeatureCollection"`). Si c'est du HTML, les rewrites de `vercel.json` ne sont pas appliqués.
3. **Fonction d'identification** (la requête doit venir du même site : un appel sans `Origin`, comme un `curl` nu, ou « cross-site » est refusé en **403**) :
   ```bash
   # Sans clé configurée : 503
   curl -i -X POST https://<domaine>/api/identify -H 'Origin: https://<domaine>' -H 'Content-Type: application/json' -d '{"images":["AAAA"]}'
   # Sans image : 400
   curl -i -X POST https://<domaine>/api/identify -H 'Origin: https://<domaine>' -H 'Content-Type: application/json' -d '{}'
   # Sans Origin : 403 (comportement voulu)
   curl -i -X POST https://<domaine>/api/identify -H 'Content-Type: application/json' -d '{}'
   ```
   Attendu : **503** tant que `PLANTNET_API_KEY` est absente (ordre des contrôles : méthode, origine, limite de débit, type de contenu, clé), **400** si la clé est présente mais qu'aucune photo valide n'est envoyée, **200** avec une vraie photo (testez depuis l'appli : *Plantes > Identifier*).
4. **En-têtes de sécurité** : `curl -I https://<domaine>/` montre `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`. `curl -I https://<domaine>/sw.js` montre `Cache-Control: no-cache`.
5. **PWA** : DevTools > Application > *Manifest* (4 icônes, aucune erreur) et *Service Workers* (activé).
6. Créez un jardin de démonstration : la carte, la 3D et les tâches s'affichent.

### Contrôles de la CI avant déploiement
- `check:bundle` échoue si le bundle grossit trop (gzip : entrée 250 Ko, précache 1,2 Mo, three 270 Ko, maplibre 330 Ko) : voir `scripts/check-bundle.mjs`.
- Le job `e2e` rejoue le parcours de base sur le site construit (réseau simulé, aucun accès à Internet). En cas d'échec, le rapport est dans les artefacts du run.
- Ces contrôles ne remplacent pas la vérification après déploiement ci-dessus : ils ne testent ni l'IGN réel, ni Supabase, ni un téléphone.

## 6. Installer l'appli sur le téléphone
- **iPhone / iPad (Safari uniquement)** : ouvrir le site > bouton Partager > **Sur l'écran d'accueil** > Ajouter. Les notifications ne fonctionnent qu'une fois installée (iOS 16.4 minimum).
- **Android (Chrome)** : menu ⋮ > **Installer l'application** (ou la bannière proposée).
- **Ordinateur (Chrome, Edge)** : icône d'installation dans la barre d'adresse.

Les « rappels » sont une notification **locale**, au plus une fois par jour, affichée à l'ouverture de l'appli. Seule exception, facultative : les alertes de nouveaux messages de l'entraide (§4 quater, `public/push-sw.js`).

## 7. Mettre à jour l'appli (service worker)
- Chaque déploiement produit de nouveaux fichiers ; le service worker les télécharge en arrière-plan.
- Le service worker est en mode « prompt » : la nouvelle version **attend**. L'appli affiche « Mise à jour disponible » avec « Mettre à jour » et « Plus tard » (le bandeau revient après 6 h) ; elle ne recharge jamais la page sans prévenir (vous ne perdez pas de saisie). En cliquant sur « Mettre à jour », la nouvelle version prend la main et la page se recharge.
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
| Pas de code de connexion dans l'e-mail | Modèles d'e-mail Supabase sans `{{ .Token }}`, ou limite d'envoi atteinte | Étape 4.3 ; attendre quelques minutes avant de redemander un code. |
| L'appli reste sur l'ancienne version | Mise à jour en attente | Étape 7 : « Mettre à jour » sur le bandeau, ou fermer tous les onglets. |

## 10. Compléter les informations légales (ACTION DU PROPRIÉTAIRE)
Les trois pages (confidentialité, mentions légales, conditions) sont des **brouillons** à faire valider par un professionnel. Champs `[à compléter]` de `src/lib/legal.ts` : `EDITEUR_NOM`, `EDITEUR_STATUT`, `EDITEUR_ADRESSE`, `CONTACT_EMAIL`, `DIRECTEUR_PUBLICATION`, auxquels s'ajoutent, dans les mentions légales, la raison sociale, l'adresse et la **région d'hébergement** des projets Supabase. Tant que la région n'est pas vérifiée, les textes disent « région d'hébergement à confirmer par l'éditeur » : n'écrivez « UE » qu'après vérification dans le tableau de bord. Après modification de `legal.ts`, régénérez `docs/{CONFIDENTIALITE,MENTIONS-LEGALES,CGU}.md` (le test `legal.test.ts` compare les deux) puis augmentez `LEGAL_VERSION`.

## 11. Retour arrière et restauration (ACTIONS DU PROPRIÉTAIRE)

**Revenir à la version précédente du site (Vercel).**
1. Vercel > le projet > **Deployments** : repérez le dernier déploiement de production qui fonctionnait.
2. Menu « … » du déploiement > **Promote to Production** (aussi appelé *Instant Rollback* : aucun nouveau build, la bascule est immédiate). En ligne de commande : `vercel rollback` (réservé au projet de PermaJardin).
3. Les visiteurs gardent l'ancienne version jusqu'à la mise à jour du service worker (§7) ; les données locales ne sont pas touchées.
4. Limites : le retour arrière ne défait **ni** les migrations Supabase (elles ne vont que vers l'avant ; l'ancienne version du site doit rester compatible avec la base : par exemple la v6 ajoute `profiles.cell_size`), **ni** les variables d'environnement (les `VITE_*` sont figées dans chaque build ; une variable modifiée après coup ne change pas un ancien déploiement). Si un secret a fuité, un retour arrière ne suffit pas : le **révoquer** (clé Pl@ntNet, clés Supabase, clés VAPID) puis redéployer.

**Restaurer la base (Supabase).**
1. Avant toute opération risquée, faites une copie : Database > **Backups** (sauvegardes quotidiennes ou retour à un instant donné selon l'offre : l'offre gratuite n'en propose pas de téléchargeable à ma connaissance, à vérifier dans votre tableau de bord) ou, depuis votre ordinateur, `pg_dump` avec la chaîne de connexion du projet (Project Settings > Database), rangée hors du dépôt.
2. Restauration : de préférence vers un **nouveau projet** (les sauvegardes du tableau de bord remplacent le projet entier), puis réappliquer les migrations manquantes, puis changer `VITE_SUPABASE_URL` / `NEIGHBORS_SUPABASE_URL` et les clés publiques sur Vercel, **mettre à jour la CSP** (§4 bis, la référence du projet change) et la liste *Redirect URLs*, redéployer.
3. Les photos de l'entraide sont dans Storage : une sauvegarde de base ne les contient pas. Jamais de restauration sur un projet d'une autre application.
4. Non testé ici : aucun accès à un vrai projet. Faites un essai de restauration sur un projet de test avant d'en avoir besoin.

**Les données locales** (jardins, photos) ne sont pas sur le serveur : l'export JSON (Réglages) et, pour une récupération, la copie de sécurité gardée sur l'appareil avant un remplacement par la synchro ou un import (bouton « Récupérer la copie de sécurité » du bandeau d'erreur de stockage ; elle ne contient pas les photos) sont les seules sauvegardes.
