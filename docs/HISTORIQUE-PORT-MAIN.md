# PermaJardin : état de reprise (10 novembre 2026, fin de journée, pour une autre conversation)

À lire avec `CLAUDE.md` (à jour de tout ce qui est fusionné : c'est la référence technique), `docs/ACTIONS-PROPRIETAIRE.md`, `docs/ENTRAIDE.md`, `docs/SECURITE.md` (§14 à §24), `docs/HISTORIQUE-CLAUDE.md` (l'autre conversation, jusqu'au 3 nov.) et `docs/archive/PLAN-RETOURS.md` (plan clos).

## 0. Consignes pour reprendre (à suivre à la lettre)
1. **Une seule conversation à la fois.** Les deux comptes ont déjà divergé deux fois (63 fichiers en conflit, puis `d704b93`). Si l'autre compte travaille, ne pas lancer de lot ici, et inversement. Avant tout : `git fetch origin && git log --oneline origin/main | head`.
2. **Jamais de push forcé.** `main` n'avance qu'en fast-forward, après vérification dans une copie propre : `git worktree add <dossier> <sha>`, lien symbolique vers `node_modules`, puis `npm run typecheck`, `npx vitest run`, `npm run build`, `npm run check:bundle`, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run e2e`. Ensuite `git fetch origin main`, `git merge-base --is-ancestor origin/main <sha>`, et `git push origin <sha>:main`, `:claude/port-main`, `:port-main`.
3. **Ne pas toucher à `claude/hopeful-turing-jnd7oo`** (réservoir qui a divergé, ne se fusionne pas).
4. **Un agent à la fois sur les fichiers communs** (`src/App.tsx`, `src/lib/features.ts`, `src/lib/overlays.ts`, `CLAUDE.md`, les feuilles de style). `git add` explicite, jamais `-A`. Ne jamais committer le travail en cours d'un autre agent ni écraser ses lignes dans `CLAUDE.md` (relire le fichier juste avant de committer).
5. **Ne pas passer `A_RELIRE` à `false`** (guide des ennuis, conseils, leçons) tant que le propriétaire n'a pas validé les contenus. Ne rien inventer en agronomie : formuler avec prudence (« souvent », « en général »), jamais de dose chiffrée ni de produit de synthèse.
6. **Interdits déjà décidés** : ne pas remettre `?debug` ni `?ortho` (verrou : `src/lib/security/review-params.test.ts`) ; ne pas publier des événements d'autres structures à leur place ; ne pas changer le format stocké sans migration (`STATE_VERSION` reste 2, champs optionnels + `sanitize`) ; toute nouvelle clé de stockage va dans `src/lib/security/inventory.ts` ; ne pas relancer le Street View sans accord (différé) ; ne pas reconstruire ce qui existe (les événements de l'entraide existaient déjà : lire le code avant de proposer).
7. **Limites de l'environnement** : l'IGN est injoignable depuis le conteneur (formats et plafonds de zoom non revérifiables ici) ; Open-Meteo n'est lisible que par l'outil de lecture de pages web (`wind_gusts_10m_max` et `wind_speed_unit=kmh` vérifiés le 9 nov.) ; GitHub passe par les outils MCP `mcp__github__*` ; l'outil `pkill` large est refusé, arrêter ses serveurs `vite preview` par port.
8. **Façon de répondre au propriétaire** : français simple, dire ce qui est vérifié ET ce qui ne l'est pas, un lot à la fois, chiffres mesurés (jamais « ça devrait marcher »). Il n'est pas développeur.

**Texte à coller dans l'autre compte :**
> Reprends le projet PermaJardin (dépôt `mon-dressing-app`, branche `main`). Lis dans l'ordre `CLAUDE.md`, `docs/HISTORIQUE-PORT-MAIN.md` (surtout la section 0 « Consignes pour reprendre »), puis `docs/ACTIONS-PROPRIETAIRE.md`. Vérifie d'abord que l'autre conversation ne travaille pas (`git fetch`, `git log origin/main`). Ne fais RIEN d'autre avant de me dire ce que tu as lu et ce que tu proposes comme prochain lot parmi la section 5. Respecte les consignes de la section 0 (fast-forward seulement, copie propre vérifiée, pas de `A_RELIRE` à `false`, pas de nouvelle clé de stockage hors inventaire).

## 1. Où est quoi sur GitHub
| Branche | Contenu | Statut |
| --- | --- | --- |
| `main` (`4d0654a` à l'écriture) | Tout ce que décrit la section 2 ; vérifié en copie propre : typecheck, 161 fichiers et 2473 tests, build, budgets (entrée 242,6 Ko gzip sur 250, précache 1105 Ko sur 1200), e2e 4 sur 4 | Référence |
| `port-main` et `claude/port-main` | Identiques à `main` après chaque lot vérifié | Branches de travail, poussées pour que l'autre compte les lise |
| `claude/hopeful-turing-jnd7oo` (`b3d5745`) | Développement parallèle ancien (MapLibre 4, vite 5, three 0.169) | **À ne pas fusionner.** Réservoir de lecture : `git show claude/hopeful-turing-jnd7oo:chemin` |

## 2. Fait et fusionné (détail technique dans `CLAUDE.md`)
**Jusqu'au 8 nov.** : lot A (moteur, fiches 173, SQL v9, stockage, 3D, interface), second lot d'écrans, cartes IGN (plan z19, cadastre estompé, service worker, `Retry-After`, LiDAR, « Télécharger ma zone »), lots F1 et F2 (registre `features.ts`, « Tout ce que je peux faire », « Je suis perdu », accueil à gros boutons, mode guidé, « Lire cet écran », Grandes touches, visite).

**9 et 10 nov. (cette conversation, vérifié lot par lot)** :
- Finition 1 `838ce9e` : version et commit visibles (Réglages, diagnostic), journal d'erreurs gardé (`pj.errors`), README et docs à jour, lexique (« ajustement de la carte »), budget par chunk.
- Corrections de la recette (mobile `b711196`, bureau `ef96aca`, carte vide `6ac0282`) : fiche qui s'ouvre en haut, puce hors connexion, cartes en français, Grandes touches, mise en page ordinateur, pastille « Je suis perdu » dans le menu.
- Finition 2 : budget de bundle en CI (`check:bundle`) et test de bout en bout `e2e/` (`1f604bc`), test du boudin (`Garden.sol`), « Imprimer / Partager ma semaine », plafond de 150 marqueurs sur la carte (`8e10a49`).
- Finition 3 : 360 phrases de plus de 20 mots réécrites dans les fiches, test étendu, `docs/RELECTURE-FICHES.md` (`1d2de61`) ; guide « bestioles et maladies » (21 fiches, écran `2e0b2c2`).
- Lot 4 : retrait des paramètres de revue et des exports morts `8d431cd` ; alertes canicule, sécheresse, vent fort et zone climatique `d02830c` ; journal du jardin avec photos datées et avant/après `7de7b48` ; rotation du potager `d0c9cf3` ; conseils compost et eau `1a93a91`.
- Lots 5 et 6 : derniers recouvrements carte et 3D (`4806a15`, `da64001`, `5d10b05`, `d2ae434`) ; « Apprendre à jardiner » (14 leçons, quiz, suivi `pj.lessons`) `f5f1d98`.
- Lot 7 `52764f2` : événements de l'entraide complétés (fichier d'agenda avec rappels, partage, point d'entrée dans « Tout », états vides expliqués, « Inviter une association ou une mairie à publier »).
- Lot 8 `5d3fffb` et `4d0654a` : 3D en portrait à 360 px en « Très grand » (panneau atteignable), barre d'outils de la carte sur deux rangées à 360 px, défilement résiduel supprimé.
Registre : 87 fonctions.

## 3. Contenus à relire par le propriétaire (marqués « à relire » à l'écran)
- Guide des ennuis : `docs/RELECTURE-ENNUIS.md`, `A_RELIRE` dans `EnnuisScreen.tsx` (produits cités : cuivre, soufre, savon insecticide, huile de colza, Bacillus thuringiensis, phosphate ferrique, à confirmer en vente libre).
- Conseils compost et eau : `docs/RELECTURE-CONSEILS.md`, `A_RELIRE` dans `ConseilsScreen.tsx` (eau de pluie : renvoi à la mairie ; liste de refus du compost à confronter aux consignes locales).
- Leçons : `docs/RELECTURE-LECONS.md`, `A_RELIRE` dans `LeconsScreen.tsx`.
- Fiches réécrites : `docs/RELECTURE-FICHES.md` (la limite de `howTo` est passée de 3 à 6 phrases courtes, à confirmer).
- Seuils d'alerte (`ALERT_THRESHOLDS` : canicule 32 °C sur 3 jours, sécheresse 30 mm sur 7 jours, vent 60 km/h), durées de rotation (`FamilyInfo`, « souvent 2 à 4 ans »), test du boudin (limites : ne reconnaît ni calcaire ni humifère).

## 4. Défauts d'affichage connus (rien de bloquant)
- À 360 px avec les « Aides au placement » ouvertes en Grandes touches, la feuille des aides recouvre l'échelle, l'attribution et la consigne (existait avant le lot 8).
- 3D portrait à 360 px en Grandes touches : la rangée « Animer / Réglages 3D » dépasse d'environ 24 px sous le panneau, coupée jusqu'au défilement (pas d'indice de défilement).
- Non vus à l'écran : la carte « Prochaine étape » avec « Leçon suivante » (testée en logique seulement) ; recherche, état vide et clavier des écrans de leçons, d'ennuis et de conseils (pas de jsdom : seulement rendu serveur et e2e).
- Aucune étape e2e pour l'entraide (le build e2e n'a pas les variables `NEIGHBORS_*`).

## 5. Idées possibles (rien n'est commencé ; demander au propriétaire)
Lecture des événements sans compte (migration v10 : politique `anon` limitée, risque de moissonnage) ; alertes push « événement » et « nouveautés » (Edge Function, `push-sw.js`, préférences déjà prévues) ; récapitulatif hebdomadaire par e-mail (SMTP du propriétaire, consentement séparé, désinscription en un clic) ; lien profond vers un événement ; `docs/RELECTURE-ROTATION.md` ; bouton « Remettre à zéro » des leçons ; étape e2e de l'entraide (second build avec faux Supabase) ; indicateur de défilement du panneau 3D ; **Street View piste B puis A** (voir le plan : parcours des points « Photos du jardin » existants, `Garden.tours`, relever le plafond de 6 points / 25 Mo ; effort S à M puis M à L).

## 6. Ce que seul le propriétaire peut faire
Voir `docs/ACTIONS-PROPRIETAIRE.md` et `docs/ENTRAIDE.md`. En résumé : champs `[à compléter]` de `src/lib/legal.ts` et relecture juridique ; adresse e-mail de sécurité (`SECURITY.md`, `security.txt`, expire le 2027-10-27) ; Supabase (SMTP à lui, CAPTCHA, purge : `PURGE_SECRET`, fonction `purge-neighbors-photos`, `cron.sql`, essai à deux comptes AVEC un événement, **valider un premier organisateur** : sans cela la liste d'événements reste vide pour tout le monde) ; Vercel (pare-feu `/api/identify` et `/ext/*`, CSP avec l'hôte Supabase exact) ; GitHub (secret scanning, push protection, signalement privé, protection de `main`) ; relectures de la section 3 ; essais sur téléphones réels (iPhone épinglé, Android, impression) ; test avec 5 personnes de plus de 70 ans (10 tâches ; protocole dans le plan) ; mesures IGN réelles avec ses commandes `curl` sur son Mac (cadastre maxzoom, plan z20, format x-bil du LiDAR).

## 7. Pas vérifié
Aucun appareil réel (caméra, boussole, GPS, joystick, Retour d'Android, voix, fluidité de la 3D), IGN injoignable depuis le conteneur, vrai Supabase et vrai Vercel au-delà des vérifications de schéma de l'autre conversation, import du fichier d'agenda dans un vrai calendrier, impression réelle, lecteurs d'écran. **Le job CI distant n'a jamais été observé** : à la première exécution, surveiller `playwright install --with-deps chromium`, le rendu WebGL logiciel du job `e2e`, `actions/upload-artifact@v4`, le banc SQL et CodeQL.

## 8. Façon de travailler
Interface et commentaires en français, phrases ≤ 20 mots (tests). Avant chaque livraison : `npm run typecheck`, `npx vitest run`, `npm run build`, `npm run check:bundle`, `npm run e2e`, `node scripts/qa/targets.mjs` (et `--big`), puis captures à 360 et 390 px (tactile d'abord), clair et sombre, texte Normal / Grand / Très grand. Pied de commit : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` et `Claude-Session: https://claude.ai/code/session_01VaPEW3F14FAnyJBFRrTxJk`. Les limites d'utilisation tombent vite avec plusieurs agents en parallèle : un lot à la fois sur les fichiers communs, deux agents au plus sur des fichiers disjoints.
