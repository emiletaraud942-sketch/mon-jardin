# A intégrer dans docs/ENTRAIDE.md et docs/SECURITE.md (par l'agent de documentation)

Source : audit du 27 octobre 2026, vague 12. Fichiers : `supabase/neighbors/migrations/20261027000000_neighbors_v7_hardening.sql`,
`supabase/migrations/20261027010000_snapshots_no_anon.sql`, `supabase/neighbors/cron.sql`, `supabase/functions/purge-neighbors-photos/`,
`api/identify.ts`. Banc : `supabase/neighbors/tests/run.sh` = 1114 PASS, 0 FAIL (Postgres 16.15, tout rejoué deux fois).

## ENTRAIDE.md, liste des migrations et « Étapes pour le propriétaire »
Coller dans l'ordre, après la v6 : `20261027000000_neighbors_v7_hardening.sql` (rejouable, ne supprime ni ne modifie aucune donnée). Si une ancienne migration
(v1, v4) est rejouée, rejouer la v7 ensuite. Projet de SYNCHRO (autre projet) : `20261027010000_snapshots_no_anon.sql`, après les trois précédentes.
Purge (remplace « Entretien quotidien » et l'étape 12) : déployer `npx supabase functions deploy purge-neighbors-photos --no-verify-jwt --project-ref <REF>`,
secret `npx supabase secrets set --project-ref <REF> PURGE_SECRET="<32 caractères au moins>"`, puis activer les tâches de `supabase/neighbors/cron.sql`
(pg_cron + pg_net + Vault, tout y est commenté). La fonction purge, liste les orphelins (`neighbors_orphan_photos`), efface par l'API Storage (500 fichiers
au plus par appel). Journal : compteurs seulement. La clé `service_role` n'existe que dans l'environnement de la fonction.

## ENTRAIDE.md, règles d'accès
- **Quartier** : la première correction après l'inscription est libre, ensuite un changement de cellule (position ou taille) par 30 jours (`profiles.cell_moved_at`,
  sans droit client ; erreur `cell_change_too_soon`). L'éditeur n'est pas limité. Remplace « 5 changements par jour » pour le quartier (le pseudo reste à 5 par jour).
- **Schéma privé** : `neighbors_private.neighbors_is_blocked` et `neighbors_can_contact` (plus d'appel RPC, plus de sondage d'identifiants). Ne JAMAIS ajouter
  `neighbors_private` aux « Exposed schemas » (Settings > API). Retirer EXECUTE aux connectés seul casserait toutes les politiques (constaté).
- **Textes libres** : contrôles (sauf `\n`), U+007F-009F, U+061C, U+200E/F, U+202A-E, U+2066-9 refusés par 9 contraintes SQL (titres, textes, messages, réponses,
  événements, lieu, description d'organisateur, précisions de signalement). Posées `NOT VALID` puis validées ; si d'anciennes lignes violent la règle, la
  contrainte reste `NOT VALID` (nouvelles écritures contrôlées, message NOTICE) : nettoyer puis `alter table … validate constraint …`. Tant qu'elle n'est pas
  validée, modifier une ancienne ligne fautive est refusé.
- **Masquage automatique** : 3 signaleurs distincts, non bannis, de plus de 7 jours ET ayant publié (annonce, réponse ou message). `moderation_log` (acteur `auto`,
  action `warn`) : au 2e signaleur qualifié, au 3e signaleur quand moins de 3 sont qualifiés, et juste avant le masquage (puis `auto_hide`). Profil et message : avertissement
  seulement. Reste possible : 3 comptes patients de 7 jours ayant écrit un message chacun.
- **Preuve** : `reports.snapshot` (500 car. au plus, posé par déclencheur à l'insertion). Le client ne l'écrit ni ne le relit (lecture de `reports` colonne par colonne).
  Conservé 12 mois avec le signalement. `moderation.sql` l'affiche (« extrait »). Ajouter aux données conservées dans CONFIDENTIALITE (contenu de tiers, 12 mois).

## SECURITE.md, constats à marquer corrigés / ouverts
Corrigés : O4 (purge des fichiers : fonction + cron, à activer), O6 (appel sans Origin refusé ; reste falsifiable hors navigateur), S3, S6, S7, S8, S9, snapshots
sans comptes anonymes. `/api/identify` : Origin cohérent OU `Sec-Fetch-Site` same-origin/same-site obligatoire (403 sinon) ; le plafond global (150 / 10 min) ne se consomme
qu'après validation de la photo. Ouvert : compteur quotidien partagé (Vercel KV, hors périmètre), règle de pare-feu Vercel sur `/api/identify`.
Non testé : vrai Supabase (pg_cron, pg_net, Vault, Storage DELETE, PostgREST), Edge Function sous Deno.
