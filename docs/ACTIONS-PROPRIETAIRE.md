# Ce qu'il vous reste à faire (PermaJardin)

Liste faite le 27 octobre 2026, à la fin de l'audit. Tout ce qui pouvait être fait dans le code est fait et fusionné dans `main`. **Ce qui suit, seul le propriétaire peut le faire** : ce sont des réglages dans GitHub, Vercel et Supabase, des textes légaux, et des essais sur un vrai téléphone.

Chaque ligne dit **à quoi ça sert**, **comment faire**, **comment vérifier**. Les noms de menus des sites peuvent avoir changé : cherchez le mot en gras. Cochez au fur et à mesure.

Légende : 🔴 à faire avant d'ouvrir l'appli à d'autres personnes · 🟠 à faire dans le mois · 🟢 facultatif.

---

## 0. D'abord : mettre le code en production

- [ ] 🔴 **Vérifier que la dernière version de `main` est en ligne** (l'ancienne branche `claude/upbeat-volta-sh223c` est déjà fusionnée dans `main`). Vercel redéploie tout seul à chaque fusion.
  - *Vérifier* : sur Vercel, le dernier déploiement est « Ready » ; ouvrez le site, rien en rouge dans la console (F12). En bas de **Réglages**, la ligne « Version … (commit …) » doit montrer le même commit que `main` sur GitHub.
  - La CI (typecheck, tests, build, audit des dépendances) doit être verte avant de fusionner.

---

## 1. GitHub (≈ 10 minutes)

*À quoi ça sert : GitHub prévient si une clé secrète est poussée par erreur, et empêche que quelqu'un casse `main`.*

Dépôt > **Settings** :

- [ ] 🔴 **Code security** (ou « Advanced Security ») : activer *Secret scanning*, **Push protection** (elle bloque un push qui contient une clé), *Dependabot alerts*, *Dependabot security updates*, **Private vulnerability reporting** (c'est le canal que `SECURITY.md` et `security.txt` donnent aux chercheurs de failles). Certaines options n'existent que pour un dépôt public ou avec l'offre payante : ce qui est grisé n'est pas disponible, passez.
- [ ] 🔴 **Branches > Add rule** sur `main` : pull request obligatoire, vérification d'état « CI » obligatoire, pas de force-push, pas de suppression.
- [ ] 🔴 **Votre compte** (Settings > Password and authentication) : double authentification activée.
- [ ] 🟠 **Actions > General** : « Workflow permissions » = *Read repository contents*.
- [ ] 🟢 Épingler les actions de la CI par empreinte (`actions/checkout@v4` → `@<sha>`) : demandez-le-moi, il me faut les empreintes réelles.

---

## 2. Supabase : sauvegarde en ligne (« synchronisation »), si vous l'utilisez

> **Le projet Supabase `permajardin` existe** (il porte aussi l'entraide depuis le 7 nov. 2026 : voir §3). **La synchronisation n'est active que si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont posées sur Vercel (§4)** : le dépôt ne permet pas de vérifier ce réglage, regardez dans Vercel > Settings > Environment Variables. Sans elles, les jardins restent dans le navigateur de chaque appareil et le passage d'un appareil à l'autre se fait par « Sauvegarde » puis « Reprendre une sauvegarde ». Détails : `docs/SECURITE.md` §20. La connexion se fait par code reçu par e-mail (modèles ci-dessous).

*Le projet Supabase de synchronisation est distinct de celui de l'entraide.*

- [ ] 🔴 **SQL Editor** : coller et exécuter, **dans cet ordre**, les 4 fichiers de `supabase/migrations/` (chacun est rejouable sans danger sauf le premier, à ne jouer qu'une fois) :
  1. `20261017000000_garden_snapshots.sql`
  2. `20261018000000_snapshots_hardening.sql`
  3. `20261019000000_security_hardening.sql`
  4. `20261027000000_snapshots_no_anonymous.sql` *(nouveau : refuse les comptes anonymes)*
  - Ou, avec le CLI : `supabase link --project-ref <réf>` puis `supabase db push`.
  - *Vérifier* : **Table Editor** montre `garden_snapshots` avec « RLS enabled ».
- [ ] 🔴 **Authentication > Emails > Templates : le code de connexion.** L'appli demande un **code à saisir** (et non un lien à ouvrir : sur iPhone, l'appli épinglée à l'écran d'accueil et Safari ne partagent pas leur stockage, donc un lien ouvert dans Safari ne connecte jamais l'appli). Il faut que l'e-mail **contienne le code** : modifier **les deux** modèles, **« Confirm signup »** (première connexion d'une adresse) et **« Magic Link »** (connexions suivantes), avec par exemple :
  - Objet : `Votre code PermaJardin`
  - Corps : `<p>Votre code de connexion PermaJardin :</p><h2>{{ .Token }}</h2><p>Saisissez-le dans l'appli. Il est valable une heure. Si vous n'avez rien demandé, ignorez ce message.</p>`
  - **Sans** lien `{{ .ConfirmationURL }}` : un lien serait ouvert dans le mauvais navigateur et ne marcherait pas.
  - *Vérifier* : Authentication > **Sign In / Providers > Email** : longueur du code (6 par défaut ; l'appli accepte 6 à 10 chiffres) et durée de validité (3600 s par défaut).
  - *Limite d'envoi* : le service d'e-mail par défaut de Supabase n'envoie que très peu de messages par heure pour tout le projet. Avant d'ouvrir à d'autres personnes : **Authentication > SMTP** avec un expéditeur à vous (Resend, Brevo…).
- [ ] 🔴 **Authentication > Providers** : vérifier que **Anonymous sign-ins** est désactivé.
- [ ] 🔴 **Authentication > URL Configuration** : *Site URL* = l'adresse de production ; *Redirect URLs* = `https://<domaine>/**` et `http://localhost:5173/**`, **sans** joker du type `https://*.vercel.app/**`.
- [ ] 🟠 **Authentication > Rate Limits** : limiter les e-mails envoyés par heure ; **SMTP personnalisé** si le nombre d'utilisateurs grandit (Resend, Brevo…).
- [ ] 🟠 **Reports > Security Advisor** (ou « Advisors ») : le lancer et lire ce qu'il signale.
- [ ] 🟠 **Project Settings > General** : noter la **région** (voir §5, point « région UE »).

---

## 3. Supabase : entraide entre voisins

*Depuis le 7 nov. 2026, l'entraide utilise le même projet `permajardin` que la synchronisation (`docs/ENTRAIDE.md`, « Même projet Supabase que la synchro ») : les 9 migrations y sont déjà posées. Les étapes ci-dessous servent à refaire l'installation sur un projet neuf. Détails complets : `docs/ENTRAIDE.md`, « Étapes pour le propriétaire ».*

- [ ] 🔴 **Créer un nouveau projet Supabase, région Union européenne** (ex. Francfort ou Paris). Impossible à changer après coup. *(Inutile si vous gardez `permajardin` : vérifiez sa région dans Project Settings > General.)*
- [ ] 🔴 **SQL Editor** : coller et exécuter, **dans cet ordre**, les 9 fichiers de `supabase/neighbors/migrations/` (tous rejouables ; si vous en rejouez un ancien, rejouez ensuite les suivants jusqu'à la v9) :
  1. `20261023000000_neighbors.sql`
  2. `20261025000000_neighbors_v2.sql` (« Je cherche », catégories)
  3. `20261025010000_neighbors_v3_read.sql` (messages non lus)
  4. `20261025020000_neighbors_v4_events.sql` (organisateurs, événements)
  5. `20261025030000_neighbors_v5_push.sql` (alertes)
  6. `20261025040000_neighbors_v6_cell_size.sql` (quartier 2 km / 5 km)
  7. `20261027000000_neighbors_v7_hardening.sql` (un changement de quartier par semaine, textes sans caractères invisibles)
  8. `20261029000000_neighbors_v8_gardens.sql` (« Ce que j'ai dans mon jardin », boutures entre voisins)
  9. `20261104000000_neighbors_v9_hardening2.sql` *(à coller en dernier ; rejouable : sondes de blocage dans le schéma privé `neighbors_private`, masquage automatique plus exigeant, contraintes de texte complétées)*
  - *Vérifier* : **Table Editor** : toutes les tables ont « RLS enabled » ; **Security Advisor** ne signale rien de critique.
- [ ] 🔴 **Authentication > Providers** : Email activé (connexion par **code**, modèles d'e-mail avec `{{ .Token }}`, voir §2) ; **Anonymous sign-ins**, Phone et OAuth désactivés.
- [ ] 🔴 **Authentication > URL Configuration** : comme au §2.
- [ ] 🔴 **Authentication > SMTP** : un SMTP à vous, avec un expéditeur de votre domaine ; le service par défaut de Supabase est limité à quelques e-mails par heure. Traduire le modèle « Magic Link » en français.
- [ ] 🔴 **Authentication > Attack Protection** : activer un CAPTCHA avant l'ouverture publique.
- [ ] 🔴 **Storage** : le bucket `neighbors-photos` est **privé**, limite **1 Mo**.
- [ ] 🔴 **Settings > API** : seul le schéma `public` est exposé ; **ne pas activer Realtime** sur les tables.
- [ ] 🔴 **Planifier la purge quotidienne** (la promesse faite aux membres : « les annonces disparaissent après 60 jours, photos comprises » ; les événements finis depuis 30 jours sont aussi supprimés). **Rien ne la lance tout seul** dans le dépôt : tout `supabase/neighbors/cron.sql` est en commentaire. La méthode à suivre est celle de la v9, décrite dans `docs/ENTRAIDE.md`, « Purge à 60 jours (v9) », « Étapes pour le propriétaire » :
  1. Choisir un secret d'au moins 32 caractères et le poser : `npx supabase secrets set --project-ref <REF> PURGE_SECRET="<secret>"`.
  2. Déployer la fonction Edge : `npx supabase functions deploy purge-neighbors-photos --no-verify-jwt --project-ref <REF>` (elle se protège avec `PURGE_SECRET`).
  3. **Database > Extensions** : activer `pg_cron`, `pg_net` et `supabase_vault`.
  4. SQL Editor : suivre `supabase/neighbors/cron.sql` en retirant les `--` des étapes 2 à 4 (secret dans le Vault, tâche SQL à 22 h UTC, appel de la fonction à 22 h 30 UTC). La fonction efface aussi les fichiers photo orphelins.
  5. *Vérifier le lendemain* : `select jobname, schedule, active from cron.job;` et les journaux de la fonction (`{"removed":N,"listed":N,"ignored":0,"capped":false}`).
  *Sans la fonction Edge*, `neighbors_purge_expired()` ne supprime que les lignes : il faudrait lister les fichiers avec `select * from public.neighbors_orphan_photos();` puis les effacer à la main dans **Storage > neighbors-photos**.
- [ ] 🔴 **Une adresse de contact pour les signalements**, lue chaque jour pendant le lancement ; la modération se fait avec `supabase/neighbors/moderation.sql` (à copier dans le SQL Editor).
- [ ] 🔴 **Valider un premier organisateur** (sans lui, l'onglet Événements reste vide : « Pas encore d'événement près de chez vous »). Quand une association, une mairie ou un jardin partagé a fait « Devenir organisateur » dans l'appli :
  1. SQL Editor : copier la requête du **§4 de `supabase/neighbors/moderation.sql`** (« Demandes à examiner », les plus anciennes d'abord : `user_id`, nom public, description, pseudo, date de la demande).
  2. Vérifier que le nom correspond à une structure réelle (site, mairie, annuaire des associations, appel). Doute : ne pas valider, répondre par e-mail.
  3. Valider avec la mise à jour du même §4 : `update public.organizers set verified_at = now() where user_id = '<user_id>';` (le journal de modération s'écrit tout seul). Pour retirer : la ligne suivante du §4 (`verified_at = null` masque aussitôt ses événements).
  4. La personne voit alors « Publier un événement » et « Mes événements » dans Entraide > Événements.
  **Ne publiez jamais vous-même, à la place d'un organisateur, des événements trouvés ailleurs** (ateliers d'une autre structure, programme d'une mairie, page d'une association) : ce serait parler au nom d'autrui, sans son accord, avec des informations que vous ne pouvez pas tenir à jour. C'est à chaque structure de s'inscrire comme organisateur ; l'appli propose pour cela « Inviter une association ou une mairie à publier » (un texte à envoyer soi-même).
- [ ] 🔴 **Essai de bout en bout avec deux comptes de test** (deux adresses e-mail à vous) : créer deux profils, publier une annonce avec l'un, la voir avec l'autre, s'écrire, bloquer, signaler. **Puis avec un événement** : faire valider le premier compte comme organisateur (étape ci-dessus), publier un événement ; avec le second compte, le voir dans Entraide > Événements, toucher « Je suis intéressé(e) » (le compteur monte, le nom n'apparaît pas à l'organisateur), « Signaler », puis « Ajouter à mon calendrier » (un fichier `.ics` s'enregistre ; l'ouvrir dans l'agenda : date, lieu, deux rappels la veille et une heure avant) et « Partager » (texte sans pseudo ni position). C'est le seul test que je ne peux pas faire à votre place.
- [ ] 🟠 **Alertes de nouveaux messages** (facultatif) : suivre « Alertes de nouveaux messages et préférences (v5) » dans `docs/ENTRAIDE.md` (clés VAPID, fonction `notify-message`).

---

## 4. Vercel (≈ 15 minutes)

Projet > **Settings** :

- [ ] 🔴 **Environment Variables** (puis **Redeploy**, car les `VITE_*` et `NEIGHBORS_*` sont lues au moment du build) :

  | Nom | Valeur | Remarque |
  | --- | --- | --- |
  | `PLANTNET_API_KEY` | clé gratuite de my.plantnet.org | **Production seulement**, cochez *Sensitive*. Jamais en `VITE_*` |
  | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | projet de **synchronisation** | clé « anon / publishable » seulement, **jamais** `service_role` |
  | `NEIGHBORS_SUPABASE_URL`, `NEIGHBORS_SUPABASE_PUBLISHABLE` | projet de l'**entraide** (aujourd'hui le même que la synchro) | **Production seulement** : en Preview, les prévisualisations parleraient à de vraies personnes |

- [ ] 🔴 **Firewall** (Security > Firewall) : une règle de **limitation de débit** sur `/api/identify` (ex. 10 par minute et par adresse) et une sur `/ext/*`. *À quoi ça sert* : un script pourrait sinon épuiser les 500 identifications gratuites du jour de Pl@ntNet, ou saturer les quotas de l'IGN et d'Open-Meteo pour tout le monde. Le limiteur du code n'est qu'un garde-fou par instance.
- [ ] 🔴 **Deployment Protection** : activer pour les prévisualisations ; la production reste publique.
- [ ] 🔴 **Votre compte Vercel** : double authentification.
- [ ] 🔴 **Après ce déploiement** (Vite 7, vitest 5, `@vercel/node` retiré, TypeScript 5.9) : dans Vercel > Deployments, ouvrir le dernier déploiement de `main` : le build doit être « Ready » et la fonction `api/identify` apparaître dans « Functions » (sans erreur de compilation dans les journaux de build). C'est la seule chose que je n'ai pas pu essayer ; si la fonction manque ou échoue, dites-le-moi.
- [ ] 🟠 **Après le déploiement**, tester l'identification (`docs/DEPLOIEMENT.md` §5, point 3) : sans en-tête `Origin`, la réponse doit être **403** (voulu) ; avec `Origin`, **503** tant que la clé manque, **400** sans photo valide.
- [ ] 🟢 Domaine personnalisé : Settings > Domains (HTTPS automatique).
- [ ] 🟢 Quand les deux projets Supabase existent : remplacer `https://*.supabase.co` par les deux adresses exactes dans `connect-src` de `vercel.json` (et adapter `src/lib/security/vercel-config.test.ts`) : demandez-le-moi.

---

## 5. Textes légaux et contact

*À quoi ça sert : ce sont des obligations légales dès que l'appli est publique (mentions légales, confidentialité). Les textes actuels sont des brouillons.*

- [ ] 🔴 **Compléter les champs `[à compléter]`** dans `src/lib/legal.ts` : éditeur (nom ou raison sociale), adresse, contact, directeur de la publication, hébergeur. Donnez-moi les valeurs, je les mets et je régénère les documents.
- [ ] 🔴 **Faire relire les trois pages** (mentions légales, confidentialité, CGU) par un professionnel du droit, ou au minimum par une association d'aide aux petits éditeurs. Je ne suis pas juriste.
- [ ] 🔴 **Confirmer la région Supabase = UE** (§3), puis me le dire : les textes de consentement ne disent plus « Supabase, UE » tant que ce n'est pas confirmé, et la politique de confidentialité dit encore « à confirmer ».
- [ ] 🔴 **Contact de `SECURITY.md`** : la ligne « [adresse e-mail de contact : à compléter] ». Le signalement privé GitHub (§1) suffit comme canal principal ; si vous voulez aussi une adresse, donnez-moi **celle que vous acceptez de rendre publique**.
- [ ] 🟠 **`public/.well-known/security.txt` expire le 27 octobre 2027** : à renouveler (changer la date `Expires`).

---

## 6. Essais sur un vrai téléphone (je ne peux pas les faire)

*Mes essais ont eu lieu sur ordinateur (Chromium). Le téléphone peut se comporter autrement.*

- [ ] 🔴 **La carte** (montée en MapLibre 6, qui exige WebGL 2 : iPhone sous iOS 15 ou plus, Android récent ; sur un appareil plus ancien l'appli affiche « La carte ne peut pas s'afficher sur cet appareil » au lieu de planter) : ouvrir « Mon jardin », vérifier que la photo aérienne s'affiche (tuiles IGN réelles), que la parcelle jaune est dessinée, placer une plante, déplacer un marqueur, zoomer au doigt, puis couper le réseau et rouvrir l'appli : la carte doit encore s'ouvrir.

- [ ] 🟠 **Installer l'appli** sur l'écran d'accueil (Android Chrome, iPhone Safari), la rouvrir hors connexion.
- [ ] 🟠 **Photos du jardin** : prise guidée, boussole (l'iPhone demande une autorisation après un toucher), caméra refusée puis acceptée, **quitter l'écran pendant la demande d'autorisation** (la caméra doit s'éteindre).
- [ ] 🟠 **Scan vidéo** et GPS à l'extérieur.
- [ ] 🟠 **Écran qui reste allumé** pendant la prise de photos.
- [ ] 🟠 **Sauvegarde avec photos** : faire la sauvegarde, effacer toutes les données, reprendre la sauvegarde. Sur un vieux téléphone, surveillez la place libre. Mesuré sur ordinateur avec un fichier de 150 Mo : 0,9 s de lecture, 0,6 s de rangement, mémoire stable.
- [ ] 🟠 **Mise à jour après déploiement** : ouvrir l'appli, déployer une nouvelle version, revenir dans l'appli : le bandeau « Mise à jour disponible » doit apparaître.
- [ ] 🟠 **Calendrier `.ics`** : À faire > Calendrier de l'année > « Ajouter à mon agenda », ouvrir le fichier dans l'agenda du téléphone.
- [ ] 🟢 Safari et Firefox : jamais testés.

---

## 7. À relire (agronomie)

*Les 16 fiches ajoutées et les avertissements viennent de ma connaissance générale, pas d'un agronome.*

- [ ] 🟠 **Avertissements** (`src/data/species/avertissements.ts`) : surtout `laurier-palme` (« signalé envahissant dans certaines régions »), `robinier`, `consoude`, `tanaisie`, `bourrache`. Ce n'est pas un avis médical ni vétérinaire.
- [ ] 🟠 **Les 16 fiches** (`src/data/species/ajouts.ts`) : rosier, hortensia, thuya, laurier-palme, lilas, dahlia, hémérocalle, pivoine, camomille, ortie, chou rouge, cardon, pak choï, rutabaga, cresson alénois, courge spaghetti. Calendriers et gestes à vérifier pour **votre région**.
- [ ] 🟢 Récolte des aromatiques : j'ai aligné la fiche sur les règles (thym mai-août au lieu de toute l'année). Dites-moi si vous préférez l'inverse.

---

## 8. Décisions qui vous appartiennent

- [ ] **Garder un extrait des contenus signalés ?** Aujourd'hui, le journal de modération ne garde « jamais le contenu signalé ». En garder un extrait aiderait à traiter un abus après suppression, mais ça change la promesse de confidentialité et les textes légaux. Je n'y ai pas touché.
- [ ] **Automatiser l'effacement des photos de l'entraide** (fonction Edge + clé `service_role`) ou le faire à la main chaque semaine (§3).

---

## En cas de problème

- **Une annonce ou un compte pose problème** : `supabase/neighbors/moderation.sql` (masquer, bannir, noter la décision). Délais visés : contenu illicite évident sous 24 h, signalement ordinaire sous 7 jours.
- **Une clé secrète a été publiée** : la révoquer tout de suite (Pl@ntNet, Supabase, Vercel), en créer une nouvelle, la remettre dans Vercel, redéployer. Ne comptez pas sur la suppression du commit.
- **Campagne d'abus** : Supabase > Authentication > Providers > désactiver « Allow new users to sign up » ; Vercel > Firewall > « Attack Challenge Mode ».

## Où est le détail

- Mesures de sécurité, constats et limites : `docs/SECURITE.md` (sections 9 à 17 pour cet audit).
- Déploiement : `docs/DEPLOIEMENT.md`. Entraide : `docs/ENTRAIDE.md`.
- Ce que je n'ai pas pu vérifier : les vrais projets Supabase, Vercel et GitHub, les téléphones réels, Safari et Firefox, la validité juridique des textes.
