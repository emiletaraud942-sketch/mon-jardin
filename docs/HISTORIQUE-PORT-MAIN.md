# PermaJardin : ce qui a été fait sur `port-main` (état au 6 novembre 2026, pour une autre conversation)

À lire avec `CLAUDE.md` (à jour de tout ce qui est fusionné), `docs/HISTORIQUE-CLAUDE.md` (l'autre conversation, jusqu'au 3 nov.), `docs/PLAN-RETOURS.md`, `docs/ACTIONS-PROPRIETAIRE.md` et `docs/SECURITE.md` (§14 à §24).

## 1. Où est quoi sur GitHub
| Branche | Contenu | Statut |
| --- | --- | --- |
| `main` | Tout ce que décrit la section 2, vérifié en copie propre (typecheck, 1859 tests, build) | Référence. Dernier commit vérifié : `c690b18` |
| `port-main` | `main` + éventuellement du travail en cours (voir section 3) | Branche de travail de cette conversation, poussée pour que l'autre compte la lise |
| `claude/hopeful-turing-jnd7oo` (dernier commit `b3d5745`) | Développement PARALLÈLE de cette conversation, parti de `f412b70`, bâti sur MapLibre 4 / vite 5 / three 0.169 | **À ne pas fusionner** (63 fichiers en conflit avec `main`). Sert de réservoir : on y lit (`git show claude/hopeful-turing-jnd7oo:chemin`) ce qu'il reste à reporter |

Histoire : `main` a été développé en parallèle par deux conversations à partir de `f412b70`. L'autre conversation a fait l'audit du 27 oct., les retours du 29 oct. et les montées de version (MapLibre 6, vite 7, vitest 5, three 0.186). Cette conversation a refait en parallèle un audit proche (vague 12), puis, au lieu de fusionner, a **reporté sur `main` seulement ce qui manquait** (sections 2 et 4).

## 2. Déjà fusionné dans `main` (par cette conversation, après le 3 nov.)
- **Moteur** : statut `recoltee` (`engine/annuelles.ts`), `yearPlan(plants, species, today)`, `Garden.climateZone`/`rainMmPerYear` (`engine/climate.ts`), `engine/plain.ts` (« Pourquoi ? » en mots simples), art. 671/672 reformulés (usages locaux d'abord, espaliers, 672).
- **Fiches** : 173 espèces (11 ajoutées : buis, if, photinia, troène, ciboule, marjolaine, narcisse, tulipe, pâtisson, radis noir, citronnier), cuivre réécrit en prudent (test), taille abricotier/amandier en été, nidification en recommandation (OFB).
- **Entraide, SQL** : migration additive `20261104000000_neighbors_v9_hardening2.sql` (sondes de blocage dans `neighbors_private`, masquage auto plus exigeant, contraintes de texte complétées, purge à 60 jours avec `supabase/neighbors/cron.sql` tout en commentaire et Edge Function `purge-neighbors-photos`). Banc `run.sh` : 922 contrôles, 0 échec (faux Supabase, jamais testé sur un vrai projet). v7 et v8 de `main` inchangées.
- **Stockage / sécurité** : copies `:precedente`, `readFailure` (version plus récente jamais effacée), copie locale avant tout remplacement par la synchro ou l'import, effacement complet des clés (liste + test qui relit le code), `http.ts`, CI (secrets, SQL, CodeQL), textes légaux (« région à confirmer », `LEGAL_VERSION` 1.6), SECURITY.md, docs.
- **Vue 3D** : champ de vision selon l'écran, collisions (troncs, haies, parcelle ; sous-pas de 0,2 m conservés, bonds compris), « Aller à », « Mouvement réduit », aide jusqu'à « Compris », arbres des environs variés par saison, ombres de contact, garde WebGL (`Garden3DGate`, « Essayer quand même »), `preload3d`, immersif tablette.
- **Interface (lot A)** : branchements des moteurs, barre du bas 12 px `--muted` + « Planter », météo 7 jours en 2 lignes, sous-onglets dans la colonne ≥ 761 px, « ? » d'aide de l'écran courant, bouton Retour d'Android (`openLayer`/`closeLayer`), `inert`, `diagnostics` (« Exporter un diagnostic »), « Je n'ai pas d'arbre », puce hors connexion, `TextSizeButton`, recherche triée, « Récupérer la copie de sécurité », « Marquer comme récoltée ».

## 3. En cours au moment de l'écriture (NON fusionné, NON vérifié)
Second lot d'écrans (agent `dev-frontend-pwa`), voir section 4 pour la liste. Tant que `main` ne contient pas un commit « Report sur main : second lot… », rien de ce lot n'est livré.

## 4. Reste à reporter depuis `claude/hopeful-turing-jnd7oo` (adapter à `main`, ne pas copier)
B8 aides de placement repliées (« Viser » en évidence, « Aides », « Coller aux bords », « Fond simple ») · B6/B7 fiche plante : « Déplacer » et « Photos » hors du repli, libellés « Détails » distincts · B14 À faire : icône par type, « Urgent »/« Cette semaine », 3 tâches puis « Voir tout » · B15 tuile gel = minimum + phrase « Gel prévu samedi… » · B10 toasts fermés au changement d'écran · B11 « Effacer le recalage » annulable · B12 conseil de Réglages = titre de `nextStep()` · B16 menu Scanner par intention · B17 catalogue en page sur téléphone · filtres du catalogue en union (Comestible, Mellifère, Ombre, Facile, Ce mois-ci) · B22 pas d'autoFocus clavier + « Ajouter « xyz » comme plante personnalisée » · B19 « Mon adresse n'apparaît pas » (`LocationPicker`) · liste de courses (`shoppingList.ts`) · « Lire » (`speech.ts`) · `TasksProvider` · `space.ts` (storage.estimate) · `Panorama.bytes` · CSS MapLibre chargé par module · code mort.
**À ne PAS porter** (`main` fait déjà mieux) : `.ics`, sauvegarde complète `.permajardin`, écran allumé (`lib/wakeLock.ts`), recherche (`data/species/search.ts`), badges de risque (`RiskNotes`), media/chunkError.

## 5. Décisions en attente du propriétaire
1. Fenêtres de récolte du thym, romarin, sauge, menthe, laurier-sauce, chou de Daubenton : `main` les a raccourcies pour coller à ses règles ; l'agronome recommande avril-octobre (persistants).
2. Émojis composés (U+200D, ex. 👩‍🌾) refusés par la base de l'entraide depuis la v7 : les autoriser ?
3. Version plus récente que l'appli : refuser aussi l'import et la synchro (aujourd'hui : copie puis remplacement) ?
4. Environ 9 annuelles sans date de récolte (coquelicot, cosmos, phacélie, seigle, trèfle incarnat, vesce, moutarde blanche, œillet d'Inde, lupin) : suivies un an après la plantation (`main`, test qui le verrouille) ou arrêtées après leurs tâches d'entretien ?
5. Extrait des signalements (S9) : non porté, contredit « jamais le contenu signalé » des textes légaux.

## 6. Ce que seul le propriétaire peut faire
Voir `docs/ACTIONS-PROPRIETAIRE.md` et `docs/ENTRAIDE.md`. En résumé : migrations de l'entraide v1 à v9 (v9 en dernier) sur un projet Supabase dédié (ne jamais exposer `neighbors_private`), purge (`PURGE_SECRET`, fonction à déployer, `pg_cron`/`pg_net`/Vault, décommenter `cron.sql`), modèles d'e-mail Supabase avec `{{ .Token }}`, suppression des deux variables Vercel `NEIGHBORS_*` tant que l'entraide n'existe pas, pare-feu Vercel (`/api/identify`, `/ext/*`), CSP avec les deux hôtes Supabase exacts, GitHub (secret scanning, push protection, signalement privé, protection de `main`), champs `[à compléter]` de `src/lib/legal.ts` + relecture juridique, adresse e-mail de sécurité (`SECURITY.md`, `security.txt`, expire le 2027-10-27).

## 7. Pas vérifié
Aucun appareil réel (caméra, boussole, joystick, Retour d'Android, fluidité de la 3D), IGN injoignable depuis le conteneur (format x-bil, netteté de la vraie photo), vrai Supabase/Vercel/GitHub Actions (le job SQL et CodeQL n'ont jamais tourné), `updateApp()` avec un vrai service worker.

## 8. Façon de travailler
Interface et commentaires en français, phrases ≤ 20 mots (test). Avant chaque livraison : `npm run typecheck`, `npm test`, `npm run build`, puis essai Chromium (Playwright, 360 et 390 px tactile d'abord). Toute nouvelle clé de stockage va dans `src/lib/security/inventory.ts`. Ne jamais forcer un push sur `main` (avancer en fast-forward seulement, après vérification en copie propre). Pied de commit : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_01VaPEW3F14FAnyJBFRrTxJk`. Pour reprendre : `git fetch origin && git log --oneline origin/main | head`, relire ce fichier et la section 4, puis lancer un lot à la fois (les limites d'utilisation tombent vite avec plusieurs agents en parallèle).
