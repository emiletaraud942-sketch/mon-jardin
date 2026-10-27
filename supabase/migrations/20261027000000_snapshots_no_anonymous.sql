-- Sauvegarde en ligne : refus des connexions anonymes Supabase (audit du 27 octobre 2026). Idempotente.
-- Si l'option « Anonymous sign-ins » était activée par erreur, un compte sans e-mail aurait le rôle `authenticated`
-- et pourrait stocker jusqu'à 5 Mo de données sans identité. Une politique RESTRICTIVE s'ajoute aux politiques existantes
-- (elles restent permissives) : une requête doit passer les deux.
drop policy if exists "pas de compte anonyme" on public.garden_snapshots;
create policy "pas de compte anonyme" on public.garden_snapshots
  as restrictive for all to authenticated
  using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);
