-- Entraide entre voisins, version 3 : « messages non lus ». Une date de dernière lecture par conversation ET par participant.
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql et 20261025000000_neighbors_v2.sql.
-- Idempotente : peut être rejouée. Ne change aucune autre table, politique ou quota. Aucun quota : une seule ligne par
-- (conversation, personne), mise à jour sur place, donc la table ne peut pas grossir plus vite que le nombre de conversations.

-- 1. Table. Supprimée avec la conversation ou avec le compte (cascade).
create table if not exists public.thread_reads (
  thread_id    uuid not null references public.threads (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
comment on table public.thread_reads is 'Dernière lecture d''une conversation, par participant. Chacun ne voit et n''écrit que sa propre ligne.';

-- 2. La date est toujours celle du serveur : un client ne peut ni la reculer (pour refaire apparaître des messages)
--    ni l'avancer (pour masquer des messages futurs).
create or replace function public.neighbors_thread_read_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_read_at := now();
  return new;
end;
$$;
revoke all on function public.neighbors_thread_read_touch() from public, anon, authenticated;
drop trigger if exists thread_reads_touch on public.thread_reads;
create trigger thread_reads_touch before insert or update on public.thread_reads
  for each row execute function public.neighbors_thread_read_touch();

-- 3. Droits : colonne par colonne, ni suppression ni lecture des lignes des autres.
--    (Supabase accorde tout par défaut aux nouvelles tables : on retire d'abord.)
revoke all on public.thread_reads from public, anon, authenticated;
grant select on public.thread_reads to authenticated;
grant insert (thread_id, user_id, last_read_at) on public.thread_reads to authenticated;
grant update (last_read_at) on public.thread_reads to authenticated;

-- 4. RLS : on ne lit et n'écrit que sa propre ligne, dans une conversation dont on est participant, sans être banni.
alter table public.thread_reads enable row level security;
drop policy if exists thread_reads_select on public.thread_reads;
create policy thread_reads_select on public.thread_reads for select to authenticated using (
  user_id = (select auth.uid())
);
drop policy if exists thread_reads_insert on public.thread_reads;
create policy thread_reads_insert on public.thread_reads for insert to authenticated with check (
  user_id = (select auth.uid())
  and (select public.neighbors_is_member())
  and exists (select 1 from public.threads t where t.id = thread_reads.thread_id and (select auth.uid()) in (t.user_a, t.user_b))
);
drop policy if exists thread_reads_update on public.thread_reads;
create policy thread_reads_update on public.thread_reads for update to authenticated
  using (user_id = (select auth.uid()) and (select public.neighbors_is_member()))
  with check (user_id = (select auth.uid()) and (select public.neighbors_is_member()));

-- 5. Conversations déjà existantes : considérées comme lues à l'application de ce fichier (sinon tout l'historique
--    apparaîtrait comme « non lu »). Seulement si la table est encore vide, donc pas au rejeu.
insert into public.thread_reads (thread_id, user_id)
select t.id, v.u from public.threads t cross join lateral (values (t.user_a), (t.user_b)) v(u)
where not exists (select 1 from public.thread_reads);
