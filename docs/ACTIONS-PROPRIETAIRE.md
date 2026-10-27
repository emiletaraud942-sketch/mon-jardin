# Ce qu'il vous reste à faire (PermaJardin)

Liste faite le 27 octobre 2026, à la fin de l'audit. Tout ce qui pouvait être fait dans le code est fait et poussé sur la branche `claude/upbeat-volta-sh223c`. **Ce qui suit, seul le propriétaire peut le faire** : ce sont des réglages dans GitHub, Vercel et Supabase, des textes légaux, et des essais sur un vrai téléphone.

Chaque ligne dit **à quoi ça sert**, **comment faire**, **comment vérifier**. Les noms de menus des sites peuvent avoir changé : cherchez le mot en gras. Cochez au fur et à mesure.

Légende : 🔴 à faire avant d'ouvrir l'appli à d'autres personnes · 🟠 à faire dans le mois · 🟢 facultatif.

---

## 0. D'abord : mettre le code en production

- [ ] 🔴 **Fusionner la branche `claude/upbeat-volta-sh223c` dans `main`** (sur GitHub : bouton *Compare & pull request*, puis *Merge*). Tant que ce n'est pas fait, rien de ce qui a été corrigé n'est en ligne. Vercel redéploie ensuite tout seul.
  - *Vérifier* : sur Vercel, le dernier déploiement est « Ready » ; ouvrez le site, rien en rouge dans la console (F12).
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

*Le projet Supabase de synchronisation est distinct de celui de l'entraide.*

- [ ] 🔴 **SQL Editor** : coller et exécuter, **dans cet ordre**, les 4 fichiers de `supabase/migrations/` (chacun est rejouable sans danger sauf le premier, à ne jouer qu'une fois) :
  1. `20261017000000_garden_snapshots.sql`
  2. `20261018000000_snapshots_hardening.sql`
  3. `20261019000000_security_hardening.sql`
  4. `20261027000000_snapshots_no_anonymous.sql` *(nouveau : refuse les comptes anonymes)*
  - Ou, avec le CLI : `supabase link --project-ref <réf>` puis `supabase db push`.
  - *Vérifier* : **Table Editor** montre `garden_snapshots` avec « RLS enabled ».
- [ ] 🔴 **Authentication > Providers** : vérifier que **Anonymous sign-ins** est désactivé.
- [ ] 🔴 **Authentication > URL Configuration** : *Site URL* = l'adresse de production ; *Redirect URLs* = `https://<domaine>/**` et `http://localhost:5173/**`, **sans** joker du type `https://*.vercel.app/**`.
- [ ] 🟠 **Authentication > Rate Limits** : limiter les e-mails envoyés par heure ; **SMTP personnalisé** si le nombre d'utilisateurs grandit (Resend, Brevo…).
- [ ] 🟠 **Reports > Security Advisor** (ou « Advisors ») : le lancer et lire ce qu'il signale.
- [ ] 🟠 **Project Settings > General** : noter la **région** (voir §5, point « région UE »).

---

## 3. Supabase : entraide entre voisins

*Projet DÉDIÉ à l'entraide (ne réutilisez pas celui de la synchronisation). Détails complets : `docs/ENTRAIDE.md`, « Étapes pour le propriétaire ».*

- [ ] 🔴 **Créer un nouveau projet Supabase, région Union européenne** (ex. Francfort ou Paris). Impossible à changer après coup.
- [ ] 🔴 **SQL Editor** : coller et exécuter, **dans cet ordre**, les 7 fichiers de `supabase/neighbors/migrations/` (tous rejouables ; si vous en rejouez un ancien, rejouez ensuite les suivants jusqu'à la v7) :
  1. `20261023000000_neighbors.sql`
  2. `20261025000000_neighbors_v2.sql` (« Je cherche », catégories)
  3. `20261025010000_neighbors_v3_read.sql` (messages non lus)
  4. `20261025020000_neighbors_v4_events.sql` (organisateurs, événements)
  5. `20261025030000_neighbors_v5_push.sql` (alertes)
  6. `20261025040000_neighbors_v6_cell_size.sql` (quartier 2 km / 5 km)
  7. `20261027000000_neighbors_v7_hardening.sql` *(nouveau : un changement de quartier par semaine, textes sans caractères invisibles)*
  - *Vérifier* : **Table Editor** : toutes les tables ont « RLS enabled » ; **Security Advisor** ne signale rien de critique.
- [ ] 🔴 **Authentication > Providers** : Email (lien magique) activé ; **Anonymous sign-ins**, Phone et OAuth désactivés.
- [ ] 🔴 **Authentication > URL Configuration** : comme au §2.
- [ ] 🔴 **Authentication > SMTP** : un SMTP à vous, avec un expéditeur de votre domaine ; le service par défaut de Supabase est limité à quelques e-mails par heure. Traduire le modèle « Magic Link » en français.
- [ ] 🔴 **Authentication > Attack Protection** : activer un CAPTCHA avant l'ouverture publique.
- [ ] 🔴 **Storage** : le bucket `neighbors-photos` est **privé**, limite **1 Mo**.
- [ ] 🔴 **Settings > API** : seul le schéma `public` est exposé ; **ne pas activer Realtime** sur les tables.
- [ ] 🔴 **Planifier le nettoyage quotidien** (la promesse faite aux membres : « les annonces disparaissent après 60 jours, photos comprises »). **Rien ne le lance tout seul** dans le dépôt (la documentation disait le contraire : corrigé) :
  1. **Database > Extensions** : activer `pg_cron`.
  2. SQL Editor : `select cron.schedule('neighbors-purge-quotidienne', '0 22 * * *', 'select public.neighbors_purge_expired()');`
  3. *Vérifier* : `select jobname, schedule from cron.job;` montre la ligne.
  4. **Les fichiers photo ne sont pas effacés par cette fonction.** Une fois par semaine : `select * from public.neighbors_orphan_photos();` puis effacer ces fichiers dans **Storage > neighbors-photos**. (Pour l'automatiser, il faut une fonction Edge avec la clé `service_role` : demandez-le-moi.)
- [ ] 🔴 **Une adresse de contact pour les signalements**, lue chaque jour pendant le lancement ; la modération se fait avec `supabase/neighbors/moderation.sql` (à copier dans le SQL Editor).
- [ ] 🔴 **Essai de bout en bout avec deux comptes de test** (deux adresses e-mail à vous) : créer deux profils, publier une annonce avec l'un, la voir avec l'autre, s'écrire, bloquer, signaler. C'est le seul test que je ne peux pas faire à votre place.
- [ ] 🟠 **Alertes de nouveaux messages** (facultatif) : suivre « Alertes de nouveaux messages et préférences (v5) » dans `docs/ENTRAIDE.md` (clés VAPID, fonction `notify-message`).

---

## 4. Vercel (≈ 15 minutes)

Projet > **Settings** :

- [ ] 🔴 **Environment Variables** (puis **Redeploy**, car les `VITE_*` sont lues au moment du build) :

  | Nom | Valeur | Remarque |
  | --- | --- | --- |
  | `PLANTNET_API_KEY` | clé gratuite de my.plantnet.org | **Production seulement**, cochez *Sensitive*. Jamais en `VITE_*` |
  | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | projet de **synchronisation** | clé « anon / publishable » seulement, **jamais** `service_role` |
  | `VITE_NEIGHBORS_SUPABASE_URL`, `VITE_NEIGHBORS_SUPABASE_ANON_KEY` | projet de l'**entraide** | **Production seulement** : en Preview, les prévisualisations parleraient à de vraies personnes |

- [ ] 🔴 **Firewall** (Security > Firewall) : une règle de **limitation de débit** sur `/api/identify` (ex. 10 par minute et par adresse) et une sur `/ext/*`. *À quoi ça sert* : un script pourrait sinon épuiser les 500 identifications gratuites du jour de Pl@ntNet, ou saturer les quotas de l'IGN et d'Open-Meteo pour tout le monde. Le limiteur du code n'est qu'un garde-fou par instance.
- [ ] 🔴 **Deployment Protection** : activer pour les prévisualisations ; la production reste publique.
- [ ] 🔴 **Votre compte Vercel** : double authentification.
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

- [ ] 🔴 **La carte** (montée en MapLibre 6) : ouvrir « Mon jardin », vérifier que la photo aérienne s'affiche (tuiles IGN réelles), que la parcelle jaune est dessinée, placer une plante, déplacer un marqueur, zoomer au doigt, puis couper le réseau et rouvrir l'appli : la carte doit encore s'ouvrir.

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
- [ ] **Alertes `npm audit` hors production** (outils de développement) : ne pas lancer `vite dev` sur une machine exposée au réseau.

---

## En cas de problème

- **Une annonce ou un compte pose problème** : `supabase/neighbors/moderation.sql` (masquer, bannir, noter la décision). Délais visés : contenu illicite évident sous 24 h, signalement ordinaire sous 7 jours.
- **Une clé secrète a été publiée** : la révoquer tout de suite (Pl@ntNet, Supabase, Vercel), en créer une nouvelle, la remettre dans Vercel, redéployer. Ne comptez pas sur la suppression du commit.
- **Campagne d'abus** : Supabase > Authentication > Providers > désactiver « Allow new users to sign up » ; Vercel > Firewall > « Attack Challenge Mode ».

## Où est le détail

- Mesures de sécurité, constats et limites : `docs/SECURITE.md` (sections 9 à 17 pour cet audit).
- Déploiement : `docs/DEPLOIEMENT.md`. Entraide : `docs/ENTRAIDE.md`.
- Ce que je n'ai pas pu vérifier : les vrais projets Supabase, Vercel et GitHub, les téléphones réels, Safari et Firefox, la validité juridique des textes.
