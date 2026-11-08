# PermaJardin : ce qui a été fait avec Claude (résumé pour une autre conversation)

Arrêté au 3 novembre 2026, dernier commit sur `main` : `b584f4f`. À lire avec `CLAUDE.md` (architecture et conventions, tenu à jour à chaque étape), `docs/archive/PLAN-RETOURS.md`, `docs/ACTIONS-PROPRIETAIRE.md` et `docs/SECURITE.md` (journal détaillé §14 à §23).

## 1. Le projet en deux lignes
PWA française (React 18 + TypeScript + Vite) pour cartographier son jardin en 3D (données IGN), placer ses plantes au mètre près, savoir quoi planter où et quand tailler, arroser, récolter. Local-first (IndexedDB), budget 0 €. Propriétaire non développeur : il fait lui-même ce qui est réglage de compte (Supabase, Vercel, GitHub, textes légaux) et les essais sur téléphone.

## 2. Façon de travailler (à respecter)
- Interface et commentaires en français, phrases courtes (un test vérifie qu'aucune phrase ne dépasse 20 mots). Graisses uniquement via `--fw-*`. Couleurs via variables CSS.
- Branche de travail : `claude/upbeat-volta-sh223c`. Après vérification, on pousse la branche puis on avance `main` (`git push origin HEAD:main`, fast-forward). Pas de pull request sauf demande. Pied de commit : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_01B5jCSL7XPYnVbke7HpQWHp`.
- Avant chaque livraison : `npm run typecheck`, `npm test` (1558 tests au dernier passage), `npm run build`, et un essai réel dans Chromium (Playwright, WebGL logiciel) **sur téléphone d'abord** (360 et 390 px, tactile).
- Rien de ce qui touche une donnée existante sans migration (`STATE_VERSION` dans `src/lib/migrate.ts`). Champs ajoutés = optionnels.
- TypeScript reste en 5.9 (Vercel compile `api/*.ts` avec l'API JS du paquet), React 18, MapLibre 6 (WebGL 2 obligatoire, repli prévu).
- Dire honnêtement ce qui n'est **pas** vérifié (téléphone réel, vrai Supabase, IGN injoignable depuis le conteneur).

## 3. Historique, dans l'ordre

### Avant le 27 octobre (conversations précédentes)
Carte IGN et placement des plantes, 3D réaliste (plantes procédurales, saisons, ombres), Promenade 3D, scan du jardin (recalage GPS, scan photo et vidéo, Pl@ntNet), LiDAR HD, habillage fidèle à la maquette Leafora, navigation mobile (barre du bas à 5 entrées), entraide entre voisins v1 à v7 (Supabase dédié, RLS, événements, alertes), photos du jardin (panoramas), 162 fiches espèces.

### Audit sécurité et complétude (27-28 octobre), lots 1 à 6
Corrections de sécurité (CSP, en-têtes, validation des imports, RGPD, inventaire des données), règles du moteur (annuelles, art. 671/672, froid observé), sauvegarde avec photos (`.permajardin`), calendrier `.ics`, avertissements de risque des plantes, bandeau de mise à jour. Montées de version (Vite 7, vitest 5, vite-plugin-pwa 2, three 0.186, MapLibre 6), `@vercel/node` retiré, `npm audit` : 0 alerte. Liste des actions réservées au propriétaire : `docs/ACTIONS-PROPRIETAIRE.md`.

### Retours du 29 octobre : 20 remarques, plan en 10 étapes (`docs/archive/PLAN-RETOURS.md`)
1. **Ne plus perdre de données** : copie de secours synchrone (localStorage) en plus d'IndexedDB, essai d'écriture au démarrage, état « enregistré » visible, synchro automatique sans écrasement silencieux (`autoSync.ts`).
2. **Retrouver la sauvegarde sur téléphone** : menu « Partager », message qui dit où est le fichier.
3. **Placement** : annuler / rétablir (↶ ↷, Ctrl+Z, 50 actions), messages 30 s avec grande croix, avertissement de position court (le long texte sous « En savoir plus »).
4. **Grands écrans** : interface agrandie à 1800, 2300 et 3000 px.
5. **Achat et plantation** : formulaire juste après le placement (forme : graine, godet, motte, racines nues, scion, baliveau, demi-tige, haute-tige ; hauteur, lieu, prix, date, note), âge estimé d'après la forme, conseil « quand mesurer », lecture d'étiquette par OCR local (Tesseract, internet seulement la première fois).
6. **Tâches** : carte verte avec ✓ à la validation, « Plus tard » (demain, semaine, mois), « Je ne veux pas le faire », liste « Mises de côté » avec « Remettre ».
7. **Saison du jardin** : Aujourd'hui / Hiver / Printemps / Été / Automne sur la 3D, la carte (couleurs des houppiers) et les photos du jardin (`src/engine/season.ts`).
8. **Boutures entre voisins** : option « Montrer mon jardin » (liste d'espèces seulement), onglet Entraide > Jardins, demande de bouture par message préparé. Migration `supabase/neighbors/migrations/20261029000000_neighbors_v8_gardens.sql` (59 scénarios hostiles sur un Postgres 16 jetable, 785 au total, 0 échec).
9. **« Street View »** : l'appli dit maintenant que les Photos du jardin ne reconnaissent pas les plantes (c'est « Scanner mon jardin > Scanner les plantes »).
10. **Vidéo de promo** : scénario seulement (`docs/VIDEO-PROMO.md`).

### Audit du 30 octobre
- **Promenade 3D** : joystick agrandi (`clamp(140px, 44vw, 200px)`), marche 2,5 m/s, course 6 m/s, déplacement en sous-pas de 0,2 m (ne traverse plus un mur fin).
- **Adaptation téléphone** : panneau Options de la carte qui défile au-dessus de la feuille du bas, saisons en grille de 3 (carte et 3D), saisons visibles même panneau 3D réduit, onglets d'entraide resserrés. Aucune cible tactile sous 40 px sur les 9 écrans.
- **Note → achat** : bouton « Remplir l'achat depuis ma note » (`noteParse.ts`, règles de mots, pas d'IA) : forme, hauteur, prix, lieu, date ; proposé puis appliqué, annulable.

### Comptes et Supabase (30 octobre)
- Projet Supabase **`permajardin`** (réf `ebgrxcyvdayvrjruefem`, Paris) créé ; les 4 migrations de synchronisation appliquées et relues (RLS active, `anon` sans droit, comptes anonymes refusés, 5 Mo max, `delete_my_account`). URL et clé publishable posées dans Vercel (Production) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` ; production redéployée.
- **Connexion par code** à saisir dans l'appli (6 à 10 chiffres) au lieu du lien magique, qui ne marchait pas entre Safari et l'appli épinglée sur iPhone. Session gardée, reprise automatique des jardins du compte. Écran de bienvenue : « J'ai déjà un compte » (`RestoreAccount.tsx`). Essayé avec un faux serveur Supabase (mauvais code, bon code, relance, second appareil qui reprend le jardin).

## 4. État de l'hébergement
- Vercel : projet `monjardin` (`prj_dH61fjyVGy28W230K7XGQVVQgM5B`, équipe `team_YaH1QuNB15OF2zzIWRqhjHZX`), adresse de production `https://mon-jardin-app.vercel.app`. `PLANTNET_API_KEY` posée.
- Supabase (offre gratuite, 2 projets actifs maximum) : `lexio` (autre application, ne pas toucher), `la-filandiere` (mise en pause), `permajardin` (synchronisation, actif).
- Variables Vercel **`NEIGHBORS_SUPABASE_URL` et `NEIGHBORS_SUPABASE_PUBLISHABLE`** : posées le 24 octobre, valeurs masquées (type sensible), destination inconnue, aucun projet visible n'a la base de l'entraide. Elles affichent l'onglet Voisins en production alors que l'entraide n'existe pas : **à supprimer** (les outils Vercel de Claude ne savent pas supprimer une variable), puis redéployer.

## 5. Ce que seul le propriétaire peut faire (état au 3 novembre)
1. Supabase `permajardin` > Authentication > Emails > Templates : modifier **« Confirm signup » et « Magic Link »** pour qu'ils contiennent `{{ .Token }}` et pas de lien (sinon aucun code n'arrive). Texte prêt dans `docs/ACTIONS-PROPRIETAIRE.md` §2.
2. Authentication > URL Configuration : Site URL `https://mon-jardin-app.vercel.app`, Redirect URLs `https://mon-jardin-app.vercel.app/**` et `http://localhost:5173/**` (pas de joker). « Anonymous sign-ins » désactivé.
3. SMTP personnalisé (Resend ou Brevo) avant d'ouvrir à d'autres personnes (le service par défaut est très limité).
4. Supprimer les deux variables `NEIGHBORS_*` dans Vercel, puis faire redéployer.
5. Essai réel sur iPhone avec l'appli épinglée : connexion par code, relance sans redemander, second appareil.
6. Entraide (plus tard) : un **second** projet Supabase (il faut libérer une place gratuite ou payer environ 10 $/mois), y coller les 8 fichiers de `supabase/neighbors/migrations/` dans l'ordre (v8 en dernier), variables `NEIGHBORS_SUPABASE_URL` et `NEIGHBORS_SUPABASE_PUBLISHABLE`, `pg_cron` pour le nettoyage quotidien, CAPTCHA.
7. GitHub : secret scanning, protection de `main`, double authentification ; Vercel : règles de limitation de débit sur `/api/identify` et `/ext/*`, protection des prévisualisations.
8. Textes légaux : champs `[à compléter]` de `src/lib/legal.ts`, relecture par un professionnel, puis régénérer `docs/CONFIDENTIALITE.md`, `MENTIONS-LEGALES.md`, `CGU.md`.

## 6. Pas vérifié (à tester sur un vrai appareil)
Caméra, boussole et raccords des photos du jardin ; lecture d'étiquette sur de vraies étiquettes ; menu « Partager » de la sauvegarde ; vitesse de marche de la Promenade au doigt ; connexion par code avec le vrai projet Supabase et une vraie appli épinglée ; couche LiDAR IGN (format x-bil) ; la CI des derniers commits n'était pas encore terminée quand on a arrêté de regarder.

## 7. Pistes d'amélioration (rien de commencé)
- **Entraide** : passer sa connexion au code (même défaut que la synchro sur iPhone), ouvrir son projet Supabase, essai de bout en bout à deux comptes.
- **Compte** : mettre en avant la connexion (carte « Prochaine étape » de l'accueil, section Réglages ouverte par défaut) ; fusion des plantes en cas de conflit au lieu de « garder l'un ou l'autre » ; synchroniser les photos (aujourd'hui jamais envoyées).
- **Photos du jardin** : relier la reconnaissance de plantes aux points de vue (décision du propriétaire) ; essai caméra et boussole sur téléphone.
- **Note → achat** : tolérer les fautes de frappe et plus de tournures ; une vraie compréhension du texte demanderait une IA externe (incompatible avec 0 € et « tout reste sur l'appareil »).
- **Vidéo de promo** : tournage par le propriétaire, puis sous-titres et variantes.
- **Interface** : les 7 onglets d'entraide font trois rangées à 360 px ; la photo aérienne plafonne à z19, donc le jardin reste petit de près sur très grand écran.
- **Fiabilité** : si des données « disparaissent » malgré tout, regarder l'état d'enregistrement dans Réglages (adresse différente, navigation privée, effacement à la fermeture, Safari qui efface après environ 7 jours sans ouverture hors appli épinglée).
