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
| Photos | `<input type=file accept=image/*>` (fiche plante, identification) : sélecteur du système, **pas** de `getUserMedia` | Choisir une photo | Pas de photo |
| Stockage persistant | Au chargement (`navigator.storage.persist`) | Éviter l'effacement par le navigateur | Données conservées mais effaçables : message de sauvegarde |
| Géolocalisation | **Jamais demandée** (aucun appel à `navigator.geolocation`) ; `geolocation=(self)` seulement dans la Permissions-Policy | — | Sans objet |
| Caméra, micro | **Jamais demandés** ; `camera=(self)` laisse le sélecteur de fichiers proposer l'appareil photo | — | Sans objet |

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
| O2 | Moyenne | `maplibre-gl` ≤ 6.4.0 : avis critique GHSA-jrc7-96c5-q579 (la CI le tolère avec `continue-on-error`) | Non exploitable ici (fonction absente de 4.7.1, attribution constante). Planifier la montée en 6.x avec l'agent cartographie, puis retirer `continue-on-error` |
| O3 | Moyenne | Champs légaux `[à compléter]` (éditeur, adresse, contact, hébergeur Supabase) et contact de `SECURITY.md` ; les textes de consentement affirment « Supabase, UE » alors que la politique dit « à confirmer » | Créer les projets Supabase en région UE avant publication ; compléter `legal.ts` ; faire valider par un professionnel ; activer « Private vulnerability reporting » sur GitHub |
| O4 | Moyenne | « Annonces supprimées après 60 jours, photos comprises » n'est vrai que si `neighbors_purge_expired()` et `neighbors_orphan_photos()` sont planifiés et si les fichiers listés sont effacés par l'API Storage : rien ne le fait automatiquement | Planification quotidienne (pg_cron + fonction ou script avec clé `service_role` hors dépôt) avant l'ouverture publique |
| O5 | Moyenne | Quartier = cellule de 0,01° (~1 km). En zone rurale une cellule peut ne contenir qu'un foyer : pseudo + cellule + photo de jardin peuvent identifier un domicile | Décision : cellule plus grosse (0,02 à 0,05°) ou rayon d'affichage minimal ; le texte « jamais votre adresse » reste vrai mais l'anonymat dépend de la densité |
| O6 | Faible | `/api/identify` : un appel sans `Origin`/`Sec-Fetch-Site` (curl, script) est accepté, le limiteur est par instance | Règle de limitation du pare-feu Vercel (voir §6) ; CAPTCHA si l'appli devient publique |
| O7 | Faible | `connect-src https://*.supabase.co` : n'importe quel projet Supabase | Une fois les deux projets créés, remplacer par leurs deux adresses exactes dans `vercel.json` (et adapter `vercel-config.test.ts`) |
| O8 | Faible | `Permissions-Policy` : `camera=(self)` et `geolocation=(self)` alors que ni `getUserMedia` ni la géolocalisation ne sont utilisées | Tester `camera=()` sur iOS et Android (le sélecteur de fichiers ne dépend pas de cette politique selon les spécifications, non vérifié ici) |
| O9 | Faible | CI : actions épinglées par étiquette (`@v4`) et non par empreinte ; l'audit des dépendances ne bloque pas | Épingler par SHA (Dependabot suit) |
| O10 | Faible | 18 alertes `npm audit` hors production : `@vercel/node` (tar, undici, path-to-regexp… utilisés seulement pour les types), `vite` 5 / `esbuild` (serveur de développement), `vitest`, `vite-plugin-pwa`. `three-stdlib` est une dépendance directe jamais importée | Remplacer `@vercel/node` par des types locaux supprimerait 8 alertes ; montée `vite`/`vitest` à planifier. Ne pas lancer `vite dev` sur une machine exposée au réseau |
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

