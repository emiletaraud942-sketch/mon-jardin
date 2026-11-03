-- Planification quotidienne de la purge de l'entraide (pg_cron + pg_net). A COLLER DANS LE SQL EDITOR PAR LE PROPRIETAIRE,
-- une fois la migration 20261027000000_neighbors_v7_hardening.sql appliquée et la fonction Edge `purge-neighbors-photos` déployée
-- (voir docs/ENTRAIDE.md). TOUT EST EN COMMENTAIRE : rien ne s'active tant que vous ne retirez pas les « -- » vous-même.
-- Ce fichier ne contient AUCUN secret : la valeur du secret partagé est saisie à la main (étape 3), jamais écrite ici.
--
-- Pourquoi : sans cela, « annonces supprimées après 60 jours, photos comprises » est faux (SECURITE.md, O4). La purge SQL
-- supprime les lignes ; les FICHIERS de Storage ne partent que par l'API Storage, d'où la fonction Edge (clé service_role
-- dans son environnement, jamais dans la base ni dans le navigateur).

-- 1. Extensions (Dashboard > Database > Extensions, ou :)
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- create extension if not exists supabase_vault;

-- 2. Secret partagé : le même texte (32 caractères au moins) que PURGE_SECRET dans les secrets de la fonction Edge
--    (npx supabase secrets set --project-ref <REF> PURGE_SECRET="<texte>"). Rangé dans le Vault, pas dans la commande planifiée.
-- select vault.create_secret('<REMPLACER PAR LE SECRET>', 'purge_secret');   -- à exécuter UNE fois, puis effacer la ligne de l'éditeur

-- 3. Tâche A (SQL seul, 22 h UTC) : supprime annonces expirées, événements finis, vieux compteurs, signalements et journal de plus de 12 mois.
-- select cron.schedule('neighbors-purge-quotidienne', '0 22 * * *', $$ select public.neighbors_purge_expired(); $$);

-- 4. Tâche B (22 h 30 UTC) : appelle la fonction Edge, qui purge puis efface dans le bucket les fichiers que plus aucune annonce
--    ne référence (neighbors_orphan_photos). Remplacer <REF> par la référence du projet DEDIE à l'entraide.
-- select cron.schedule('neighbors-photos-quotidienne', '30 22 * * *', $$
--   select net.http_post(
--     url := 'https://<REF>.supabase.co/functions/v1/purge-neighbors-photos',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                                   'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_secret')),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 30000
--   );
-- $$);

-- 5. Vérifier (le lendemain) :
-- select jobname, schedule, active from cron.job;
-- select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- select status_code, content from net._http_response order by created desc limit 5;   -- réponse de la fonction : compteurs seulement

-- 6. Arrêter :
-- select cron.unschedule('neighbors-photos-quotidienne');
-- select cron.unschedule('neighbors-purge-quotidienne');
