-- Durcissement n° 3 de public.garden_snapshots (complète 20261017…, 20261018… et 20261019…, qu'on ne modifie pas).
-- Idempotente : peut être rejouée sans erreur. Preuve : supabase/neighbors/tests/scenarios_snapshots.sql.
--
-- Constat (audit du 27 octobre 2026) : une connexion anonyme de Supabase (« Anonymous sign-ins ») reçoit le rôle
-- `authenticated`, donc les politiques « to authenticated » l'acceptaient : n'importe qui pouvait ouvrir des comptes
-- sans e-mail et écrire 5 Mo chacun. Les politiques de lecture, création et mise à jour exigent maintenant un jeton
-- qui n'est PAS anonyme (claim `is_anonymous` absent ou égal à 'false').
-- La suppression de SA ligne reste permise à tout connecté (droit à l'effacement).
-- A faire aussi dans le tableau de bord : Authentication > Providers > désactiver « Allow anonymous sign-ins ».

drop policy if exists "lecture de son instantané" on public.garden_snapshots;
drop policy if exists "création de son instantané" on public.garden_snapshots;
drop policy if exists "mise à jour de son instantané" on public.garden_snapshots;
drop policy if exists "suppression de son instantané" on public.garden_snapshots;

create policy "lecture de son instantané" on public.garden_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy "création de son instantané" on public.garden_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy "mise à jour de son instantané" on public.garden_snapshots
  for update to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false')
  with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');
create policy "suppression de son instantané" on public.garden_snapshots
  for delete to authenticated using ((select auth.uid()) = user_id);
