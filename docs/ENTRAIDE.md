# Entraide entre voisins

Fonction facultative : annonces de don, échange, prêt, demandes (« Je cherche »), questions et événements (publiés par des organisateurs validés) entre jardiniers d'un même quartier.
Elle repose sur un **projet Supabase dédié**, distinct de la synchro privée (`src/lib/sync.ts`, inchangée).
Sans `NEIGHBORS_SUPABASE_URL` et `NEIGHBORS_SUPABASE_PUBLISHABLE` (noms préférés, sans préfixe `VITE_` : `vite.config.ts` expose le préfixe `NEIGHBORS_` ; `VITE_NEIGHBORS_SUPABASE_URL` et `VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN` marchent aussi) ou `VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN` (la clé publique « anon » / « publishable » ; l'ancien nom `VITE_NEIGHBORS_SUPABASE_ANON_KEY` marche aussi, mais Vercel peut le refuser à cause du mot « KEY »), la fonction est masquée et l'appli marche comme avant.

Code : `src/lib/neighbors/{types,cell,client,api}.ts`. Base : `supabase/neighbors/migrations/20261023000000_neighbors.sql`, puis `20261025000000_neighbors_v2.sql` (type « cherche » et catégories), puis `20261025010000_neighbors_v3_read.sql` (date de dernière lecture des conversations, pour les messages non lus), puis `20261025020000_neighbors_v4_events.sql` (organisateurs, événements, « Je suis intéressé(e) »), puis `20261025030000_neighbors_v5_push.sql` (alertes de nouveaux messages et préférences de notification), puis `20261025040000_neighbors_v6_cell_size.sql` (quartier de 2 km ou 5 km). À coller dans cet ordre ; si vous rejouez un ancien fichier, rejouez ensuite les suivants (la v1 remet d'anciennes versions de quelques fonctions). Nouveautés : `src/lib/neighbors/{news,newsLoad,useBadge}.ts`, `src/features/neighbors/Nouveautes.tsx`. Événements : `src/features/neighbors/{Events,EventDetail,EventForm,MyEvents,OrganizerPage}.tsx`, logique pure (liens https, dates en lettres) dans `src/lib/neighbors/logic.ts`. Invitation : `src/lib/invite.ts`, `src/components/InviteButton.tsx`. Alertes : `src/lib/neighbors/{push,pushBridge}.ts`, `src/features/neighbors/Notifications.tsx`, `public/push-sw.js`, `supabase/functions/notify-message/`.

## Vie privée

- Aucune adresse, aucune coordonnée exacte. Le quartier est une **cellule de grille** : « standard » = pas de 0,02° de latitude et 0,03° de longitude (**environ 2 km**), « large » = 0,05° et 0,07° (**environ 5 km**, pour la campagne). Arrondi `floor(x / pas + 0,5) * pas`, fait par l'appli puis **de nouveau par un déclencheur SQL** selon `profiles.cell_size`. Pourquoi : en zone rurale une cellule de 1 km pouvait ne contenir qu'un foyer (voir `SECURITE.md`, O5).
- Les annonces recopient la cellule du profil (le client ne peut pas l'envoyer : pas de droit sur ces colonnes).
- **Lecture limitée à ~55 km** autour de son propre quartier (politique RLS `neighbors_can_see_cell` : 0,5° de latitude, et 0,55° / cos(latitude) de longitude, soit ~55 km d'est en ouest aussi ; une fenêtre fixe de 1,5° couvrait ~112 km à Paris) : un compte ne peut pas aspirer toutes les annonces, donc tous les pseudos et quartiers du pays. L'appli plafonne le rayon à 50 km.
- Le profil public ne contient qu'un pseudo et le quartier. L'adresse e-mail reste dans `auth.users`, illisible par l'API.
- Les photos sont redessinées dans le navigateur (EXIF et GPS supprimés), réduites sous 1 Mo, puis vérifiées (`jpegMetadataSegments`) avant envoi. Elles sont affichées par téléchargement authentifié (`getPhotoUrl` rend une URL `blob:`) : aucun lien signé ne circule, et la CSP `img-src` n'a pas à être élargie. **L'interface doit appeler `URL.revokeObjectURL`** quand l'image disparaît.
- Les annonces expirent après 60 jours et sont supprimées à l'échéance par `neighbors_purge_expired()` (photos à effacer ensuite, voir plus bas). Suppression de compte : `deleteMyAccount()` (photos, puis cascade SQL).
- Données du journal de modération : identifiants et motif, jamais le contenu. 12 mois.

## Schéma

| Table | Contenu | Points clés |
| --- | --- | --- |
| `profiles` | `user_id`, `pseudo` (3 à 24 car., unique sans casse, sans caractère invisible ni de direction), `cell_lat`, `cell_lon`, `banned_at` | Cellule arrondie par trigger. `banned_at` : aucun droit client. 5 changements de pseudo ou de quartier par jour. |
| `posts` | `kind` (don, echange, pret, question, cherche), `category` (graines, plantes, compost, outils, materiel, services, autre ; facultative, **obligatoire pour `cherche`**, null pour les anciennes annonces ; écrite à la création seulement), `title` ≤ 80, `body` ≤ 1000, `species_id`, `photo_path`, `status` (open, closed, hidden), cellule, `expires_at` | Cellule, statut et expiration posés par trigger. `photo_path` doit être dans le dossier de l'auteur. 30 annonces ouvertes au plus par personne. |
| `replies` | réponses publiques, questions ouvertes seulement | `status` open ou hidden. Une demande « Je cherche » n'a pas de réponses publiques : on y répond par message privé (bouton « J'ai ce qu'il cherche », message prérempli modifiable). |
| `threads` / `messages` | conversation privée à deux, message ≤ 1000 | `user_a < user_b` : une conversation par paire. Aucun droit de modifier ou supprimer un message. |
| `thread_reads` | `thread_id`, `user_id`, `last_read_at` : dernière lecture d'une conversation, par participant | Une ligne par personne et conversation. Chacun ne lit et n'écrit que la sienne (RLS) ; la date est toujours celle du serveur (déclencheur : pas de date inventée). Aucun droit de suppression ; effacée avec la conversation ou le compte. Pas de quota : une ligne mise à jour sur place. |
| `organizers` | `user_id` (clé, un par personne), `name` 3 à 60 (unique sans casse, sans balise ni caractère invisible), `description` ≤ 500, `verified_at` | La demande est une insertion **sans** `verified_at`. `verified_at` : lecture seule pour les clients ; seul l'éditeur le pose (le déclencheur l'annule de toute façon si un client l'envoie). Une demande en attente se corrige ; une fois validée, le nom ne change plus depuis l'appli. Supprimer puis recréer la fiche redonne une demande non validée. |
| `events` | `organizer`, `title` ≤ 80, `description` ≤ 2000, `starts_at`, `ends_at` (≥ début, au plus dans 1 an), `place` ≤ 120 (texte libre, lieu public), `signup_url` (https, ≤ 300), `capacity` 1 à 10 000 (indicatif), `status` open, cancelled ou hidden, `interest_count`, cellule | Cellule, statut, compteur et date posés par déclencheur. Début au plus 1 h dans le passé. 3 événements par jour, 20 ouverts au plus. L'organisateur passe `open` <-> `cancelled` seulement ; il peut supprimer les siens. |
| `event_interest` | `event_id`, `user_id` (clé double) | Chacun ne voit et ne gère que sa ligne ; le total est dans `events.interest_count` (tenu par déclencheur). 50 par jour. Seulement pour un événement visible, ouvert et pas fini. |
| `push_subscriptions` | `user_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at` : un appareil qui reçoit les alertes | L'adresse doit être celle d'un service d'alerte connu (Google, Mozilla, Apple, Microsoft). 5 appareils au plus par personne, 20 abonnements par jour. Chacun ne voit et ne supprime que les siens ; les clés `p256dh` et `auth` ne sont lisibles par aucun rôle client. Supprimés avec le compte. |
| `notification_prefs` | `user_id` (clé), `messages` (vrai au départ), `nouveautes`, `evenements` (faux au départ) | Une ligne par membre, la sienne seulement. **Sans ligne, rien n'est envoyé.** Seule `messages` sert aujourd'hui. |
| `reports` | un signalement par utilisateur et par cible | Cibles : post, reply, profile, message, event. Ni modification ni suppression. On ne signale que ce que l'on voit. |
| `blocks` | blocages | Garde le pseudo bloqué pour l'afficher dans la liste. |
| `quotas` | compteurs par jour | Jamais décrémentés. Aucun accès par l'API. |
| `moderation_log` | journal des décisions (auto et éditeur) | Aucun accès par l'API. Rempli automatiquement pour le masquage automatique et les bannissements. |

Bucket de stockage `neighbors-photos` : privé, 1 Mo, JPEG/PNG/WebP, chemin imposé `<user_id>/<uuid>.jpg`, 20 fichiers par personne, pas d'écrasement.

## Règles d'accès (RLS partout, `(select auth.uid())`)

- **Annonces** : lisibles par les membres (connecté avec un profil non banni) si ouvertes, non expirées, à moins de ~55 km, et sans blocage dans un sens ou dans l'autre. L'auteur voit toujours les siennes.
- **Écriture** : seul l'auteur crée, passe `open` <-> `closed` (colonne `status` seule) et supprime. Une annonce masquée ne peut plus être modifiée par son auteur (la base ne touche aucune ligne : le client le signale).
- **Réponses** : visibles si l'annonce l'est ; créées sur une question ouverte ; supprimées par leur auteur ou par l'auteur de la question.
- **Conversations et messages** : visibles des seuls deux participants, masqués en cas de blocage. Envoi en son nom uniquement. On n'ouvre une conversation qu'avec une personne dont on voit déjà une annonce ouverte ou une réponse (`neighbors_can_contact` : membre non banni, sans blocage, dans la zone) ; l'annonce citée doit être visible et écrite par l'un des deux participants.
- **Signalements** : on ne voit que les siens. Pas d'auto-signalement. Un message ne se signale que si l'on est dans la conversation.
- **Événements** : lisibles des membres à moins de ~55 km (`neighbors_can_see_cell`), ni masqués ni finis depuis plus de 7 jours, hors personnes bloquées dans un sens ou dans l'autre. Les annulés restent visibles, marqués. Écriture : organisateur **validé** (`neighbors_is_organizer()` : fiche validée et compte non banni) et auteur. Retirer un organisateur ou bannir une personne masque tous ses événements (rien n'est rétabli tout seul). Une fiche d'organisateur n'est lisible que par son titulaire et à travers un événement visible : pas de liste de tous les organisateurs du pays.
- **Masquage automatique** : 3 signalements de comptes distincts, **de plus de 24 h et non bannis**, sur une annonce, une réponse ou un événement la passent en `hidden` (écrit dans `moderation_log`).
- **Bannissement** (`banned_at`) : ne lit ni n'écrit plus rien ; un déclencheur masque aussitôt ses annonces et réponses.
- **Quotas par jour (UTC)** : 5 annonces, 30 réponses, 200 messages, 10 nouvelles conversations, 20 signalements, 50 blocages, 5 changements de profil, 3 événements, 50 marques d'intérêt, 20 abonnements d'alerte, 5 demandes ou changements de fiche d'organisateur. Comptés par trigger dans `quotas` : supprimer une annonce ne rend pas le quota. Un client ne peut pas consommer le quota d'une autre personne (`neighbors_assert_self`).
- **Droits** : `revoke all` puis `grant` colonne par colonne. Les fonctions `security definer` ont `search_path = ''`, sont inaccessibles à `anon`, et seules `neighbors_is_member`, `neighbors_is_blocked`, `neighbors_can_see_cell`, `neighbors_is_organizer`, `neighbors_my_photo_count` et `delete_my_account` sont appelables par les connectés.

### Attaques considérées

| Attaque | Défense |
| --- | --- |
| Lire les messages d'un tiers | `messages_select` exige d'être participant du fil (et le fil lui-même est filtré par RLS). |
| Usurper l'auteur | `author`/`sender`/`reporter`/`blocker` doivent égaler `auth.uid()` (`with check` et garde `neighbors_assert_self` avant tout quota) ; `update` limité à `status`. |
| Publier avec une cellule falsifiée | Pas de droit `insert` sur `cell_*` (erreur de permission) et le trigger les écrase par celles du profil. |
| Contourner les quotas | Trigger `before insert` incontournable, compteur atomique (un seul upsert), jamais décrémenté, table inaccessible. |
| Démasquer une annonce masquée | `using` de `posts_update` exige `status` open ou closed. |
| Se donner des droits | `banned_at` n'a aucun droit client. |
| Aspirer toutes les annonces du pays | Lecture limitée à ~55 km ; changer de quartier est limité à 5 fois par jour. |
| Énumérer les utilisateurs et les fichiers | Un profil n'est lisible que s'il a un contenu visible ; `storage.objects` n'est lisible que pour ses propres photos et celles d'annonces visibles (avant correction, tout membre pouvait lister tous les dossiers `<user_id>/`). |
| Remplir le stockage | Nom de fichier imposé, 20 fichiers par personne, 1 Mo, 30 annonces ouvertes, orphelins repérés par `neighbors_orphan_photos()`. |
| Faux comptes qui masquent une annonce | Seuls comptent les signalements de comptes de plus de 24 h. Reste possible avec 3 comptes patients : surveiller `moderation_log`. |
| Devenir organisateur sans validation, s'auto-valider, changer de nom après validation, usurper un nom | `verified_at` sans droit d'écriture (et remis à vide par déclencheur), `organizers_update` limité aux demandes en attente, nom unique sans casse, publication refusée tant que la fiche n'est pas validée (`not_organizer`), l'éditeur seul valide. Reste possible : un nom qui ressemble à un autre (caractères proches) : à vérifier à la validation. |
| Lien d'inscription piégé (`javascript:`, `data:`, `http:`, adresse numérique, identifiants dans l'adresse, caractères invisibles) | Contrainte SQL (https, nom de domaine, ASCII, 300 caractères) ET même contrôle côté client, qui n'affiche jamais un lien qui ne le passe pas ; ouverture seulement après « Vous quittez l'appli », nouvel onglet en `noopener noreferrer`. Le contenu du site visé n'est pas contrôlé. |
| Événement hors zone, dates absurdes, faux intéressés | Cellule posée par la base ; fin ≥ début et ≤ 1 an, début pas plus d'1 h dans le passé ; intérêt seulement pour un événement visible, ouvert, pas fini ; 50 par jour ; l'organisateur ne voit pas qui est intéressé. |
| Pseudo trompeur (caractères invisibles, inversion de sens) | Contrainte SQL `profiles_pseudo_check` et validation client ; l'interface doit afficher les textes dans un élément isolé (`<bdi>` ou `unicode-bidi: isolate`). |
| Injection dans les filtres PostgREST | Le client n'utilise que `eq`/`in`/`gte`/`lte` du SDK (valeurs encodées), jamais `.or()` ni de filtre construit à la main ; chaque identifiant venant de l'interface est vérifié comme UUID avant l'appel (`assertUuid`). |
| XSS | Aucun `innerHTML` : tout texte est rendu par React. Les photos sont des `blob:` de type image. Le pseudo refuse `<` et `>`. |
| Suppression de compte qui laisse des photos | `deleteMyAccount` s'arrête à la moindre erreur de liste ou de suppression (avant : l'erreur renvoyée par Storage était ignorée et le compte supprimé quand même). |

### Preuves et limites connues

- **Preuves** : `supabase/neighbors/tests/run.sh` applique les migrations deux fois sur un Postgres jetable (faux environnement Supabase) puis joue environ 485 contrôles hostiles (PASS/FAIL, `scenarios.sql`, `scenarios_audit.sql`, `scenarios_v2.sql`, `scenarios_v3.sql` puis `scenarios_v4.sql`). `src/lib/neighbors/migration.test.ts` vérifie la migration sans Postgres. Dernière exécution le 2026-10-25 (migration v4 comprise, `scenarios_v4.sql`) : Postgres 16.15, 485 PASS, 0 échec ; la reprise de l'historique (conversations existantes considérées comme lues, une seule fois) a aussi été essayée à part. Lancer : `PGHOST=… PGPORT=… PGUSER=postgres supabase/neighbors/tests/run.sh` (crée puis supprime la base `neighbors_test`). Ce n'est PAS un vrai projet Supabase : refaire un essai de bout en bout après l'application de la migration (voir « Étapes »).
- Un quartier est **déclaré** : rien n'empêche de choisir une autre cellule (5 changements par jour).
- Les identifiants (UUID) ne sont pas secrets une fois vus ; il n'existe pas de moyen de les deviner. Connaître l'UUID d'un membre ne permet ni de lui écrire, ni de le bloquer, ni de signaler son profil, ni de lire son pseudo s'il n'a aucun contenu visible de vous : ces trois actions répondent de la même façon (42501) qu'il existe ou non.
- Les connexions anonymes de Supabase ont le rôle `authenticated` : la politique `profiles_insert` refuse un profil si le jeton porte `is_anonymous`, en plus de leur désactivation dans le tableau de bord.
- Le nom de pseudo est unique sans casse, mais pas « sans confusables » (un `а` cyrillique ressemble à un `a`) : surveiller les signalements d'usurpation.
- Un blocage est visible de l'autre partie par ses effets (le contenu disparaît).
- Un banni ou un bloqué peut recréer un compte avec une autre adresse : freiner, pas empêcher.
- Deux signalements simultanés peuvent compter 2 au lieu de 3 : le masquage se produit au signalement suivant.
- Si vous souhaitez limiter les inscriptions, activez un CAPTCHA dans Auth (recommandé avant ouverture publique).

## Nouveautés et invitation

- **Nouveautés** : premier onglet de l'Entraide. Résume ce qui est arrivé depuis la dernière visite : nouveaux dons, échanges, prêts, demandes (« Je cherche »), questions, et messages à lire. Chaque ligne ouvre la bonne liste. Aucun service ni table ajoutés pour les annonces : le navigateur appelle `listPosts` (100 annonces au plus) et compte celles des autres publiées après la date de visite.
- **Date de visite** : `localStorage`, clé `permajardin:voisins:visite:<identifiant du compte>` (une par compte, effacée à la suppression du compte et par « Effacer toutes mes données »). Écrite seulement après un chargement réussi des nouveautés. À la toute première visite, rien n'est « nouveau ». Mémoire indisponible : même effet, sans erreur.
- **Messages non lus** : table `thread_reads` (une date de lecture par conversation et par participant). Un message reçu compte tant qu'il est plus récent que cette date. La conversation est marquée lue à son ouverture (et à chaque message reçu pendant qu'elle est ouverte). Les 200 derniers messages reçus sont regardés.
- **Pastille du menu** : calculée par les mêmes appels, seulement si l'entraide est configurée ET autorisée. Le client Supabase n'est chargé qu'à ce moment. Rafraîchie toutes les 5 minutes (onglet visible, en ligne), au retour sur l'onglet et quand on lit des messages. Toute erreur donne 0, sans message.
- **Inviter un voisin** (Entraide > Nouveautés) et **Faire connaître l'appli** (Menu, et colonne de gauche sur grand écran) : `navigator.share` avec un texte neutre et l'adresse du site (`location.origin`) ; sans partage, le lien est copié, avec une confirmation visible ; si la copie est refusée, le lien s'affiche pour être copié à la main. Aucun pseudo, quartier, adresse ni jardin dans le texte ; aucun envoi automatique ; aucun contact lu ; marche sans compte ni entraide.

## Événements et organisateurs

- **Qui publie** : décision par défaut du propriétaire, seuls les **organisateurs validés par l'éditeur**. Les membres lisent, indiquent « Je suis intéressé(e) » et signalent. Ouvrir la publication à tous les membres demanderait une nouvelle migration (`events_insert` et le contrôle de `neighbors_event_before_insert`) : ne pas le faire sans décision écrite.
- **Parcours** : Entraide > Événements > « Devenir organisateur » (nom public et courte description, texte « nous vérifions votre demande »). L'éditeur valide dans le SQL Editor (`supabase/neighbors/moderation.sql`, §4). La personne voit alors « Publier un événement » et « Mes événements » (annuler, rouvrir).
- **Intérêt** : un simple compteur. Cela n'inscrit à rien et l'organisateur ne voit pas les noms. **S'inscrire** : lien externe de l'organisateur, https seulement, avec la fenêtre « Vous quittez l'appli ».
- **Lieu** : texte libre de 120 caractères, à choisir public (le formulaire le dit). Aucune adresse exacte, aucun e-mail dans les colonnes. La capacité est une information de l'organisateur : elle ne limite pas les marques d'intérêt.
- **Conservation** : un événement est supprimé 30 jours après sa fin (`neighbors_purge_expired()`, marques d'intérêt comprises). Une fiche d'organisateur reste jusqu'à son retrait ou la suppression du compte.
- **Nouveautés** : « N événements à venir » (événements ouverts des autres, pas finis) ; seuls ceux publiés depuis la dernière visite comptent dans la pastille du menu. Tant que la v4 n'est pas collée, l'onglet Événements affiche « Les événements ne sont pas encore ouverts chez vous » et les Nouveautés restent sans erreur.
- **Vérifier une demande** (avant de valider) : le nom correspond-il à une association, un jardin partagé, une mairie ou une personne réelle (site, annuaire, appel) ? Pas de nom qui ressemble à celui d'une institution sans lien avec elle. Doute : ne pas valider, répondre par e-mail. Retrait : les événements sont masqués d'un coup.

## Alertes de nouveaux messages et préférences (v5)

Fonction facultative. Sans la clé `NEIGHBORS_VAPID_PUBLIC`, l'écran « Mes notifications » dit que les alertes ne sont pas encore ouvertes et tout le reste marche.

### Ce qui se passe

1. La personne ouvre Entraide > Profil > **Mes notifications** > « Activer les alertes sur cet appareil ». Une fenêtre explique d'abord (autorisation `notifications`, texte `CONSENT_TEXT.notifications`). Ce n'est qu'après son accord que le programme internet pose sa propre question.
2. Le navigateur crée un abonnement auprès du service d'alertes de l'appareil (Google, Mozilla, Apple ou Microsoft). L'appli en enregistre l'adresse et les deux clés dans `push_subscriptions`, et crée la ligne `notification_prefs` (case « messages » cochée).
3. Quand un message est inséré, un **webhook de base** appelle la fonction `notify-message` avec l'en-tête secret `x-webhook-secret`. La fonction **ne retient que l'identifiant du message**, relit les faits par `neighbors_push_facts()` (réservée à la clé `service_role`), puis décide.
4. Elle n'envoie **rien** si : la ligne de préférences manque ou la case « messages » est décochée ; un blocage existe dans un sens ou dans l'autre ; l'un des deux comptes est banni ; le destinataire n'a aucun appareil ; l'expéditeur a déjà écrit il y a moins de 2 minutes dans la conversation ; le webhook arrive plus de 15 minutes après le message.
5. Sinon elle envoie une alerte **vide** (aucun corps) à chaque appareil du **destinataire** seulement, signée VAPID. Le texte « Vous avez un nouveau message » est écrit dans `public/push-sw.js`, qui ignore tout contenu reçu. Ni texte, ni pseudo, même chiffrés, ne passent par le service d'alertes. Les clés `p256dh` et `auth` sont gardées pour un usage futur (alerte chiffrée) ; elles ne servent pas aujourd'hui.
6. Un service qui répond 404 ou 410 (appareil disparu) : la fonction supprime l'abonnement. Un autre échec est passager : l'abonnement reste.
7. Un clic sur l'alerte ouvre l'appli sur Entraide > Messages (`/#entraide/messages`), ou la ramène au premier plan si elle est ouverte.

**Repli sans alerte** : la pastille du menu et la ligne « N messages à lire » des Nouveautés comptent les messages non lus (table `thread_reads`) à l'ouverture de l'appli, toutes les 5 minutes, au retour sur l'onglet et quand une alerte arrive. Un appareil sans alertes (ancien téléphone, iPhone sans icône sur l'écran d'accueil, autorisation refusée) reste donc entièrement utilisable.

**iPhone et iPad** : les alertes n'existent que si l'appli est ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent). L'écran l'explique : Partager, puis « Sur l'écran d'accueil », puis ouvrir l'appli depuis son icône.

**Changement de compte sur le même appareil** : se déconnecter, ou supprimer le compte, désabonne l'appareil et retire l'autorisation locale. Si l'adresse est encore enregistrée par un autre compte (déconnexion sans réseau), l'appli crée une nouvelle adresse.

**Préférences** : une seule case aujourd'hui (« Quand je reçois un nouveau message privé »). Elle vaut pour tous les appareils. Les colonnes `nouveautes` et `evenements` existent déjà (fausses au départ) mais aucune alerte de ce genre n'est envoyée : l'écran n'affiche pas de case inutile.

### Étapes pour le propriétaire (dans cet ordre)

À faire sur le projet Supabase **de l'entraide** (jamais celui de la synchro). Remplacez `<REF>` par la référence du projet (Project Settings > General).

1. **Base** : SQL Editor, coller `supabase/neighbors/migrations/20261025030000_neighbors_v5_push.sql`, exécuter. Rejouable, ne supprime aucune donnée.
2. **Générer les clés** (sur votre ordinateur, avec Node.js ; rien n'est écrit sur le disque) :
   ```
   node supabase/functions/notify-message/vapid-keys.mjs
   ```
   Trois lignes s'affichent : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_WEBHOOK_SECRET`. Notez-les dans votre gestionnaire de mots de passe. **Ne les collez ni dans le dépôt, ni dans un e-mail, ni dans une variable `VITE_`/`NEIGHBORS_`.** (Équivalent : `npx web-push generate-vapid-keys` donne la paire VAPID ; inventez alors un secret de webhook d'au moins 32 caractères.)
3. **Secrets de la fonction** (uniquement dans l'environnement Supabase de la fonction) :
   ```
   npx supabase login
   npx supabase secrets set --project-ref <REF> \
     VAPID_PUBLIC_KEY="<clé publique>" \
     VAPID_PRIVATE_KEY="<clé privée>" \
     VAPID_SUBJECT="mailto:<votre adresse de contact>" \
     NOTIFY_WEBHOOK_SECRET="<secret du webhook>"
   ```
   (ou Dashboard > Edge Functions > Secrets). `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis tout seuls à la fonction.
4. **Déployer la fonction** (depuis la racine du dépôt) :
   ```
   npx supabase functions deploy notify-message --no-verify-jwt --project-ref <REF>
   ```
   `--no-verify-jwt` est nécessaire : le webhook n'envoie pas de jeton de connexion. La fonction se protège elle-même avec le secret partagé. Sans la ligne de commande : Dashboard > Edge Functions > Deploy a new function, nom `notify-message`, coller le contenu de `supabase/functions/notify-message/index.ts` (un seul fichier, sans dépendance), puis désactiver « Verify JWT ».
5. **Créer le webhook** : Dashboard > Database > Webhooks > Create a new hook.
   - Name : `notify-message` · Table : `messages` (schéma `public`) · Events : **Insert** seulement.
   - Type : HTTP Request · Method : POST · URL : `https://<REF>.supabase.co/functions/v1/notify-message` · Timeout : 5000 ms.
   - HTTP Headers : `Content-Type` = `application/json` et `x-webhook-secret` = le secret de l'étape 2 (le même que dans `NOTIFY_WEBHOOK_SECRET`).
6. **Clé publique pour l'appli** : sur Vercel, ajouter `NEIGHBORS_VAPID_PUBLIC` = la clé **publique** (87 caractères), en Production, puis redéployer (la variable est lue au build). Le nom ne contient pas KEY, TOKEN ni SECRET : Vercel l'accepte. **Ne jamais mettre la clé privée ici.**
7. **Essai** avec deux comptes de test : sur un téléphone, activer les alertes ; depuis l'autre compte, écrire un message ; l'alerte « Vous avez un nouveau message » arrive. Dashboard > Edge Functions > notify-message > Logs : une ligne `{"sent":1,"removed":0,"failed":0}` (compteurs seulement, aucune donnée personnelle). Dashboard > Database > Webhooks affiche aussi les réponses.
8. **Arrêter** : supprimer le webhook (plus aucun appel), ou retirer `NEIGHBORS_VAPID_PUBLIC` de Vercel et redéployer (l'écran n'offre plus les alertes). Pour oublier tous les appareils : `delete from public.push_subscriptions;`.
9. **Changer les clés VAPID** : refaire les étapes 2, 3 et 6. Chaque appareil se réabonne tout seul à sa prochaine ouverture de l'entraide (si l'alerte était activée).

Limites à connaître : les alertes passent par le service d'alertes du navigateur (Google, Mozilla, Apple, Microsoft), qui voit l'adresse de l'appareil et un signal vide ; Brave demande d'activer « Utiliser les services Google pour les messages push » ; un autre service d'alertes que ceux de la liste fermée (contrainte `push_subscriptions_endpoint_check`, `PUSH_ENDPOINT` dans la fonction et `isKnownPushEndpoint` dans l'appli) serait refusé : il faut alors modifier les trois en même temps (un test compare la liste SQL et celle de la fonction). Le palier gratuit de Supabase compte une exécution de fonction par message envoyé dans l'entraide, même quand rien n'est envoyé ensuite.

## Modération par l'éditeur

À exécuter dans le SQL Editor du projet dédié (rôle `postgres`, qui ignore la RLS). Un seul modérateur : l'éditeur. Vérifier chaque semaine, et dès qu'un e-mail de signalement arrive.

### Délais

| Situation | Délai visé |
| --- | --- |
| Contenu manifestement illicite (pédocriminalité, apologie du terrorisme, menace grave, appel à la haine, atteinte grave à la vie privée) | Retrait dès connaissance, au plus tard sous **24 h**. Signalement aux autorités (plateforme Pharos : internet-signalement.gouv.fr). Voir « Conserver une preuve ». |
| Signalement ordinaire (spam, vente, propos injurieux) | Accusé de réception sous 48 h, décision sous **7 jours**. |
| Annonce masquée automatiquement | Examen sous 72 h : confirmer (`delete` ou laisser masqué) ou rétablir. |
| Demande de retrait reçue par e-mail (LCEN / DSA) | Accusé de réception immédiat, retrait sans délai si le contenu est manifestement illicite, sinon décision sous 7 jours avec motif. |
| Réquisition d'une autorité | Répondre dans le délai de la demande ; ne communiquer que ce qui est demandé (voir « Demande d'une autorité »). |

Notifier l'auteur par e-mail de toute décision (retrait, bannissement) avec le motif et la voie de contestation (réponse à l'e-mail, réexamen sous 7 jours). Ne pas révéler l'identité de la personne qui a signalé.

### Journal

Chaque décision est inscrite dans `moderation_log` (conservée 12 mois). Le masquage automatique et les bannissements y sont écrits par la base ; **les autres décisions sont à inscrire à la main** :

```sql
insert into public.moderation_log (action, target_kind, target_id, reason, note)
values ('delete', 'post', '<id>', 'vente (commerce)', 'signalé 2 fois ; auteur prévenu le 2026-11-02');
-- actions : auto_hide, hide, restore, delete, ban, unban, warn, dismiss, legal_request, other
```

### Requêtes

```sql
-- Signalements récents, regroupés par cible
select target_kind, target_id, count(*) as nb, array_agg(distinct reason) as motifs, max(created_at) as dernier
from public.reports group by 1, 2 order by dernier desc limit 50;

-- Masquages automatiques à examiner
select at, target_kind, target_id, reason from public.moderation_log where action = 'auto_hide' order by at desc;

-- Voir le contenu d'une annonce signalée et son auteur
select p.id, p.title, p.body, p.status, pr.pseudo, p.author
from public.posts p join public.profiles pr on pr.user_id = p.author where p.id = '<id>';

-- Masquer / rétablir une annonce ou une réponse
update public.posts   set status = 'hidden' where id = '<id>';
update public.posts   set status = 'open'   where id = '<id>';
update public.replies set status = 'hidden' where id = '<id>';

-- Lire un message signalé et sa conversation (seulement pour traiter un signalement)
select m.created_at, m.sender, m.body from public.messages m
where m.thread_id = (select thread_id from public.messages where id = '<id_message>') order by m.created_at;

-- Bannir : plus aucune écriture ni lecture ; ses annonces et réponses sont masquées par un déclencheur
update public.profiles set banned_at = now() where user_id = '<user_id>';
-- Lever le bannissement (les contenus restent masqués : rétablir à la main si besoin)
update public.profiles set banned_at = null where user_id = '<user_id>';
```

### Suppression définitive d'un compte ou d'un contenu

1. **Conserver une preuve si nécessaire** (contenu illicite grave, demande d'une autorité) : copier le contenu, l'identifiant et la date dans un fichier chiffré hors de la base, noter l'opération dans `moderation_log` (`legal_request` ou `delete`). Ne pas garder plus que nécessaire.
2. Effacer les **fichiers** par l'API Storage (tableau de bord : Storage > neighbors-photos > dossier `<user_id>`, ou CLI). Un `DELETE` SQL sur `storage.objects` laisse les fichiers.
3. Supprimer les lignes : `delete from auth.users where id = '<user_id>';` (cascade : profil, annonces, réponses, conversations, messages, signalements, blocages, quotas).

### Entretien quotidien (pg_cron ou à la main)

```sql
select * from public.neighbors_purge_expired();   -- supprime les annonces expirées, les événements finis depuis plus de 30 jours, vieux compteurs, signalements et journal de plus de 12 mois ; renvoie les chemins de photos des annonces supprimées
select * from public.neighbors_orphan_photos();   -- fichiers qu'aucune annonce ne référence depuis plus d'un jour
```

Les deux listes de chemins sont à effacer par l'API Storage (tableau de bord ou `supabase storage rm`). Sans cela, les photos des annonces expirées resteraient stockées au-delà des 60 jours annoncés. Planifier le tout une fois par jour. Pas de nettoyage des comptes inactifs : à prévoir (la CNIL recommande de supprimer les comptes inactifs depuis environ 2 ans ; `auth.users.last_sign_in_at` donne la date).

## Réponse à une demande RGPD

Délai légal : **un mois** à compter de la réception (RGPD art. 12), prolongeable de deux mois si la demande est complexe, avec information de la personne dans le premier mois.

1. **Vérifier l'identité** : répondre uniquement à l'adresse e-mail du compte (ou demander un lien de connexion). Ne jamais envoyer de données à une autre adresse. Pas de pièce d'identité sans nécessité.
2. **Journaliser** : date de réception, nature du droit, date de réponse (dans un registre des demandes hors base, sans recopier les données).
3. **Accès / portabilité** : extraire les données de la personne (remplacer `<uid>`) et les envoyer en JSON :
   ```sql
   select jsonb_build_object(
     'profil',   (select to_jsonb(p) - 'banned_at' from public.profiles p where user_id = '<uid>'),
     'annonces', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.posts a where author = '<uid>'),
     'reponses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.replies r where author = '<uid>'),
     'messages', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.messages m where sender = '<uid>'),
     'blocages', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.blocks b where blocker = '<uid>'),
     'signalements_envoyes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.reports x where reporter = '<uid>')
   );
   ```
   Les messages reçus d'autres personnes ne sont pas à communiquer sans nécessité (données de tiers). Ajouter l'e-mail du compte : `select email from auth.users where id = '<uid>'`.
4. **Rectification** : pseudo et quartier se modifient dans l'appli ; sinon `update public.profiles set pseudo = '...' where user_id = '<uid>'`.
5. **Effacement** : la personne peut le faire seule (Entraide > Mon compte). Sinon procédure « Suppression définitive » ci-dessus. Les signalements visant cette personne et le journal de modération sont conservés jusqu'à 12 mois (intérêt légitime et obligations légales) : le dire dans la réponse.
6. **Opposition / limitation** : bannir ou masquer (`banned_at`) le temps de l'examen, sans supprimer.
7. **Réponse** : confirmer par écrit ce qui a été fait, rappeler le droit de réclamation auprès de la CNIL.

### Demande d'une autorité (réquisition, juge)

Exiger un écrit identifiable (nom du service, base légale). Ne communiquer que ce qui est demandé, journaliser (`legal_request`), conserver la copie remise. L'adresse e-mail et les journaux de connexion de Supabase (Authentication > Logs) font partie des données d'identification que la loi permet de requérir ; elles disparaissent à la suppression du compte, sauf conservation légale demandée.

## Plan en cas d'incident

Exemples : fuite de la clé `service_role`, faille de RLS révélée, accès non autorisé à des messages, base exposée, contenu illicite massif.

1. **Contenir (dans l'heure)** : si la clé `service_role` ou `anon` est exposée, la **régénérer** (Project Settings > API) et redéployer avec la nouvelle `VITE_NEIGHBORS_SUPABASE_ANON_KEY`. Si une règle est en cause, couper l'accès : retirer la variable `VITE_NEIGHBORS_SUPABASE_*` de Vercel et redéployer (la fonction disparaît de l'appli), ou mettre le projet en pause. Révoquer les sessions (Authentication > Users, ou `delete from auth.sessions`).
2. **Évaluer (sous 24 h)** : consulter les journaux (Logs > API / Postgres / Auth), la liste des lignes touchées, les comptes concernés. Noter heure de découverte, périmètre, données (e-mail, pseudo, quartier, messages, photos), nombre de personnes.
3. **Corriger** : corriger la politique ou le droit en cause dans la migration, la rejouer (idempotente), rejouer `supabase/neighbors/tests/run.sh` sur une base jetable, ajouter le scénario qui aurait détecté le défaut.
4. **Notifier** : si la violation présente un risque pour les personnes, **notifier la CNIL dans les 72 h** suivant la découverte (téléservice de notification de violation sur cnil.fr) ; si le risque est élevé (messages privés lus, e-mails exposés), **informer les personnes concernées** sans délai, par e-mail, en clair : ce qui s'est passé, quelles données, que faire, qui contacter. Prévenir Supabase si leur plateforme est en cause.
5. **Registre** : consigner chaque violation (même non notifiée) : faits, effets, mesures. Conserver ce registre hors de la base.
6. **Après coup** : mettre à jour `docs/SECURITE.md`, remercier la personne qui a signalé la faille. Un contact de sécurité (même adresse que le contact légal) doit figurer dans l'appli.

Contenu illicite grave ou campagne d'abus : masquer en masse (`update public.posts set status='hidden' where author in (...)`), bannir, couper les inscriptions (Authentication > Providers > désactiver « Allow new users to sign up »), puis traiter comme un signalement.

## Étapes pour le propriétaire

1. Créer un **nouveau projet Supabase** (ne pas réutiliser celui de la synchro). Région UE.
2. Appliquer les migrations : SQL Editor, coller `supabase/neighbors/migrations/20261023000000_neighbors.sql`, exécuter (rejouable), puis `20261025000000_neighbors_v2.sql` (« Je cherche » et catégories ; rejouable, ne supprime aucune donnée). Puis `20261025010000_neighbors_v3_read.sql` (messages non lus ; rejouable, ne supprime aucune donnée ; les conversations déjà ouvertes sont considérées comme lues), puis `20261025020000_neighbors_v4_events.sql` (organisateurs et événements ; rejouable, ne supprime aucune donnée ; vous validez vous-même les organisateurs), puis `20261025030000_neighbors_v5_push.sql` (abonnements d'alerte et préférences ; rejouable, ne supprime aucune donnée ; sans elle, « Mes notifications » dit que les alertes ne sont pas encore ouvertes). Tant que la v3 n'est pas collée, la liste « Nouveautés » affiche une erreur avec « Réessayer » et la pastille du menu reste vide. Tant que la v2 n'est pas collée, l'appli marche pour les autres types d'annonce et affiche « Cette fonction n'est pas encore ouverte chez vous » pour « Je cherche ». Ou `supabase db push` depuis un dossier lié au projet dédié.
3. **Authentication > URL Configuration** : Site URL = adresse de production. Redirect URLs : `https://<production>/**` et `http://localhost:5173/**`.
4. **Authentication > Providers** : garder Email (lien magique). Désactiver « Confirm email » n'est pas nécessaire. Vérifier que Phone, OAuth et **Anonymous sign-ins** sont désactivés (une connexion anonyme aurait le rôle `authenticated`).
5. **SMTP** : le service d'e-mail par défaut de Supabase est limité à quelques messages par heure. Configurez un SMTP (Resend, Brevo, Mailjet…) dans Project Settings > Authentication > SMTP, avec un expéditeur de votre domaine. Adaptez le modèle d'e-mail « Magic Link » en français.
6. Vérifier le bucket `neighbors-photos` (Storage) : privé, limite 1 Mo.
7. **Variables Vercel** (Production de préférence ; en Preview, les prévisualisations de branches parleraient à la base de production, donc à de vraies personnes : créez plutôt un second projet Supabase de test) : `VITE_NEIGHBORS_SUPABASE_URL` et `VITE_NEIGHBORS_SUPABASE_ANON_KEY` (clé « anon » / publishable, publique par conception). Ne mettez **jamais** la clé `service_role` dans le navigateur ni dans une variable `VITE_*`. Redéployer.
8. La CSP de `vercel.json` autorise déjà `https://*.supabase.co` (pas de WebSocket : Realtime n'est pas utilisé) : rien à changer. Pour aller plus loin, remplacez le joker par les deux adresses exactes de vos projets (`https://<réf>.supabase.co`) : un script injecté ne pourrait alors pas envoyer de données vers un projet Supabase qui n'est pas le vôtre.
9. Compléter les champs `[à compléter]` de `src/lib/legal.ts` (éditeur, adresse, contact, directeur de la publication, hébergeur Supabase), faire valider les trois pages par un professionnel, vérifier que la région du projet est bien l'UE, puis régénérer `docs/{CONFIDENTIALITE,MENTIONS-LEGALES,CGU}.md` depuis `legal.ts` (le test `legal.test.ts` compare les deux).
10. Le retour du lien magique est identifié par `?entraide=1` : `main.tsx` doit appeler `initNeighbors()` **avant** `initSync()`.
11. **Ne pas activer Realtime** sur les tables de l'entraide, et laisser le schéma `public` seul exposé dans Settings > API. Désactiver l'API GraphQL si elle n'est pas utilisée.
12. Planifier `neighbors_purge_expired()` et `neighbors_orphan_photos()` chaque jour, et l'effacement des fichiers listés (voir « Entretien quotidien »).
13. Créer une adresse de contact de signalement et la lire chaque jour pendant le lancement. Activer un CAPTCHA (Authentication > Attack Protection) avant l'ouverture publique.
14. **Alertes de nouveaux messages** (facultatif) : suivre « Étapes pour le propriétaire » de la section « Alertes de nouveaux messages et préférences (v5) ».
15. Après application de la migration sur le vrai projet : essai de bout en bout avec deux comptes de test (voir les scénarios de `supabase/neighbors/tests/scenarios.sql`), puis lancer le « Security Advisor » du tableau de bord.

## Modération au quotidien (résumé)

Tout est dans `supabase/neighbors/moderation.sql` (à copier dans Supabase › SQL Editor) : la liste des signalements à traiter, puis les requêtes pour masquer, rétablir, bannir et noter la décision dans `moderation_log`. À lire une fois par jour. Délais : contenu illicite évident sous 24 h, signalement ordinaire sous 7 jours, annonce masquée automatiquement relue sous 72 h.

Nettoyage : une tâche `pg_cron` (`neighbors-purge-quotidienne`, 22 h UTC) exécute `neighbors_purge_expired()` chaque jour. Elle ne supprime pas les fichiers photo : lister avec `select * from public.neighbors_orphan_photos();` puis effacer à la main dans Storage › neighbors-photos.


## Taille du quartier (v6)

- **Choix** : Profil > Modifier, ou à l'inscription : « Standard (environ 2 km) » (défaut) ou « Large (environ 5 km, pour la campagne) ». Explication : « Plus la zone est grande, moins on peut deviner où vous habitez. » Aucune coordonnée en degrés n'est montrée. Un changement demande une confirmation (« Changer votre quartier ? »).
- **Base** : colonne `profiles.cell_size text not null default 'standard' check in ('standard','large')`. Le déclencheur `neighbors_profile_round` arrondit selon `cell_size`, quoi que le client envoie (valeur hors grille ramenée sur la grille). Le quota de 5 modifications par jour compte aussi un simple changement de taille (le déclencheur de quota arrondit lui-même avant de comparer).
- **Profils existants** : la migration ré-arrondit leur cellule (0,01°) sur la grille « standard », sans consommer leur quota (le déclencheur de quota est coupé puis remis dans le même fichier). Leurs annonces et événements existants sont ré-arrondis sur la grille de leur auteur (la cellule ne déménage pas). Les nouvelles annonces et les nouveaux événements copient la cellule du profil. Après un passage en « large », les anciennes annonces gardent leur ancienne cellule.
- **Distances** : calculées entre les CENTRES de cellules. Même cellule : « dans votre quartier ». Sinon « à environ N km », avec N au moins égal à 2 (standard) ou 5 (large, dès que l'une des deux personnes est en large). La taille de l'organisateur d'un événement n'est pas lisible : on suppose la taille du lecteur.
- **Visibilité** : `neighbors_can_see_cell` inchangée (environ 55 km autour du centre de sa cellule ; rayon maximal de l'appli : 50 km, marge de 5 km pour le décalage entre centre de cellule et domicile). Le banc vérifie 50 km (visible) et 67 km (invisible). Les bornes des requêtes de liste sont alignées sur la grille « large » et élargies d'une cellule.
- **Ordre** : coller `20261025040000_neighbors_v6_cell_size.sql` AVANT de publier l'appli v6 (elle lit `cell_size`). Rejouer la v1 remet l'ancien arrondi : rejouer ensuite la v6.
- **Banc** : `supabase/neighbors/tests/run.sh` (migration v6 sur données d'avant, rejouée deux fois, puis `scenarios_v6.sql`).
