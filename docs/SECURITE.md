# Sécurité et protection des données

Référence tenue par l'agent `securite-donnees`. Tout durcissement a un test (vitest, ou script SQL) et une ligne dans le tableau « Menace → mesure → fichier ». Derniers audits : 18 octobre 2026 (synchro, API, proxys), 23 octobre 2026 (entraide entre voisins, §8) et 23 octobre 2026, 2e passe complète et hostile (§9).

Données sensibles de l'appli : adresse et position du domicile (jardin), photos, jeton de connexion Supabase, clé Pl@ntNet.
Principes : moindre privilège, aucune donnée personnelle superflue, aucun secret hors variables d'environnement serveur, local d'abord (rien ne quitte l'appareil sans action de l'utilisateur).

## 1. Menace → mesure → fichier

| Menace | Mesure | Fichier(s) · test |
| --- | --- | --- |
| Appel de `/api/identify` depuis un autre site (CSRF, consommation du quota Pl@ntNet) | Refus si `Sec-Fetch-Site: cross-site`, ou `Origin`/`Referer` ≠ hôte ; `Content-Type: application/json` obligatoire (415) ; aucun en-tête CORS ; méthode POST seulement (`Allow: POST`) | `api/identify.ts` · `api/_tests/identify.test.ts` |
| Contournement de la limite de débit par `X-Forwarded-For` falsifié | IP lue dans `x-vercel-forwarded-for`, puis `x-real-ip` (posés par Vercel), sinon DERNIÈRE valeur de `x-forwarded-for` (jamais la première) | `clientIp` · tests « clientIp » et « IP falsifiée » |
| Saturation mémoire/CPU du limiteur (preuve avant correctif : 30 000 clés = 12 s de CPU, boucle O(n²)) | Mémoire bornée à 10 000 clés, éviction d'une seule entrée par requête (coût constant) ; test 50 000 clés < 1,5 s | `createRateLimiter` · test « mémoire bornée » |
| Épuisement du quota Pl@ntNet (500/jour) par de nombreuses adresses | Plafond global de 150 requêtes / 10 min par instance, en plus des 20 / 10 min par IP (garde-fou par instance : voir §6 pour la vraie limite partagée) | `api/identify.ts` |
| Image piégée : fichier qui n'est pas une image, base64 invalide, « bombe de décompression » (30 000 × 30 000 px) | Base64 strict, type d'après les octets magiques, dimensions lues dans l'en-tête (≤ 8 000 px par côté et 40 Mpx), en-tête tronqué refusé, 5 images et 4,2 Mo au plus | `detectImageMime`, `imageSize`, `decodeBase64Image` · tests « bombe », « base64 strict » |
| Fuite de la clé Pl@ntNet (elle est dans l'URL sortante) | Erreurs nettoyées (`scrubError`), `redirect: 'error'` (jamais de redirection avec la clé), aucune IP ni image dans les journaux, 500 générique, réponses amont plafonnées à 1 Mo | `api/identify.ts` · tests « ne divulgue ni la clé ni l'URL », « erreur inattendue », « journaux » |
| Corps JSON invalide (`req.body` lève une exception à la lecture) | Lecture protégée → 400 JSON ; filet global → 500 générique | `api/identify.ts` · test « JSON invalide » |
| Mise en cache ou interprétation de la réponse de l'API | `Cache-Control: no-store`, `nosniff`, CSP `default-src 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer` | `api/identify.ts` · test « en-têtes de sécurité » |
| Les proxys `/ext/*` atteignent d'autres chemins de l'hôte distant (`/ext/geopf/:path*`) | 8 rewrites à chemin EXACT, un par appel réel de l'appli ; tout autre `/ext/*` répond 404. Les hôtes de destination sont fixes (aucun paramètre ne peut les changer) | `vercel.json` · `src/lib/security/vercel-config.test.ts` (couverture des appels du code source, chemins d'évasion `..`, `//`, `@`, `%2e%2e`) |
| XSS, clickjacking, fuite de position, détournement de capteurs | CSP stricte (`script-src 'self'`, `connect-src` = soi + Supabase, `frame-src 'none'`, `upgrade-insecure-requests`…), HSTS 2 ans, COOP/CORP `same-origin`, `X-Frame-Options: DENY`, `X-DNS-Prefetch-Control: off`, Permissions-Policy minimale (seules `camera` et `geolocation` pour notre origine) | `vercel.json` · `vercel-config.test.ts` + vérification navigateur (§5) |
| Import JSON hostile : pollution de prototype (`__proto__`, `constructor`), fichier géant, textes géants, volumes, nombres non finis | Fichier > 10 Mo refusé avant lecture ; clés dangereuses retirées partout (champs connus validés un à un, champs inconnus copiés nettoyés) ; 50 jardins, 20 000 plantes, 50 000 tâches ; noms/adresses 500 caractères, notes 5 000 ; contours ≤ 5 000 points, 1 000 bâtiments, relief ≤ 129 × 129 ; coordonnées ≤ 1 000 km ; identifiants ≤ 128 caractères et jamais `__proto__` | `src/lib/migrate.ts`, `src/lib/security/{limits,sanitize,import}.ts` · `security.test.ts` |
| Identifiant de photo forgé dans un import (`getPhoto('permajardin:state:v1')` lisait l'état, `deletePhoto` pouvait l'effacer) | Seul `photo:` + alphanumérique est accepté, à l'import (filtré, 20 par plante) ET dans `getPhoto`/`deletePhoto`/`listPhotoIds` | `src/lib/photos.ts`, `sanitize.ts` · tests « photos : identifiants forgés » |
| Photo piégée côté navigateur (saturation mémoire au décodage) | Fichier ≤ 40 Mo, en-tête lu avant décodage (≤ 16 000 px et 120 Mpx), bitmap contrôlé | `src/lib/photos.ts` · tests « bombe de décompression » |
| Fuite de position GPS dans les photos | Toute photo est redessinée sur un canvas puis ré-encodée en JPEG avant stockage et avant envoi à Pl@ntNet : EXIF, GPS, XMP, miniature disparaissent. **Prouvé** dans Chromium (§5) | `src/lib/photos.ts`, `security/image.ts` (`jpegMetadataSegments`) |
| Droit à l'effacement (RGPD art. 17) | `eraseAllData()` : IndexedDB (état, copie avant migration, photos), `localStorage` (`permajardin:*`, `pj-*`, `sb-*`), caches de tuiles `ign-*`, instantané ou compte Supabase, déconnexion locale ; rapport par étape ; les autres onglets sont vidés (message `erased`) | `src/lib/security/erase.ts`, `store.ts` (`wipeLocalData`), `sync.ts` · `security.test.ts`, `store.test.ts`, `sync.test.ts` |
| Un autre onglet réécrit l'ancien état après l'effacement | Message `erased` sur le `BroadcastChannel` : l'onglet vide sa mémoire et annule ses écritures en attente | `store.ts` · test « un autre onglet vide aussi sa mémoire » |
| Fuite entre utilisateurs, accès anonyme, `TRUNCATE` (ignore la RLS) | RLS + politiques `to authenticated` par `(select auth.uid())` ; `revoke` des droits `anon`/`public` et de `truncate, references, trigger` ; contrainte « data est un objet JSON » ; fonction de déclencheur non appelable. **Prouvé** sur Postgres (§3) | `supabase/migrations/20261019000000_security_hardening.sql`, `docs/securite-rls-test.sql` |
| Compte et adresse e-mail impossibles à supprimer | `delete_my_account()` (SECURITY DEFINER sans argument, n'efface que `auth.uid()`, réservée aux connectés) ; `deleteMyAccount()` côté client | migration ci-dessus, `sync.ts` |
| Saisie d'adresse e-mail abusive envoyée à Supabase | Adresse validée et rognée avant l'appel ; `emailRedirectTo` construit sur notre propre origine (la liste blanche de redirections est côté Supabase, §6) | `sync.ts` · test « sendMagicLink refuse une adresse invalide » |
| Entraide : lecture des messages d'autrui, usurpation, quotas contournés, énumération, aspiration des annonces, photos orphelines ou en excès, XSS, injection de filtre | Voir §8 (RLS sur 9 tables, droits par colonne, déclencheurs, politiques Storage resserrées, lecture limitée à ~55 km, identifiants validés en UUID). **Prouvé** sur Postgres 16 (159 contrôles) | `supabase/neighbors/migrations/20261023000000_neighbors.sql`, `supabase/neighbors/tests/run.sh`, `src/lib/neighbors/{api,migration}.test.ts` |
| Contournement de la limite par IP en changeant d'adresse IPv6 (un abonné a au moins un /64) | Clé de limitation = réseau /64 pour l'IPv6, adresse pour l'IPv4 (`rateKey`) | `api/identify.ts` · tests « rateKey » |
| Entraide : écrire à, bloquer ou signaler un identifiant connu mais invisible (hors zone, banni) ; lire son pseudo et son quartier | Ouverture de conversation limitée aux personnes dont on voit une annonce ouverte ou une réponse (`neighbors_can_contact`), annonce citée écrite par un participant ; blocage et signalement de profil exigent un profil visible ; réponses identiques (42501) | migration d'entraide · `scenarios_audit.sql` (A2, A3, A4) |
| Entraide : photo d'un autre membre qui n'est pas une image ou qui sature la mémoire au décodage | `getPhotoUrl` lit l'en-tête (JPEG/PNG/WebP réel, ≤ 4 096 px et 16 Mpx) avant de créer l'URL `blob:` | `src/lib/neighbors/api.ts` · tests « getPhotoUrl refuse… » |
| Identifiant d'espèce forgé (`constructor`, `toString`) venant d'une annonce, d'un import ou d'une synchro | `SPECIES_BY_ID` sans prototype | `src/data/species/index.ts` · test « catalogue : identifiants hostiles » |
| Dépendances vulnérables, workflow CI compromis | Dependabot hebdomadaire (npm + actions), CI en lecture seule sans secret ni `pull_request_target`, `npm ci --ignore-scripts`, audit de production | `.github/dependabot.yml`, `.github/workflows/ci.yml` |

## 2. Constats de l'audit (honnêtes)

- **Secrets** : `git log -p --all` et l'arbre de travail ne contiennent aucune clé (`sk-`, `eyJ…`, `api-key=…`, PEM, `service_role`, URL Supabase réelle). `.env*` est ignoré (sauf `.env.example`, vide). `.claude/` ne contient aucun secret. La clé `anon` est publique par conception ; `service_role` n'apparaît nulle part.
- **Code de l'interface** (lu et recherché) : ni `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, `window.open`, `javascript:`, ni lien externe, ni `postMessage` hors `BroadcastChannel` du même site. Les étiquettes 3D (`drei Html`) affichent du texte React (échappé). MapLibre : `attributionControl: false`, aucun `Popup`/`setHTML`.
- **Dépendances** : `npm ci` cohérent avec le lockfile ; un seul script d'installation (`esbuild`). `npm audit --omit=dev` : **1 critique** — `maplibre-gl` ≤ 6.4.0, XSS dans `DOM.sanitize()` de l'attribution (GHSA-jrc7-96c5-q579). **Non exploitable ici** (re-vérifié le 23/10 : `DOM.sanitize` est absent de la 4.7.1 installée ; `MapView` ajoute un `AttributionControl` compact mais son texte est la constante `© IGN – Géoplateforme`, jamais une donnée venant d'un utilisateur ni d'un service), mais le correctif exige une montée de version majeure (6.x) à planifier avec l'agent cartographie. `npm audit` complet : 23 alertes, toutes hors production (outils de build et de test : `vite` 5, `vitest`/`tinypool`, `@vercel/node`/`tar`, `vite-plugin-pwa`) ; elles concernent le serveur de développement et l'installation, pas le site déployé.
- **Les 4 proxys** : l'hôte de destination est fixe ; aucun paramètre de chemin ne peut le changer. Le point faible était l'accès à *tous* les chemins de l'hôte distant (corrigé). Les paramètres de requête sont transmis tels quels : un tiers peut utiliser le proxy comme relais de bande passante vers l'IGN/Open-Meteo (ex. `WIDTH=2048` en WMS). Non corrigeable dans `vercel.json` sans risque de casser des navigateurs : voir §6 (règle de limitation du pare-feu Vercel).
- **Cookies et en-têtes de l'utilisateur** : l'appli ne pose aucun cookie (`document.cookie` vide, aucun cookie dans le contexte de test, aucune requête `/ext/*` avec cookie). Si Vercel transmet les en-têtes du navigateur aux hôtes distants lors d'un rewrite externe, il n'y a donc rien de sensible à transmettre. Le comportement exact de Vercel n'a pas pu être vérifié sans déploiement.
- **Coordonnées envoyées à Open-Meteo : 2 décimales (≈ 1 km)** (`roundCoord` et `toFixed(2)` dans `weatherProviders`, corrigé depuis l'audit du 18/10 ; la clé de cache `pj-meteo:` aussi).
- **Import JSON de l'interface** : `SettingsPage.tsx` appelle maintenant `readBackupFile` (taille limitée avant lecture, clés dangereuses retirées). Constat du 18/10 corrigé.
- **Stockage persistant** : `navigator.storage.persist()` est appelé au chargement (comportement conservé). Chrome décide sans demander ; Firefox affiche une fenêtre de permission dès la première visite, sans contexte. À reconsidérer côté interface (le demander après la création du premier jardin).
- **Message 503 de l'API** : il indique publiquement que la clé Pl@ntNet manque (et comment la configurer). Info faible, utile au propriétaire ; à rendre générique si l'appli devient publique.

## 3. Supabase (synchronisation privée)

- RLS activée, politiques `select/insert/update/delete` `to authenticated` avec `(select auth.uid()) = user_id`, aucun droit à `anon`, déclencheur `updated_at` serveur, contrainte de taille (5 Mo) et de forme (objet JSON).
- **Test des règles** : `docs/securite-rls-test.sql` (base LOCALE jetable uniquement). Cas : A ne lit, n'insère pour B, ne modifie, ne supprime, ne réaffecte rien de B ; `anon` n'accède à rien ; `TRUNCATE` refusé ; `updated_at` non falsifiable ; `delete_my_account()` n'efface que le compte appelant. Exécuté ici sur PGlite (Postgres 16 en WebAssembly) avec un environnement imitant Supabase (rôles `anon`/`authenticated`, `auth.uid()`, privilèges par défaut `ALL`). Sans la migration n° 3 le test échoue (« tableau JSON accepté », « A a pu TRUNCATE ») ; avec elle il passe, y compris rejoué deux fois. Il n'a PAS été exécuté sur un vrai projet Supabase (consigne : rien n'est exécuté sur un projet réel).
- **Jetons** : `supabase-js` garde la session dans `localStorage` (`sb-<ref>-auth-token`). Un script injecté pourrait la lire ; la CSP (`script-src 'self'`, pas d'`unsafe-inline` pour les scripts) est la parade. Flux PKCE, jeton jamais dans l'URL après nettoyage (`history.replaceState`).
- **Redirection** : `emailRedirectTo = location.origin + '/'` : pas de redirection ouverte côté appli, car la valeur est notre propre origine ; c'est la liste « Redirect URLs » de Supabase qui fait foi (§6 : pas de joker `*.vercel.app`).
- **Énumération d'e-mails** : `signInWithOtp` répond de la même façon que le compte existe ou non tant que la création de compte (`shouldCreateUser`, par défaut vrai) est autorisée. Ne pas désactiver les inscriptions sans revoir ce point.
- Limites d'envoi de liens magiques et CAPTCHA : réglages du tableau de bord, voir §6.

## 4. Permissions du navigateur

| Permission | Où demandée | Pourquoi | Si refusée |
| --- | --- | --- | --- |
| Notifications | Tâches > « Activer les rappels », sur clic uniquement (jamais au chargement) | Un rappel local par jour au plus | Aucun rappel, le reste fonctionne |
| Photos | `<input type=file accept=image/*>` (fiche plante, identification) : sélecteur du système | Choisir une photo | Pas de photo |
| Stockage persistant | Au chargement (`navigator.storage.persist`) | Éviter l'effacement par le navigateur | Données conservées mais effaçables : message de sauvegarde |
| Géolocalisation | Scan du jardin, « Je suis ici » et photos du jardin, **seulement après un appui** (`src/features/scan/gps.ts`) ; la position reste sur l'appareil | Placer une plante ou un point à votre position | Placement à la main sur la carte |
| Caméra | `getUserMedia` (photos du jardin, scan), seulement après un appui ; micro jamais (`audio: false`, `microphone=()`) | Prendre les photos ; elles restent sur l'appareil | Choix d'une photo dans les fichiers |
| Capteurs de mouvement | `deviceorientation` (boussole des photos du jardin), après un appui ; `accelerometer/gyroscope/magnetometer=(self)` | Ranger les photos par direction | Direction de départ saisie à la main |
| Écran allumé | Wake Lock pendant la prise de photos et le scan (`src/lib/wakeLock.ts`), sans demande | Éviter que l'écran coupe la caméra | L'écran suit les réglages du téléphone |

Service worker : portée `/`, `navigateFallbackDenylist` pour `/api/` et `/ext/`. Mis en cache : le code (précache), le chunk 3D, les tuiles IGN (`ign-tuiles`, `ign-ortho-3d`). Jamais en cache : `/api/*`, `/ext/meteo*`, le géocodage, aucun jeton. Les caches de tuiles révèlent les lieux consultés : ils sont vidés par `eraseAllData()`.

`localStorage` (aucune donnée sensible hors position arrondie) : `permajardin:theme`, `permajardin:last-export`, `permajardin:last-export-reminder`, `permajardin:first-use`, `permajardin:last-notification`, `permajardin:offline-ready-shown`, `permajardin:last-synced:<id utilisateur>`, `pj-meteo:<lat>,<lon>` et `pj-climat:<lat>,<lon>` (3 décimales), `sb-<ref>-auth-token` (Supabase). Un test (`security.test.ts`) vérifie que toute clé écrite par le code est couverte par l'effacement.

## 5. Vérification en navigateur (rejouable)

1. `npx vite build --outDir <dossier-temporaire>` (sans `typecheck`, dossier hors dépôt).
2. Petit serveur Node qui sert ce dossier avec les en-têtes et rewrites de `vercel.json` et des réponses factices pour `/ext/*` (`vite preview` n'applique pas `vercel.json`).
3. Playwright/Chromium : jardin de test écrit dans IndexedDB, rechargement, parcours Carte, 3D, Plantes, Entretien, Planter, Réglages, Catalogue, ajout d'une photo contenant EXIF + GPS + XMP.

Résultats du 18/10/2026 : tous les en-têtes présents ; **aucune violation CSP** (événements `securitypolicyviolation` et console) ; carte MapLibre et canvas 3D affichés ; service worker enregistré (`upgrade-insecure-requests`, COOP et CORP n'ont rien cassé) ; `document.cookie` vide ; `/ext/geopf/autre` et `/ext/geopf/wmts/../apicarto` → 404 ; photo d'origine avec `GPSLatitude`, `Exif`, XMP → photo stockée **sans** aucun de ces segments (seuls JFIF, ICC et tables JPEG restent). `Permissions-Policy` : le nom `bluetooth` est inconnu de Chromium (avertissement) : retiré. Ce banc n'a pas pu tester Safari/Firefox ni le vrai Vercel.

## 6. Réglages à faire par le propriétaire

**Vercel**
- `PLANTNET_API_KEY` : portée *Production* seulement (pas Preview/Development), variable *Sensitive*. Jamais une variable `VITE_*` pour un secret (elles sont publiques dans le JavaScript).
- Pare-feu (Security > Firewall) : règle de limitation de débit sur `/api/identify` (ex. 10 par minute et par IP) et sur `/ext/*` ; c'est le seul limiteur réellement partagé entre instances (celui du code est un garde-fou par instance). Activer « Attack Challenge Mode » seulement en cas d'attaque.
- Settings > Deployment Protection : protéger les prévisualisations ; la production reste publique.
- 2FA sur le compte, droits minimaux dans l'équipe, accès journaux limité. Les journaux Vercel contiennent adresses IP et URL (durée selon l'offre).
- Si un domaine personnalisé est utilisé : `includeSubDomains` (HSTS) impose HTTPS sur tous ses sous-domaines.

**Supabase** (Authentication)
- URL Configuration : *Site URL* = domaine de production ; *Redirect URLs* = `https://<domaine>/**` et `http://localhost:5173/**`, **sans** joker de type `https://*.vercel.app/**`.
- Rate Limits : limiter les e-mails envoyés par heure ; activer CAPTCHA (Turnstile/hCaptcha) pour les liens magiques dès que l'appli est publique (demande une adaptation du client : `captchaToken`).
- Expiration du lien (OTP expiry) courte (≤ 1 h). SMTP personnalisé si le volume augmente.
- Appliquer la migration `20261019000000_security_hardening.sql`. Activer les sauvegardes selon l'offre ; vérifier le conseiller « Security Advisor » du tableau de bord.
- Ne jamais exposer `service_role` (ni en `VITE_*`, ni dans le dépôt).

**GitHub**
- Protection de la branche `main` : pull request obligatoire, au moins 1 relecture, vérification d'état « CI » requise, branche à jour, pas de force-push ni de suppression, historique linéaire, conversations résolues.
- 2FA obligatoire ; *Secret scanning* et *Push protection* activés ; *Dependabot alerts* et *security updates* activés ; *Private vulnerability reporting* activé (Settings > Code security) ; Actions : « Read repository contents » par défaut, `GITHUB_TOKEN` en lecture seule.
- Limiter les accès en écriture au strict nécessaire.

## 7. Ce que l'interface doit brancher

Déjà fait (`PrivacyCard.tsx`) : `eraseAllData({ remote: 'none' | 'snapshot' })`, `DATA_INVENTORY`, `PERMISSIONS`.

Fait depuis : import par `readBackupFile`, consentements (Pl@ntNet, synchro, entraide), textes légaux. Reste à faire :
1. ~~Importer~~ (fait).
2. ~~Suppression du compte de synchronisation~~ (fait : « Effacer toutes mes données » propose trois niveaux, dont la suppression du compte de synchro et du compte d'entraide ; voir §9, constat O1). Ancien énoncé : proposer `remote: 'account'` dans l'effacement et, dans Synchronisation, « Supprimer mes données en ligne » (`deleteRemoteSnapshot()`) et « Supprimer mon compte » (`deleteMyAccount()`) de `lib/sync` ; ces fonctions et `eraseAllData({ remote: 'account' })` existent et sont testées, mais aucun écran ne les appelle. Gérer l'erreur `Adresse e-mail invalide.` de `sendMagicLink`.
3. **Confidentialité** : afficher aussi le texte de `docs/CONFIDENTIALITE.md` (une fois complété) ; lien depuis l'écran d'accueil.
4. **Consentements** : avant le premier envoi de photo à l'identification (« vos photos sont envoyées à Pl@ntNet via notre serveur ; PermaJardin ne les conserve pas ») et avant la première synchronisation (adresse et position envoyées à Supabase).
5. Message d'erreur de `savePhoto` : « Cette photo est trop grande… » (nouveau cas).

## 8. Entraide entre voisins (audit du 23 octobre 2026)

Projet Supabase **dédié**, séparé de la synchro. Détail du schéma, des règles et de l'exploitation : `docs/ENTRAIDE.md`. La 2e passe (§9) a ajouté des défenses et porté le banc à 185 contrôles.

**Méthode.** Lecture ligne à ligne de la migration et du client, puis exécution réelle sur un Postgres 16.15 jetable avec un faux environnement Supabase (rôles `anon`/`authenticated`/`service_role`, `auth.uid()` lu dans `request.jwt.claim.sub`, `storage.objects` avec RLS, privilèges par défaut `ALL` comme sur Supabase). `supabase/neighbors/tests/run.sh` applique la migration deux fois (idempotence) et rejoue 159 contrôles. Limites du banc : ce n'est pas PostgREST ni le service Storage (les en-têtes, le type MIME réel et la limite de taille sont appliqués par Storage, non testés ici), ni un vrai projet Supabase.

**Défauts trouvés et corrigés**

| # | Gravité | Défaut | Correction |
| --- | --- | --- | --- |
| 1 | Élevée | Politique Storage `select` : tout membre pouvait lister et lire **tous** les dossiers `<user_id>/` du bucket (énumération de tous les comptes, photos d'annonces masquées, bloquées ou expirées) | Lecture limitée à ses propres photos et à celles d'annonces visibles (RLS de `posts` appliquée) |
| 2 | Élevée | Aspiration : un seul compte lisait toutes les annonces du pays (pseudos et quartiers de tous) | `neighbors_can_see_cell` : lecture dans ~55 km autour de son quartier ; 5 changements de profil par jour |
| 3 | Élevée | `deleteMyAccount` ignorait l'erreur de `list`/`remove` du Storage (le SDK ne lève pas, il renvoie `{error}`) : compte supprimé et photos laissées | Toute erreur arrête l'opération ; boucle bornée ; test |
| 4 | Moyenne | Pas de plafond de stockage : envois illimités de fichiers de 1 Mo, noms libres (sous-dossiers, `.html`) | Nom imposé `<uid>/<uuid>.jpg`, 20 fichiers par personne (fonction `neighbors_my_photo_count` : une sous-requête directe sur `storage.objects` provoque « infinite recursion detected in policy », constaté) |
| 5 | Moyenne | Photos des annonces expirées jamais effacées : la purge SQL laissait les fichiers au-delà des 60 jours annoncés | `neighbors_purge_expired()` renvoie les chemins à effacer, `neighbors_orphan_photos()` liste les orphelins ; procédure quotidienne |
| 6 | Moyenne | Les photos, servies par lien signé, étaient bloquées par la CSP (`img-src 'self' data: blob:`) ou auraient imposé d'élargir la CSP | `getPhotoUrl` télécharge avec la session et rend une URL `blob:` (type image vérifié) |
| 7 | Moyenne | Un client pouvait consommer le quota d'une autre personne (le déclencheur s'exécutait avant le contrôle RLS) et sonder son état (`not_member`, `quota_exceeded`) | `neighbors_assert_self` au début de chaque déclencheur |
| 8 | Moyenne | Faux comptes jetables : 3 comptes neufs masquaient n'importe quelle annonce | Seuls comptent les signalements de comptes de plus de 24 h et non bannis |
| 9 | Moyenne | On pouvait signaler (et donc masquer) du contenu invisible pour soi (bloqué, hors zone) ; fil de discussion rattaché à une annonce invisible | `reports_insert` et `threads_insert` exigent un contenu visible de l'appelant |
| 10 | Moyenne | Bannissement : le masquage des contenus était une étape manuelle (oubliable) ; aucune trace des décisions | Déclencheur de masquage au bannissement, table `moderation_log` (RLS sans accès client) |
| 11 | Moyenne | `closePost`/`reopenPost` réussissaient en silence sur une annonce masquée (aucune ligne touchée) | Retour vérifié, erreur claire |
| 12 | Faible | Pseudo : caractères invisibles ou de direction (usurpation visuelle), pseudo sans lettre | Contrainte SQL `profiles_pseudo_check` + validation client ; textes libres : marques de direction et contrôles retirés |
| 13 | Faible | Identifiants venant de l'interface envoyés tels quels aux filtres PostgREST | `assertUuid` partout (aucune requête sinon), minuscules (l'ordre `user_a < user_b` en dépend) |
| 14 | Faible | `reason in REPORT_REASONS` acceptait `constructor`, `toString`… ; cible de signalement non validée ; rayon NaN | `Object.hasOwn`, liste de cibles, rayon borné |
| 15 | Faible | `translateError` renvoyait tout message serveur contenant une lettre accentuée | Seuls les messages de `http.ts` passent |
| 16 | Faible | Nom de fichier de repli `Math.random` si `randomUUID` absent | UUID v4 par `getRandomValues`, sinon refus |
| 17 | Faible | Extension `pgcrypto` créée sans besoin (`gen_random_uuid` est natif) | Supprimée |
| 18 | Faible | Plus de 30 annonces ouvertes possibles par personne (5 par jour pendant 60 jours) | Plafond de 30 annonces ouvertes |
| 19 | Faible | Signalements conservés sans limite | Purge à 12 mois (et journal de modération 12 mois) |

**Ce qui a été attaqué sans succès (extraits des 159 contrôles)** : lecture de `profiles`, `posts`, `quotas`, `moderation_log` par `anon` ; appel RPC des fonctions de déclencheur, de `neighbors_take_quota`, de la purge ; insertion de `banned_at`, `cell_*`, `status`, `expires_at` ; `select banned_at`/`select *` sur `profiles` ; faux auteur sur annonce, réponse, message, signalement ; photo hors du dossier de l'auteur ou avec `..` ; 6e annonce du jour, suppression qui rend le quota (non) ; lecture d'une conversation par un tiers, envoi dans une conversation étrangère, modification ou suppression d'un message ; contournement d'un blocage (annonces, profil, réponses, conversation, nouvelle conversation) dans les deux sens ; faux blocage de pseudo ; réouverture d'une annonce masquée par son auteur ; suppression de signalements ; compte supprimé (cascade complète) ; compte banni (ne lit ni n'écrit).

**Reste à la charge de l'éditeur** (non testable ici) : voir « Étapes pour le propriétaire » dans `docs/ENTRAIDE.md`, notamment région UE du projet, désactivation des connexions anonymes, SMTP, CAPTCHA, pas de Realtime, purge quotidienne avec effacement des fichiers.

**Ce que l'interface doit faire** (non modifié ici) : appeler `URL.revokeObjectURL` sur les URL rendues par `getPhotoUrl` ; afficher pseudos et textes dans un élément isolé (`<bdi>` ou `unicode-bidi: isolate`) ; traiter l'erreur « annonce ne peut plus être modifiée » de `closePost`/`reopenPost` ; afficher le motif de limite `post_open` (déjà traduit par `translateError`) ; ajouter `sb-neighbors-auth-token` à la déconnexion lors de « Effacer toutes mes données » (la clé commence par `sb-` : elle est déjà effacée, mais la session côté serveur ne l'est pas ; appeler `signOut()` de l'entraide) ; ne jamais afficher `session.email` à un autre membre.

## 9. Audit complet, 2e passe hostile (23 octobre 2026)

Périmètre : tout le dépôt sur la branche courante (front, `api/`, `vercel.json` et build, les 4 migrations SQL, CI, dépendances, historique git, documents juridiques). Les audits précédents n'ont pas été pris pour acquis.

**Méthode et preuves**
- Lecture intégrale de `api/identify.ts`, `vercel.json`, des 4 migrations, de `sync.ts`, `neighbors/{api,client}.ts`, `consent.ts`, `erase.ts`, `inventory.ts`, `legal.ts`, `main.tsx` ; recherche exhaustive des puits dangereux (`innerHTML`, `dangerouslySetInnerHTML`, `eval`, `window.open`, `href`, `postMessage`, `createObjectURL`, `localStorage`, `fetch`) : seuls des usages sûrs.
- `npm run build` hors dépôt, une fois sans variables, une fois avec de fausses `VITE_*` : aucun script inline, aucun `eval`/`new Function`, aucune source map, seuls hôtes présents dans le bundle : `*.supabase.co` (fournis par l'environnement) ; aucune ressource externe (polices, CDN) : la CSP correspond au build.
- Postgres 16 jetable (socket Unix, aucune connexion réseau) : `supabase/neighbors/tests/run.sh` (application deux fois, `scenarios.sql` puis le nouveau `scenarios_audit.sql`) : **185 PASS, 0 FAIL** ; `docs/securite-rls-test.sql` rejoué sur les migrations de synchro : 4 « OK ». Inventaire des droits : `has_function_privilege`, `column_privileges`, `relrowsecurity` (toutes les tables : RLS, aucune fonction appelable par `anon`).
- Attaques SQL écrites et exécutées AVANT correction, et qui réussissaient (membre A : conversation ouverte avec un membre hors zone puis lecture de son pseudo et de sa cellule `10.00`/`Carole` ; blocage d'un identifiant invisible renvoyant son pseudo ; signalement de profil invisible ; profil créé avec `is_anonymous`) ; après correction, chacune est un test de `scenarios_audit.sql`.
- `npm audit` (prod et complet), `git log --all -p` (clés, jetons, e-mails), `git ls-files`.

**Constats corrigés**

| # | Gravité | Constat | Scénario | Correctif · preuve |
| --- | --- | --- | --- | --- |
| C1 | Moyenne | `threads_insert` n'exigeait que « je suis participant, non bloqué, annonce citée visible » | Connaissant l'UUID d'un membre (vu dans une annonce, puis hors zone, ou banni), j'ouvre une conversation avec lui : j'obtiens alors, via `profiles_select`, son pseudo et son quartier, et je peux lui écrire ; je pouvais aussi citer l'annonce d'un tiers pour tromper le destinataire. Contredit la règle annoncée « un profil n'est lisible que s'il a un contenu visible » | `neighbors_can_contact(other)` (définer : membre, non banni, sans blocage, annonce ouverte ou réponse visible dans la zone) + annonce citée écrite par un participant. `scenarios_audit.sql` A2, A4. (Une première version par sous-requête sur `profiles` donnait « infinite recursion detected in policy » : d'où la fonction.) |
| C2 | Moyenne | `blocks_insert` copiait le pseudo de n'importe quel UUID existant (lisible ensuite dans `blocks`) ; `reports_insert` et le déclencheur répondaient différemment selon que le profil existait | Sondage d'identifiants : existence et pseudo d'un membre invisible | `blocks_insert` et `reports_insert` (profil) exigent un profil visible ; le déclencheur répond 42501 pour annonce, réponse et profil inexistants. A3 |
| C3 | Moyenne | `neighbors_can_see_cell` : fenêtre de longitude fixe de 1,5° (~112 km d'est en ouest à Paris, 2× les « ~55 km » annoncés aux membres et dans le texte légal) | Un seul compte aspire pseudos et quartiers d'une zone 2 fois plus large que promis | Fenêtre `0,55° / cos(latitude)` (plafond 6°). A1 (73 km à l'est : invisible ; 37 km : visible) |
| C4 | Moyenne | `/api/identify` : limite par adresse IPv6 complète | Un abonné IPv6 dispose d'un /64 : une adresse différente par requête contourne les 20 / 10 min, et fait tomber le plafond global (150 / 10 min) pour tous, ou épuise les 500 identifications du jour | `rateKey` : un /64 = une clé. Tests « rateKey » (1 000 adresses d'un /64 = 1 clé) |
| C5 | Faible | Connexions anonymes Supabase (rôle `authenticated`) : `profiles_insert` ne les excluait pas | Si l'option est activée par erreur, des comptes sans e-mail créent des profils et publient | `profiles_insert` refuse `is_anonymous`. A5 |
| C6 | Faible | `getPhotoUrl` se fiait au type MIME annoncé par le stockage | Un membre malveillant envoie 1 Mo qui se déclare JPEG : contenu non image, ou en-tête annonçant 30 000 × 30 000 px, que le navigateur des voisins décode | En-tête vérifié (JPEG/PNG/WebP réel, ≤ 4 096 px, 16 Mpx). Tests |
| C7 | Faible | `SPECIES_BY_ID['constructor']` renvoyait la fonction `Object` | Une annonce avec `species_id = 'constructor'` affiche un bouton de fiche vide | Objet sans prototype. Test |
| C8 | Faible | CSP `wss://*.supabase.co` inutile (aucun Realtime) | Canal d'exfiltration en plus en cas de XSS | Retiré. `vercel-config.test.ts` |
| C9 | Faible (doc) | `docs/DEPLOIEMENT.md` omettait la migration n° 3 (`delete_my_account`, retrait de `TRUNCATE`) et la portée de la clé Pl@ntNet | Un déploiement « selon le guide » n'a ni droit à l'effacement du compte ni protection contre `TRUNCATE` | Guide corrigé |
| C10 | Info (doc) | Inventaire/pages légales périmés : Open-Meteo « 3 décimales » (2 en réalité), IP et navigateur conservés par Supabase Auth non cités, promesse « Réglages > Synchronisation : supprimer mon compte » sans écran | Information inexacte (RGPD art. 13) | `inventory.ts` corrigé, `docs/CONFIDENTIALITE.md` régénéré |

**Constats ouverts (décision ou action du propriétaire)**

| # | Gravité | Constat | Action |
| --- | --- | --- | --- |
| O1 | ~~Élevée (conformité)~~ **Corrigé** | Aucun écran n'appelle `deleteMyAccount()` ni `eraseAllData({ remote: 'account' })` : l'adresse e-mail du compte de synchro ne peut pas être supprimée par la personne. « Effacer toutes mes données » (`PrivacyCard.tsx`) ne propose que `snapshot`, et ne dit rien du compte et des annonces de l'entraide, qui restent en ligne (seule la session est fermée). | UI : case « Supprimer aussi mon compte » (`remote: 'account'`), et, pour l'entraide, renvoi vers Entraide > Mon compte (ou appel de `deleteMyAccount` de `neighbors/api`). En attendant, le texte dit d'écrire à l'éditeur : il faut une adresse de contact (voir O3) |
| O2 | ~~Moyenne~~ **Corrigé (27/10)** | `maplibre-gl` ≤ 6.4.0 : avis critique GHSA-jrc7-96c5-q579 | Montée en 6.16.0 (≥ 6.4.1) ; l'audit de production ne tolère plus aucun avis |
| O3 | Moyenne | Champs légaux `[à compléter]` (éditeur, adresse, contact, hébergeur Supabase) et contact de `SECURITY.md` ; les textes de consentement affirment « Supabase, UE » alors que la politique dit « à confirmer » | Créer les projets Supabase en région UE avant publication ; compléter `legal.ts` ; faire valider par un professionnel ; activer « Private vulnerability reporting » sur GitHub |
| O4 | Moyenne | « Annonces supprimées après 60 jours, photos comprises » n'est vrai que si `neighbors_purge_expired()` et `neighbors_orphan_photos()` sont planifiés et si les fichiers listés sont effacés par l'API Storage : rien ne le fait automatiquement | Planification quotidienne (pg_cron + fonction ou script avec clé `service_role` hors dépôt) avant l'ouverture publique |
| O5 | ~~Moyenne~~ **Atténué (v6)** | Quartier = cellule de 0,01° (~1 km) : en zone rurale une cellule pouvait ne contenir qu'un foyer | Cellule de 2 km par défaut (pas 0,02° x 0,03°), « large » de 5 km au choix (0,05° x 0,07°), arrondi refait par la base (§13). Reste vrai : en très faible densité, même 5 km peut ne contenir qu'un foyer ; le pseudo et les photos de jardin restent à la charge de la personne |
| O6 | Faible | `/api/identify` : un appel sans `Origin`/`Sec-Fetch-Site` (curl, script) est accepté, le limiteur est par instance | Règle de limitation du pare-feu Vercel (voir §6) ; CAPTCHA si l'appli devient publique |
| O7 | Faible | `connect-src https://*.supabase.co` : n'importe quel projet Supabase | Une fois les deux projets créés, remplacer par leurs deux adresses exactes dans `vercel.json` (et adapter `vercel-config.test.ts`) |
| O8 | ~~Faible~~ **Sans objet** (27/10) | `camera=(self)` et `geolocation=(self)` sont désormais utilisées (photos du jardin, scan) : la politique est juste. Ancien constat : « ni `getUserMedia` ni la géolocalisation ne sont utilisées » | Tester `camera=()` sur iOS et Android (le sélecteur de fichiers ne dépend pas de cette politique selon les spécifications, non vérifié ici) |
| O9 | Faible | CI : actions épinglées par étiquette (`@v4`) et non par empreinte ; l'audit des dépendances ne bloque pas | Épingler par SHA (Dependabot suit) |
| O10 | ~~Faible~~ **Corrigé (28/10)** | 18 alertes `npm audit` hors production (outillage) | `@vercel/node` retiré (il ne servait que pour deux types, désormais dans `api/_vercel-types.ts`), vite 7, vitest 5, vite-plugin-pwa 2, `npm audit fix` : **`npm audit` complet : 0 alerte** |
| O11 | Info | Historique git : un commit signé `emiletaraud942-sketch <emiletaraud942@gmail.com>` ; `.claude/agents/devops-vercel.md` cite le nom d'équipe Vercel | Si le dépôt devient public : e-mail `noreply` GitHub pour les prochains commits (réécrire l'historique n'est pas nécessaire si l'e-mail est déjà public) |
| O12 | Faible | Pseudos « confusables » (a latin / a cyrillique) acceptés ; unicité sans casse seulement | Surveiller les signalements d'usurpation ; norme UTS 39 si besoin |
| O13 | Info | Par conception : n'importe quel membre peut écrire à l'auteur d'une annonce visible (10 conversations/jour) ; trois comptes de plus de 24 h masquent une annonce ; un quartier est déclaratif | Documenté dans `ENTRAIDE.md` ; modération par l'éditeur |
| O14 | Info | `supabase/migrations/20261017…` n'est pas rejouable (politiques sans `drop`) ; les suivantes le sont | Sans effet avec `db push` (appliquée une fois) |
| O15 | Info | Retirer un consentement ne ferme pas la session ni n'arrête le renouvellement du jeton d'un client déjà créé (synchro) | Acceptable (connexion = action volontaire) ; à mentionner à l'utilisateur ou à déconnecter au retrait |
| O16 | Info | Chaque démarrage connecté à la synchro renouvelle le jeton (appel Supabase) sans nouvelle demande | Idem O15 |

**Actions pour le propriétaire (avant ouverture publique)**
1. Appliquer les trois migrations de `supabase/migrations/` (synchro) et celle de `supabase/neighbors/migrations/` (entraide, version de cette passe), puis rejouer `scenarios.sql` et `scenarios_audit.sql` sur une base jetable, puis les 10 scénarios principaux à la main avec deux comptes de test sur le vrai projet.
2. Dans les deux projets Supabase : région UE, « Anonymous sign-ins » désactivés, CAPTCHA, limites d'envoi d'e-mails, liste « Redirect URLs » sans joker, SMTP dédié, pas de Realtime, uniquement le schéma `public` exposé, « Security Advisor » lancé.
3. Planifier la purge quotidienne (O4) et prévoir la suppression des comptes inactifs.
4. Vercel : `PLANTNET_API_KEY` en Production seulement et *Sensitive* ; règle de pare-feu sur `/api/identify` et `/ext/*` ; Deployment Protection sur les prévisualisations ; ne pas mettre les variables `VITE_NEIGHBORS_*` en Preview (elles pointent sur la production).
5. GitHub : protection de `main`, 2FA, secret scanning et push protection, Dependabot, signalement privé de vulnérabilités.
6. Faire valider les textes légaux (O3).

**Zones non couvertes, et pourquoi**
- Projets Supabase, Vercel et GitHub réels : consigne de n'y rien exécuter. Non testés : PostgREST (limites de lignes, en-têtes), service Storage (type MIME réel, taille), Auth (limites d'envoi, CAPTCHA), pare-feu Vercel, comportement exact des rewrites externes (en-têtes transmis, mise en cache).
- Navigateur réel : aucun Chromium dans cet environnement. La CSP a été vérifiée statiquement contre le build (scripts, styles, hôtes), pas par les événements `securitypolicyviolation` (le banc du 18/10 les avait mesurés). Safari et Firefox jamais testés.
- Validité juridique des textes (brouillons), contrats de sous-traitance, transferts hors UE.
- Intégrité de la chaîne d'approvisionnement npm au-delà de `npm audit` (pas de vérification de provenance).

## 10. Entraide v2 : « Je cherche » et catégories (25 octobre 2026)

Migration `supabase/neighbors/migrations/20261025000000_neighbors_v2.sql` : type `cherche`, colonne `category` (liste fermée, null permis), contrainte « une demande exige une catégorie », index partiel, `grant insert (category)` seul (jamais de `update` sur `kind` ni `category`). Aucune politique, aucune fonction, aucun quota modifiés. Banc rejoué (Postgres 16) : **209 PASS, 0 FAIL**, dont 24 contrôles `V2` (catégorie inconnue ou vide refusée, demande sans catégorie refusée, `kind` et `category` non modifiables, quota inchangé, hors zone sans lecture, pas de réponse publique sur une demande, contact privé et clôture par l'auteur).

## 11. Entraide v4 : événements et organisateurs (25 octobre 2026)

Migration `supabase/neighbors/migrations/20261025020000_neighbors_v4_events.sql` : tables `organizers`, `events`, `event_interest`, cible `event` pour les signalements et le journal, masquage automatique à 3 signalements, quotas (3 événements et 50 intérêts par jour, 5 demandes d'organisateur), purge 30 jours après la fin. Décision par défaut du propriétaire : seuls les organisateurs validés par l'éditeur publient. Banc rejoué sur Postgres 16.15 (migrations appliquées deux fois) : **485 PASS, 0 FAIL**, dont environ 250 contrôles `V4` (`scenarios_v4.sql`). `migration.test.ts` vérifie la migration sans Postgres ; `api.test.ts`, `logic.test.ts`, `news.test.ts` couvrent le client.

**Attaques jouées sans succès** : devenir organisateur sans validation (`not_organizer`) ; s'auto-valider par insertion, mise à jour ou upsert (aucun droit de colonne, déclencheur) ; usurper un membre (demande, événement, intérêt : 42501) ; changer de nom après validation (mise à jour et upsert refusés) ; supprimer puis recréer la fiche (repart non validée) ; publier avec une cellule, un statut, un compteur, un identifiant ou une date de création choisis ; lire hors zone, banni, bloqué ou anonyme ; liens `javascript:`, `data:`, `vbscript:`, `http:`, sans point, avec identifiants, adresse numérique, IPv6, espaces, guillemets, balises, antislash, retour à la ligne, caractères invisibles, inversion de sens, accents, 301 caractères ; dates inversées, passées, à plus d'un an ; textes trop longs ; capacités 0, négative, 10 001 ; modifier titre, dates, lien, capacité, cellule, compteur ou organisateur ; rouvrir ou « annuler » un événement masqué ; modifier ou supprimer l'événement d'autrui ; contourner les quotas (supprimer ne rend rien ; 21e événement ouvert et 51e intérêt refusés) ; intérêt pour un événement inconnu, annulé, fini ou invisible (même réponse 42501) ; lire les intérêts des autres (l'organisateur non plus) ; appeler les déclencheurs ou la purge ; se signaler soi-même, signaler deux fois, signaler l'invisible ; masquer avec des comptes de moins de 24 h (non comptés).

**Constats corrigés pendant l'écriture** (aucun n'est arrivé en production) :

| # | Gravité | Constat | Correction |
| --- | --- | --- | --- |
| E1 | Moyenne | Contrôle du lien avec `~*` (casse ignorée) : la plage exclue `\u0080-\uffff` retirait aussi `i`, `s`, `k` (ı, ſ et K se replient sur eux) : tout lien contenant un « i » était refusé | Comparaison sensible à la casse ; un scénario garde la régression (`inscription`, `ski`, `kiosque`) |
| E2 | Faible | Un lien pouvait contenir des caractères invisibles ou d'inversion de sens | ASCII seulement, côté SQL et côté client ; le client n'affiche que le nom du site, jamais le chemin |
| E3 | Faible | Le formulaire laissait le navigateur bloquer une date passée avec un message natif | `noValidate` : nos messages en français simple |
| E4 | Info | Le banc laisse `request.jwt.claim.sub` en place après chaque appel : l'éditeur simulé était pris pour le dernier membre | Le scénario remet la valeur à vide avant chaque validation (en production, le SQL Editor n'a pas d'identifiant) |

**Limites connues**
- La validation porte sur le **nom** de l'organisateur, pas sur ses événements ni sur le site d'inscription : un organisateur validé peut publier un lien vers un site hostile (signalement, retrait, avertissement « Vous quittez l'appli »). Nom ressemblant à un autre : à repérer à la validation.
- Le lieu est un texte libre : une adresse privée peut y être écrite malgré la consigne (signalement, masquage).
- Un retrait d'organisateur ou un bannissement masque les événements ; lever la mesure ne les rétablit pas (à faire à la main).
- `capacity` est indicative et ne borne pas les marques d'intérêt.
- Rejouer la v1 après la v4 remet d'anciennes versions des fonctions de signalement, de bannissement et de purge : rejouer ensuite la v4.
- Non testés ici : PostgREST réel (jointure `organizers(name, description)`), un vrai projet Supabase, un navigateur autre que Chromium.

## 12. Entraide v5 : alertes de nouveaux messages et préférences (25 octobre 2026)

Migration `supabase/neighbors/migrations/20261025030000_neighbors_v5_push.sql` : tables `push_subscriptions` et `notification_prefs`, déclencheur de plafond, fonction `neighbors_push_facts()` réservée à `service_role`. Fonction Edge `supabase/functions/notify-message/index.ts` (Deno, un seul fichier sans dépendance), service worker `public/push-sw.js`, client `src/lib/neighbors/{push,pushBridge}.ts` et `src/features/neighbors/Notifications.tsx`. Banc rejoué deux fois (Postgres 16) : **595 PASS, 0 FAIL**, dont 110 contrôles `V5` ; 69 tests vitest nouveaux (fonction : webhook, secret, décision, jeton VAPID, traitement complet avec faux réseau ; appareil : support, service worker exécuté dans un faux environnement, pont).

**Choix de conception**
- **Alerte vide** : la fonction n'envoie aucun corps. Le texte « Vous avez un nouveau message » vit dans le service worker, qui ignore tout contenu reçu. Ni texte, ni pseudo, même chiffrés, ne passent par Google, Mozilla, Apple ou Microsoft. Cela évite aussi d'écrire un chiffrement maison (RFC 8291) impossible à vérifier ici contre un vrai service d'alertes.
- **Décision hors du client et hors du webhook** : le webhook ne fournit que l'identifiant du message (le reste est ignoré) ; les faits sont relus par `neighbors_push_facts()` (aucun droit pour `anon` ni `authenticated`, renvoie identifiants, dates et indicateurs, jamais le texte ni le pseudo).
- **Sans ligne de préférences, rien ne part** ; la ligne naît à l'activation explicite des alertes.
- **Autorisation dédiée** (`notifications`) montrée avant la question du programme internet ; retirée à la déconnexion, au retrait dans Réglages et à la suppression du compte.

**Attaques jouées sans succès** (banc SQL) : lire ou supprimer les appareils d'autrui (0 ligne) ; inscrire un appareil au nom d'un autre (42501, `user_id` sans droit d'insertion) ; reprendre l'adresse d'un autre (23505) ; lire les clés `p256dh`/`auth`, même les siennes, ou `select *` (42501) ; modifier une ligne (aucun droit `update`) ; 6e appareil (`push_limit`) ; 21e abonnement du jour (quota) ; compte banni (42501) ; anon (42501) ; adresse en http, hors liste, interne (`169.254.169.254`, `localhost`), avec `@`, en faux sous-domaine, trop longue ou avec espace (23514) ; clés mal formées (23514) ; préférences d'autrui (lecture 0, écriture 0 ligne ou 42501, y compris par `on conflict … do update`) ; `user_id` modifiable (42501) ; valeur NULL ou absurde ; suppression par le client (42501) ; appel de `neighbors_push_facts` par un connecté ou anon (42501) ; cascade à la suppression du compte. Côté fonction (vitest) : webhook sans secret, mauvais secret, secret vide ou trop court, mauvaise méthode, corps abîmé ou trop gros, table ou événement inattendus, identifiant non UUID, adresse hors liste présente en base (jamais contactée), service d'alertes en panne (l'abonnement reste), 404/410 (retiré).

**Constats corrigés pendant l'écriture** (aucun n'est arrivé en production) :

| # | Gravité | Constat | Correction |
| --- | --- | --- | --- |
| P1 | Moyenne | Une adresse d'abonnement libre aurait fait envoyer par la fonction des requêtes où un membre le voulait (SSRF : adresse interne, site tiers) | Liste fermée (Google, Mozilla, Apple, Microsoft) vérifiée trois fois : contrainte SQL, fonction, client ; redirections non suivies ; délai de 8 s ; un test compare la liste SQL et celle de la fonction |
| P2 | Moyenne | Sur un appareil partagé, l'ancien compte gardait l'abonnement : les alertes de A auraient sonné chez B | Déconnexion et suppression du compte désabonnent l'appareil d'abord ; adresse déjà prise = nouvelle adresse créée ; autorisation retirée avec le désabonnement |
| P3 | Faible | Rafale : 200 messages par jour = 200 alertes | Une alerte par rafale (message précédent du même expéditeur à moins de 2 minutes), en-tête `Topic` pour que le service remplace l'alerte en attente, plafond d'âge de 15 minutes |
| P4 | Faible | Webhook forgé ou rejoué | Secret partagé comparé sans fuite de temps (condensats), identifiant seul retenu, faits relus en base, plafond d'âge |
| P5 | Info | « Rien sans case cochée » : une ligne de préférences absente valait « vrai » par défaut | Absence de ligne = pas d'alerte ; la ligne est créée à l'activation |

**Limites connues**
- Non testés : un vrai service d'alertes (Google, Mozilla, Apple, Microsoft), le runtime Deno de Supabase (la fonction est exécutée sous Node avec la même API WebCrypto et `fetch`), le déclenchement réel du webhook de base, PostgREST réel pour les « upsert » (la forme SQL équivalente est testée), iOS réel. Aucune vraie notification n'a été envoyée.
- La clé privée VAPID et le secret du webhook sont dans l'environnement de la fonction : leur fuite permettrait d'envoyer des alertes vides aux appareils inscrits (rien de plus : pas de contenu). Le secret du webhook est aussi visible des administrateurs du projet dans la définition du webhook.
- Le service d'alertes voit l'adresse IP du serveur et celle de l'appareil, l'adresse d'abonnement et l'heure de chaque signal (inévitable avec Web Push).
- Une clé publique VAPID qui ne correspond pas à la clé privée est acceptée à l'import : les services d'alertes répondent 401/403 (comptés « échecs », jamais d'abonnement retiré). À vérifier avec l'essai de bout en bout.
- La liste fermée d'adresses refuse un service d'alertes inconnu : le navigateur concerné reste sur le repli (pastille).


## 13. Entraide v6 : quartier de 2 km ou 5 km (25 octobre 2026)

Migration `supabase/neighbors/migrations/20261025040000_neighbors_v6_cell_size.sql` ; client `src/lib/neighbors/{cell,types,api,logic}.ts`, `src/features/neighbors/ProfileForm.tsx`. Décision du propriétaire, en réponse à O5.

**Mesures**
- Grille : standard = pas 0,02° x 0,03° (environ 2,2 x 2,3 km à 47° N), large = 0,05° x 0,07° (environ 5,5 x 5,3 km). Même formule `floor(x / pas + 0,5) * pas` en SQL (`neighbors_cell_snap`) et en TypeScript ; 12 000 cas comparés, 0 écart.
- `profiles.cell_size` (check `standard`/`large`, non nul). Droits colonne par colonne : écriture pour `authenticated` seulement, lecture pour ceux qui lisent déjà le profil ; `anon` : rien. `neighbors_cell_snap` et `neighbors_profile_round` ne sont appelables par aucun client.
- Le déclencheur d'arrondi suit `cell_size` ; une valeur hors grille est ramenée sur la grille.
- Profils, annonces et événements existants ré-arrondis par la migration (idempotente, sans toucher aux quotas).
- Toute coordonnée d'une requête de l'appli (écritures et bornes de liste) est sur la grille ; la position fine du jardin ne sort jamais (vérifié en navigateur, faux Supabase intercepté).

**Constat corrigé pendant l'écriture** : le déclencheur de quota (5 modifications par jour) s'exécute avant l'arrondi. Avec `cell_size`, un client aurait pu changer de taille, donc déplacer sa cellule, sans consommer de quota. Le déclencheur arrondit maintenant lui-même avant de comparer, et compte aussi le changement de taille.

**Limites connues**
- Les distances restent entre centres de cellules : l'erreur peut atteindre une demi-cellule de chaque côté (jusqu'à environ 5,5 km en large). Les libellés ne descendent jamais sous 2 km (standard) ou 5 km (large).
- La taille de l'organisateur d'un événement n'est pas lisible par les autres membres : le libellé de distance suppose la taille du lecteur.
- Un membre lit la taille de quartier des profils qu'il voit (pseudo, cellule et taille) : information déjà déductible de la cellule.
- Les anciennes annonces gardent leur cellule d'origine après un passage en « large ».

## 14. Corrections de l'audit du 27 octobre 2026, lot 1

Vérifié par `api/_tests/identify.test.ts` (49 tests), le banc d'entraide sur Postgres 16 jetable (`supabase/neighbors/tests/run.sh` : **726 PASS, 0 FAIL**, chaque migration rejouée) et `docs/securite-rls-test.sql` rejoué sur les migrations de synchro (cas anonyme compris).

| Constat | Correctif | Preuve |
| --- | --- | --- |
| O6 : `/api/identify` acceptait un appel sans `Origin`/`Referer`/`Sec-Fetch-Site` (curl, script) | `hasBrowserOrigin` : 403 sans marque de navigateur (un `fetch` POST du site envoie toujours `Origin`) | `identify.test.ts` |
| Une photo invalide consommait le plafond global de 150 requêtes | Le plafond global n'est compté qu'après validation, juste avant l'appel à Pl@ntNet | `identify.test.ts` (200 photos invalides, puis une valide passe) |
| Entraide : 5 changements de zone par jour, donc balayage de toute la France en une dizaine de jours | v7 : une zone par 7 jours (première journée du profil libre) ; colonne `cell_changed_at` sans aucun droit client ; erreur `quota_exceeded:zone` | `scenarios_v7.sql` |
| Entraide : caractères de contrôle, invisibles et de direction dans les annonces, réponses, messages, signalements, événements | Contraintes `*_text_clean` (`NOT VALID` : lignes existantes non contrôlées) ; saut de ligne et tabulation permis | `scenarios_v7.sql` |
| Synchro : un compte anonyme Supabase (option activée par erreur) pouvait stocker 5 Mo | Politique RESTRICTIVE « pas de compte anonyme » sur `garden_snapshots` | `docs/securite-rls-test.sql` |

**Non fait, volontairement**
- *Retirer l'accès direct à `neighbors_is_blocked` / `neighbors_can_contact`* : les politiques RLS appellent ces fonctions avec les droits de la personne connectée, donc un `revoke` casserait l'entraide. Elles ne renvoient que des faits qui concernent l'appelant (un blocage où il figure ; un contact qu'il peut déjà voir).
- *Conserver un extrait des contenus signalés* : change la promesse de confidentialité (« jamais le contenu signalé » dans `moderation_log`) et les textes légaux. Décision du propriétaire avant toute migration.
- *Purge à 60 jours programmée* : la fonction SQL ne supprime pas les fichiers du Storage (il faut l'API Storage, donc une Edge Function ou un script avec la clé `service_role`). Reste l'action O4 du propriétaire.

## 15. Corrections de l'audit du 27 octobre 2026, lot 2 (données locales)

Vérifié par `security.test.ts`, `store.test.ts`, `sync.test.ts` (1344 tests au total, typecheck et build).

| Constat | Correctif | Preuve |
| --- | --- | --- |
| « Effacer toutes mes données » laissait les clés `pj.…` (guide, qui contient des identifiants de jardin, LiDAR, grille, mode, qualité 3D, quota de scan…) : l'expression ne couvrait que `pj-` | `ERASABLE_LOCAL_KEY = /^(permajardin:\|pj[-.]\|sb-)/` ; le test qui parcourt le code source cherche maintenant aussi les clés `pj.xxx` (il ne voyait que `pj-xxx:`, d'où l'oubli) | `security.test.ts` |
| « Repartir de zéro » (lecture impossible : version plus récente ou format inconnu) remplaçait les données au prochain enregistrement sans copie | `resumeSaving()` copie d'abord les données sous `permajardin:state:v1:illisible` ; si la copie échoue, rien n'est remplacé. Si le stockage est totalement illisible, il n'y a rien à copier et on reprend | `store.test.ts` (2 cas) |
| Plafond de 5 Mo de la synchro compté en caractères (`length`) alors que la base compte des octets : un jardin plein d'accents ou d'emojis passait le contrôle client puis était refusé par la base (23514) | `jsonBytes` : octets UTF-8 | `sync.test.ts` |

## 16. Corrections de l'audit du 27 octobre 2026, lot 3 (en-têtes, CI, documents)

| Constat | Correctif | Preuve |
| --- | --- | --- |
| Écran qui s'éteint pendant la prise de photos | `useWakeLock` (aucune demande à l'écran) ; `screen-wake-lock=(self)` dans la Permissions-Policy | `vercel-config.test.ts` |
| CI : audit de production non bloquant (`continue-on-error`) | `scripts/audit-prod.mjs` : échec sur toute alerte high/critical hors liste courte et commentée (seul `GHSA-jrc7-96c5-q579`, maplibre-gl, toléré) ; essayé : sans l'entrée, le script sort en code 1 | CI, job « Audit des dépendances de production » |
| Pas de `security.txt` | `public/.well-known/security.txt` (RFC 9116, contact = signalement privé GitHub, expiration 27/10/2027 : **à renouveler**) ; exclu du repli du service worker | `vite.config.ts` |
| Textes de consentement : « Supabase, UE » alors que la région n'est pas confirmée | Retiré des textes de consentement ; la politique de confidentialité dit toujours « à confirmer » | `legal*.test.ts` |
| Documents périmés : capteurs « bloqués » (`CLAUDE.md`), caméra et position « jamais demandées » (ce fichier), inventaire de la fiche photos | Corrigés ; entrée « Écran allumé » ajoutée à l'inventaire | `security.test.ts` |

**Non fait** : épinglage des actions GitHub par empreinte (O9, il faut les empreintes réelles depuis GitHub, Dependabot suit ensuite), analyse de code (CodeQL) et de secrets : ce sont des réglages du dépôt (Settings > Code security : code scanning, secret scanning, push protection, signalement privé), à activer par vous ; CodeQL en workflow échouerait sur un dépôt privé sans l'option payante.

## 17. Corrections de l'audit du 27 octobre 2026, lot 6 (interface)

| Constat | Correctif | Preuve |
| --- | --- | --- |
| Caméra, boussole et GPS restaient allumés si l'on quittait l'écran pendant la demande d'autorisation (la réponse « accordée » arrive après le démontage) | `alive` : le flux accordé après la sortie est coupé aussitôt (scan vidéo, prise des photos du jardin) ; le capteur de boussole ignore une réponse arrivée après son arrêt (génération) ; le journal GPS n'est plus lancé après la sortie | `sensors.test.ts` (3 cas) |
| Aucune sauvegarde des photos | Sauvegarde avec photos : fichier `.permajardin` ; **un fichier hostile ne peut ni saturer la mémoire (photos lues par tranche, 300 Mo au plus, 8 Mo par photo, 2 000 photos), ni écrire une autre clé IndexedDB (identifiant `photo:…` seulement), ni ranger autre chose qu'une image aux dimensions plausibles** ; l'état passe par `migrateState` comme tout import | `backupFull.test.ts` (11 cas : tronqué, octets ajoutés, longueur absurde, version future, fausse image, identifiant visant `permajardin:state:v1`, photo non référencée) |
| Stockage plein : message technique ou aucun | `isQuotaError` : message en français, rien d'écrit à moitié ; import d'une sauvegarde complète : si le rangement des photos échoue, rien n'est remplacé | `photos.test.ts` |
| Bandeau de mise à jour : « Plus tard » le supprimait pour toujours ; écran 3D blanc après un déploiement (ancien nom de fichier) | Retour dans 6 h ; recherche au retour dans l'appli ; bandeau « Recharger » sur `vite:preloadError` | essai manuel dans Chromium (pas de test automatique) |
| Contraste de la pastille neutre (4,2:1) | `--muted-2` (6:1 et plus) ; pastilles de risque : 5,0:1 minimum, clair et sombre | calcul des rapports |

**Vérifié dans Chromium** (vite preview, jardin de test) : filtres du catalogue, recherche « laurier » / « pomme », pastilles et bloc « À savoir avant de planter » (rhubarbe). **Non vérifié** : appareil photo et boussole sur téléphone réel, import d'un gros fichier `.permajardin` sur un vrai téléphone, bandeau de mise à jour après un vrai déploiement.

**Vie privée** : le fichier `.permajardin` contient les photos (EXIF déjà retiré à l'enregistrement) et les positions des points de vue en photos (coordonnées locales, jamais GPS) ; il reste sur l'appareil et n'est jamais envoyé. À garder en lieu sûr comme la sauvegarde simple.

**Complément (même jour) : fichiers lourds.** Avant d'exporter, l'écran montre le poids des photos (« Sauvegarde avec photos (85 Mo) ») et prévient au-delà de 100 Mo (Wi-Fi, place libre) ; au-delà de 300 Mo l'export est **refusé** avec un message, au lieu de fabriquer un fichier que l'appli refuserait de relire. La fenêtre « Effacer toutes mes données » propose la sauvegarde avec photos (bouton principal quand il y a des photos) et la sauvegarde simple. Mesuré dans Chromium (ordinateur) avec un vrai fichier de 150 Mo / 300 photos : lecture et validation 0,9 s, rangement des photos 0,6 s, export 1,2 s, mémoire JavaScript d'environ 43 Mo avant, pendant et après (elle ne grandit pas avec la taille du fichier, les photos sont lues par tranches). Non mesuré : un vieux téléphone, où le vrai plafond est l'espace libre ; dans ce cas l'écriture échoue avec « L'espace de cet appareil est plein » et rien n'est remplacé.

## 18. Montée de maplibre-gl en 6.x (27 octobre 2026)

`maplibre-gl` 4.7.1 → **6.16.0** : l'avis critique GHSA-jrc7-96c5-q579 (XSS dans l'attribution, corrigé en 6.4.1) disparaît ; `scripts/audit-prod.mjs` n'a plus aucune entrée tolérée (`npm audit --omit=dev` : 0 alerte high/critical de production).

Changements nécessaires (cassants) : plus d'export par défaut (`import * as maplibregl`), plus d'espace de noms global `GeoJSON` (`@types/geojson` en dépendance de développement), et **le worker n'est plus dans le code principal** : une fois empaqueté par Vite, MapLibre 6 ne retrouvait pas `maplibre-gl-worker.mjs` (« Worker failed to load » : la carte perdait la parcelle, les bâtiments, les cercles) ; `src/lib/mapWorker.ts` le déclare (`?worker&url`, fichier hashé, précaché, servi par notre origine : CSP `worker-src 'self' blob:` inchangée).

**Vérifié dans Chromium** (vite preview, WebGL logiciel, jardin de test) : carte, parcelle, marqueurs, zoom et échelle, attribution « © IGN – Géoplateforme » inchangée, placement d'une plante, glissement d'un marqueur, page « Où planter ? », aucune erreur de console (hors tuiles IGN, absentes de l'aperçu local). **Non vérifié** : tuiles IGN réelles (IGN injoignable depuis le conteneur), téléphones réels (WebGL, mémoire), Safari et Firefox, mode hors ligne complet. **Coût** : précache 2,2 → 3,1 Mo (le worker pèse 520 ko, la bibliothèque 1,09 Mo).

**Fluidité et compatibilité (mesures du même jour, Chromium sans carte graphique : rendu logiciel, donc à confirmer sur téléphone).**
- Ouverture de la carte : 1,1 à 1,2 s avec la 6.16.0 contre 1,1 à 1,4 s avec la 4.7.1 ; mémoire JavaScript 14 à 15 Mo contre 12 à 14 Mo ; profil du processeur pendant un zoom presque identique (le JavaScript est au repos plus de 70 % du temps dans les deux cas).
- Vitesse de dessin pendant une animation de zoom de 1,5 s, 40 plantes : 29 à 41 rendus par seconde (6.16.0) contre 30 à 38 (4.7.1) ; au maximum 45 par seconde dans les deux versions. **Pas de ralentissement mesurable.** Une première mesure (images comptées pendant des clics de zoom espacés) avait fait croire à un écart de 17 contre 33 ms : c'était un artefact, elle mélangeait les temps de repos.
- **Vrai changement : MapLibre 6 exige WebGL 2** (la 4.x se contentait de WebGL 1). Sur un appareil sans WebGL 2 (iPhone sous iOS 14 ou moins, très vieux Android, GPU bloqué), la carte faisait planter l'écran (« Cet écran ne s'affiche pas »). Corrigé : `webgl2Supported()` (`src/lib/webgl.ts`) détecte le cas avant de créer la carte et `MapUnsupported` affiche « La carte ne peut pas s'afficher sur cet appareil… Vos jardins et vos plantes sont intacts » à la place de `MapView`, `SpotPicker` et `ScanMap`. Vérifié en forçant le refus de WebGL 2 dans Chromium : l'ancienne version affichait la carte, la nouvelle affiche le message, sans erreur de page. Les écrans qui reposent sur la carte (placement, mesures, scan) y sont inutilisables sur un tel appareil ; la liste des plantes, les tâches, le catalogue et les sauvegardes restent disponibles.

## 19. Mises à jour des dépendances (28 octobre 2026)

Les neuf demandes Dependabot ouvertes ont été traitées une par une (typecheck, 1404 tests, build, puis essai dans Chromium). **`npm audit` : 0 alerte, production comprise** (il y en avait 23 au début de l'audit).

| Mise à jour | Décision |
| --- | --- |
| `maplibre-gl` 4.7.1 → 6.16.0 | Faite (voir §18) |
| `vite` 5 → **7.3**, `@vitejs/plugin-react` 4 → 5, `vite-plugin-pwa` 0.20 → 2, `vitest` 2 → 5 | Faites ensemble : vitest 5 exige Vite ≥ 6.4. `vite.config.ts` importe `defineConfig` de `vitest/config`. Vérifié dans Chromium : service worker actif (32 fichiers précachés), carte et catalogue **hors ligne**, 3D, carte, placement |
| `three` 0.169 → 0.186.1, `@types/three` | Faite ; 3D vérifiée dans Chromium (parcelle, plantes dont les ajouts, ciel) |
| `idb-keyval` 6.3, `serialize-javascript` 7.1.4, actions `checkout` et `setup-node` en v7 | Faites |
| `@vercel/node` | **Retiré** : seuls deux types en venaient ; ses dépendances d'outillage (tar, undici, busboy, esbuild…) faisaient 17 des 23 alertes. Types minimaux dans `api/_vercel-types.ts` (type seulement : rien n'est chargé à l'exécution) |
| `typescript` 5.6 → **5.9** | **Pas la 7** : la 7 retire l'API JavaScript (`transpileModule`, `sys`, `readConfigFile`…) que `@vercel/node` appelle côté Vercel pour compiler `api/identify.ts` ; le déploiement de l'identification risquerait de casser, et Vercel ne peut pas être essayé d'ici. Le typage des octets (`new Uint8Array(…)`) est compatible 5 et 7. À reprendre quand Vercel documentera la 7 |
| `@react-three/fiber` 8 → 9 | **Pas maintenant** : exige React 19 (et `drei` 10) ; migration à part |

**Non vérifié** : le déploiement réel sur Vercel avec ces versions (build, fonction `api/identify`), les téléphones, Safari et Firefox.

## 20. Étape 1 du plan « retours » : ne plus perdre de données (29 octobre 2026)

**Cause trouvée** : les données vivent dans le navigateur de chaque appareil et **aucun Supabase n'est relié au projet** (`VITE_SUPABASE_*` absents) : il n'y a donc aucune synchronisation, et un autre navigateur ou un autre téléphone montre un jardin vide. En plus, une fermeture moins de 200 ms après une action perdait cette action (écriture différée de 200 ms, reproduit dans Chromium).

| Mesure | Preuve |
| --- | --- |
| **Copie de secours synchrone** (`permajardin:state:v1:miroir`, localStorage, 3 Mo au plus) écrite à chaque modification, avant IndexedDB ; reprise au démarrage si elle est plus récente, ou si IndexedDB est vide ou illisible | `store.test.ts` (7 cas) ; **navigateur réel** : plante placée puis fermeture brutale à 20 ms et à 150 ms (IndexedDB à 0 plante à la fermeture) → 1 plante après réouverture |
| **Essai d'écriture au démarrage** : un navigateur qui refuse IndexedDB est signalé tout de suite (bandeau existant) | `store.test.ts` (3 cas) |
| **Heure de la dernière écriture** et phrase claire dans Réglages : « Enregistré sur cet appareil à 14:32 », ou « Cet appareil refuse d'enregistrer… » ; texte « Vos données sont gardées dans ce navigateur, sur cet appareil… » | `sentences.test.ts` (phrases de 20 mots au plus) |
| **Rappel de sauvegarde après 2 jours** (au lieu de 30) dès 3 plantes sans aucune sauvegarde, puis chaque semaine | `backup.test.ts` (4 cas) |
| **Synchronisation automatique** (`src/lib/autoSync.ts`), active **seulement si Supabase est configuré**, qu'un compte est connecté et que l'accord est donné : envoi 5 s après la dernière modification, comparaison au démarrage et au retour dans l'appli ; **jamais d'écrasement silencieux** : si la copie en ligne a changé ailleurs ET que cet appareil a des modifications, état « conflit » et choix proposé dans Réglages | `autoSync.test.ts` (16 cas : conflit, appareil neuf, rafale de modifications, hors ligne, erreur, sans accord, reprise non prise pour une modification) |

**Vie privée** : la copie de secours contient les mêmes données que IndexedDB (jardins, plantes, adresse, positions) : elle reste dans l'appareil, figure dans l'inventaire (`inventory.ts`, documents légaux régénérés) et est effacée par « Effacer toutes mes données » (préfixe `permajardin:`) et par `wipeLocalData()`.

**Non fait** : l'essai de la synchronisation automatique avec un vrai projet Supabase et deux appareils (aucun projet n'est relié : voir `docs/ACTIONS-PROPRIETAIRE.md`, §2 ; pour avoir une synchronisation, il faut créer le projet, appliquer les 4 migrations et poser les deux variables `VITE_SUPABASE_*` sur Vercel). Sans Supabase, le seul moyen de passer d'un appareil à l'autre reste « Sauvegarde », puis « Reprendre une sauvegarde ».

## 21. Étape 5 : achat et plantation, lecture de l'étiquette (29 octobre 2026)

- **Données** : `Plant.purchase` (forme, hauteur, date, lieu, prix, note, « je ne veux pas »), tous facultatifs, ajoutés **sans changer `STATE_VERSION`** (champ optionnel, validé et borné par `sanitizePurchase` : forme connue, nombres bornés, textes limités, champs étrangers écartés ; `purchase.test.ts`). La hauteur d'achat devient la première mesure de la plante (courbe de croissance recalée dès le premier jour) et l'âge à la plantation est estimé d'après la forme, **sans jamais écraser un âge déjà connu**.
- **Lecture de l'étiquette** (Tesseract, français) : la photo est réduite, lue **dans l'appareil** puis oubliée (ni stockée, ni envoyée). Les modules (≈ 5 Mo : programme de lecture et français) sont servis **par notre domaine** sous `/ocr/` (jamais par un CDN : la CSP les interdirait), **non précachés** (`globIgnores: ocr/**`) et téléchargés une seule fois à la première lecture, puis gardés par le service worker (règle `ocr-modules`) : **cette étape demande internet la première fois, rien d'autre dans l'appli n'en dépend**. Le résultat n'est qu'une proposition : champs remplis, « Vérifiez avant d'enregistrer », avertissement si l'étiquette semble être d'une autre espèce.
- **CSP** : `script-src 'self' 'wasm-unsafe-eval'` (**un seul ajout**, nécessaire pour compiler le module WebAssembly de Tesseract ; toujours **pas** de `unsafe-eval` ni de script inline ; `vercel-config.test.ts` l'impose). Vérifié avec un serveur qui applique les en-têtes réels de `vercel.json`.
- **Vérifié dans Chromium** (étiquette générée en image, politique de sécurité réelle) : placer une plante ouvre « Comment l'avez-vous achetée ? » ; lecture en 1 s (ordinateur) ; forme, hauteur 250 cm, prix 24,9 €, variété et « l'étiquette correspond à votre plante » ; enregistrement avec âge estimé et première mesure ; aucune erreur de console ni de CSP. **Non vérifié** : lecture d'une vraie photo d'étiquette (reflets, courbure, écriture fantaisie) sur téléphone ; la précision réelle de l'OCR sur le terrain est inconnue, d'où la vérification obligatoire par la personne.
- **Dépendances** : `tesseract.js` 7, `tesseract.js-core` 7, `@tesseract.js-data/fra` ; `npm audit` de production : 0 alerte (4 alertes « faibles » hors production, sur `deepmerge` via l'outil du service worker, apparues entre-temps).

