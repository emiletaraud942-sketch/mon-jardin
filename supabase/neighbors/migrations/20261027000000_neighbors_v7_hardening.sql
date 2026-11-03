-- Entraide entre voisins, version 7 : durcissement issu de l'audit sécurité du 27 octobre 2026 (constats S3, S6, S7, S8, S9, S4).
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql, _v2, _v3_read, _v4_events, _v5_push et _v6_cell_size.
-- Idempotente : peut être rejouée. Aucune donnée n'est supprimée ni modifiée (les « drop … if exists » ne servent qu'à rejouer le fichier).
-- Ce fichier ne contient AUCUN secret.
-- Ordre : si vous rejouez un ancien fichier (v1, v4), rejouez ensuite celui-ci : ils remettent d'anciennes versions de fonctions.
--
--   S3  changement de quartier : 1 fois par 30 jours (après une première correction libre), contre l'aspiration du pays
--   S6  neighbors_is_blocked / neighbors_can_contact ne sont plus appelables par l'API (schéma non exposé)
--   S7  contrôles et marques de direction interdits dans tous les textes libres, au niveau SQL
--   S8  masquage automatique : signaleurs de plus de 7 jours ET déjà actifs ; avertissement dans moderation_log AVANT masquage
--   S9  extrait (500 car.) du contenu signalé gardé dans reports.snapshot : la suppression par l'auteur ne détruit pas la preuve
--   S4  droits de la purge pour la fonction Edge purge-neighbors-photos (clé service_role)

-- ============================================================
-- 1. S6 : schéma privé pour les aides de politiques qui sondent l'existence d'autrui
-- ============================================================
-- Retirer EXECUTE aux connectés casserait toutes les politiques (une politique s'exécute avec les droits de l'appelant :
-- « permission denied for function neighbors_is_blocked », constaté). On déplace donc les deux fonctions dans un schéma que
-- PostgREST n'expose pas : elles restent appelables par les politiques, mais plus par l'API (/rest/v1/rpc/…).
-- NE JAMAIS ajouter ce schéma à « Exposed schemas » (Settings > API).
create schema if not exists neighbors_private;
revoke all on schema neighbors_private from public, anon;
grant usage on schema neighbors_private to authenticated;

create or replace function neighbors_private.neighbors_is_blocked(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker = (select auth.uid()) and b.blocked = other)
       or (b.blocker = other and b.blocked = (select auth.uid()))
  );
$$;
revoke all on function neighbors_private.neighbors_is_blocked(uuid) from public, anon;
grant execute on function neighbors_private.neighbors_is_blocked(uuid) to authenticated;

create or replace function neighbors_private.neighbors_can_contact(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.neighbors_is_member())
    and other is distinct from (select auth.uid())
    and not neighbors_private.neighbors_is_blocked(other)
    and exists (select 1 from public.profiles o where o.user_id = other and o.banned_at is null)
    and (
      exists (
        select 1 from public.posts p
        where p.author = other and p.status = 'open' and p.expires_at > now() and public.neighbors_can_see_cell(p.cell_lat, p.cell_lon)
      )
      or exists (
        select 1 from public.replies r join public.posts p on p.id = r.post_id
        where r.author = other and r.status = 'open' and p.status = 'open' and p.expires_at > now()
          and public.neighbors_can_see_cell(p.cell_lat, p.cell_lon)
      )
    );
$$;
revoke all on function neighbors_private.neighbors_can_contact(uuid) from public, anon;
grant execute on function neighbors_private.neighbors_can_contact(uuid) to authenticated;

-- Politiques qui utilisaient les deux fonctions publiques : mêmes règles qu'avant, seul le nom de la fonction change.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = (select auth.uid())
  or (
    (select public.neighbors_is_member())
    and not neighbors_private.neighbors_is_blocked(user_id)
    and (
      exists (select 1 from public.posts p where p.author = profiles.user_id)
      or exists (select 1 from public.replies r where r.author = profiles.user_id)
      or exists (select 1 from public.threads t where t.user_a = profiles.user_id or t.user_b = profiles.user_id)
    )
  )
);

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated using (
  author = (select auth.uid())
  or (
    status = 'open' and expires_at > now()
    and public.neighbors_can_see_cell(cell_lat, cell_lon)   -- membre non banni, dans ~55 km
    and not neighbors_private.neighbors_is_blocked(author)
  )
);

drop policy if exists replies_select on public.replies;
create policy replies_select on public.replies for select to authenticated using (
  exists (select 1 from public.posts p where p.id = replies.post_id)
  and (
    author = (select auth.uid())
    or (status = 'open' and not neighbors_private.neighbors_is_blocked(author))
  )
);

drop policy if exists threads_select on public.threads;
create policy threads_select on public.threads for select to authenticated using (
  (select auth.uid()) in (user_a, user_b)
  and not neighbors_private.neighbors_is_blocked(case when user_a = (select auth.uid()) then user_b else user_a end)
);

drop policy if exists threads_insert on public.threads;
create policy threads_insert on public.threads for insert to authenticated with check (
  (select auth.uid()) in (user_a, user_b)
  and (select public.neighbors_is_member())
  and not neighbors_private.neighbors_is_blocked(case when user_a = (select auth.uid()) then user_b else user_a end)
  and (select neighbors_private.neighbors_can_contact(case when threads.user_a = (select auth.uid()) then threads.user_b else threads.user_a end))
  and (post_id is null or exists (
    select 1 from public.posts p
    where p.id = threads.post_id and p.author in (threads.user_a, threads.user_b)
  ))
);

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (
  organizer = (select auth.uid())
  or (
    status in ('open', 'cancelled') and ends_at > now() - interval '7 days'
    and public.neighbors_can_see_cell(cell_lat, cell_lon)
    and not neighbors_private.neighbors_is_blocked(organizer)
  )
);

-- Les anciennes fonctions publiques disparaissent (plus aucune politique ni fonction ne les utilise). Sans « cascade » :
-- si une dépendance avait été oubliée, la commande échoue au lieu de supprimer une politique en silence.
drop function if exists public.neighbors_can_contact(uuid);
drop function if exists public.neighbors_is_blocked(uuid);

-- ============================================================
-- 2. S3 : changer de quartier au plus une fois tous les 30 jours
-- ============================================================
-- Avant : 5 changements par jour. Un seul compte pouvait « marcher » à travers la France (une fenêtre de 55 km à chaque pas,
-- via neighbors_can_see_cell) et lire pseudos et quartiers de tout le pays.
-- Règle : la PREMIÈRE correction de quartier après l'inscription est libre (faute de frappe) ; ensuite, un changement de cellule
-- (position OU taille, une fois arrondie sur la grille) n'est permis que 30 jours après le précédent. Le pseudo n'est pas concerné.
-- cell_moved_at : posée par le déclencheur seulement (aucun droit client, ni en lecture ni en écriture). L'éditeur (SQL Editor,
-- auth.uid() vide) n'est pas limité.
alter table public.profiles add column if not exists cell_moved_at timestamptz;
comment on column public.profiles.cell_moved_at is 'Date du dernier changement de quartier fait par la personne (limite : 1 par 30 jours). Aucun droit client.';

create or replace function public.neighbors_profile_before_update()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  moved boolean;
begin
  moved := public.neighbors_cell_snap(new.cell_lat, new.cell_size, 'lat') is distinct from old.cell_lat
        or public.neighbors_cell_snap(new.cell_lon, new.cell_size, 'lon') is distinct from old.cell_lon;
  if (select auth.uid()) is not null then
    -- Un client ne choisit jamais cette date.
    new.cell_moved_at := old.cell_moved_at;
    if moved then
      perform public.neighbors_assert_self(new.user_id);
      if old.cell_moved_at is not null and old.cell_moved_at > now() - interval '30 days' then
        raise exception 'cell_change_too_soon' using errcode = 'P0001';
      end if;
      new.cell_moved_at := now();
    end if;
  end if;
  if new.pseudo is distinct from old.pseudo or new.cell_size is distinct from old.cell_size or moved then
    perform public.neighbors_assert_self(new.user_id);
    perform public.neighbors_take_quota(new.user_id, 'profile', 5);
  end if;
  return new;
end;
$$;
revoke all on function public.neighbors_profile_before_update() from public, anon, authenticated;
drop trigger if exists neighbors_profile_before_update on public.profiles;
create trigger neighbors_profile_before_update before update on public.profiles
  for each row execute function public.neighbors_profile_before_update();
-- (cell_moved_at n'est ajoutée à aucun « grant » : les droits colonne par colonne de la v6 restent seuls en vigueur.)

-- ============================================================
-- 3. S7 : textes libres sans caractères de contrôle ni marques de direction
-- ============================================================
-- Interdits : U+0001–U+0009 et U+000B–U+001F (tout contrôle sauf le retour à la ligne \n), U+007F–U+009F (DEL et contrôles C1),
-- U+061C, U+200E, U+200F (marques de direction), U+202A–U+202E (inversion de sens), U+2066–U+2069 (isolats). Même liste que
-- TEXT_STRIP côté client (src/lib/neighbors/api.ts, qui les retire avant l'envoi) : la base refuse ce que le client ne retire pas.
-- U+200D (liant des emojis) reste permis. Le pseudo a déjà sa propre contrainte (profiles_pseudo_check).
-- « not valid » : contrôle toute nouvelle écriture sans échouer si une ancienne ligne était étrange ; la validation des lignes
-- existantes est tentée plus bas, sans jamais faire échouer la migration.
alter table public.posts drop constraint if exists posts_title_text_check;
alter table public.posts add constraint posts_title_text_check
  check (title !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.posts drop constraint if exists posts_body_text_check;
alter table public.posts add constraint posts_body_text_check
  check (body !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.replies drop constraint if exists replies_body_text_check;
alter table public.replies add constraint replies_body_text_check
  check (body !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.messages drop constraint if exists messages_body_text_check;
alter table public.messages add constraint messages_body_text_check
  check (body !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.events drop constraint if exists events_title_text_check;
alter table public.events add constraint events_title_text_check
  check (title !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.events drop constraint if exists events_description_text_check;
alter table public.events add constraint events_description_text_check
  check (description !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.events drop constraint if exists events_place_text_check;
alter table public.events add constraint events_place_text_check
  check (place !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.organizers drop constraint if exists organizers_description_text_check;
alter table public.organizers add constraint organizers_description_text_check
  check (description !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;
alter table public.reports drop constraint if exists reports_details_text_check;
alter table public.reports add constraint reports_details_text_check
  check (details !~ '[\u0001-\u0009\u000b-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]') not valid;

-- Validation des lignes existantes. Si l'une d'elles contient un caractère interdit, la contrainte reste « not valid »
-- (elle contrôle quand même les nouvelles écritures) et un message l'indique : rien n'est modifié ni supprimé.
-- À nettoyer à la main puis : alter table public.<table> validate constraint <nom>;
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('posts', 'posts_title_text_check'), ('posts', 'posts_body_text_check'), ('replies', 'replies_body_text_check'),
      ('messages', 'messages_body_text_check'), ('events', 'events_title_text_check'), ('events', 'events_description_text_check'),
      ('events', 'events_place_text_check'), ('organizers', 'organizers_description_text_check'), ('reports', 'reports_details_text_check')
    ) as v(tbl, cname)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.cname);
    exception when check_violation then
      raise notice 'S7 : d''anciennes lignes de public.% violent % ; contrainte laissée NOT VALID (les nouvelles écritures sont contrôlées). A nettoyer puis valider à la main.', c.tbl, c.cname;
    end;
  end loop;
end $$;

-- ============================================================
-- 4. S9 : extrait du contenu signalé, gardé avec le signalement
-- ============================================================
-- Sans cela, l'auteur d'une annonce signalée la supprime (ou supprime son compte) et la preuve disparaît. L'extrait est pris par le
-- déclencheur au moment du signalement (le client ne peut pas l'envoyer : aucun droit d'insertion) et lisible par l'éditeur
-- seulement (le signaleur ne le relit pas : droit de lecture colonne par colonne). Conservé comme le signalement : 12 mois.
alter table public.reports add column if not exists snapshot text;
alter table public.reports drop constraint if exists reports_snapshot_check;
alter table public.reports add constraint reports_snapshot_check check (snapshot is null or char_length(snapshot) <= 500);
comment on column public.reports.snapshot is 'Extrait (500 car. au plus) du contenu signalé au moment du signalement. Lecture : éditeur seulement. Purgé avec le signalement (12 mois).';

revoke select on public.reports from authenticated;
grant select (id, reporter, target_kind, target_id, reason, details, created_at) on public.reports to authenticated;

create or replace function public.neighbors_report_before_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  target_owner uuid;
  snip text;
begin
  perform public.neighbors_assert_self(new.reporter);
  if new.target_kind = 'post' then
    select author, concat_ws(E'\n', title, nullif(body, '')) into target_owner, snip from public.posts where id = new.target_id;
  elsif new.target_kind = 'reply' then
    select author, body into target_owner, snip from public.replies where id = new.target_id;
  elsif new.target_kind = 'event' then
    select organizer, concat_ws(E'\n', title, nullif(description, '')) into target_owner, snip from public.events where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select user_id, pseudo into target_owner, snip from public.profiles where user_id = new.target_id;
  else
    -- Message : le signaleur doit être l'un des deux participants, et pas l'expéditeur.
    select m.sender, m.body into target_owner, snip
    from public.messages m join public.threads t on t.id = m.thread_id
    where m.id = new.target_id and new.reporter in (t.user_a, t.user_b);
  end if;
  if target_owner is null then
    -- Annonce, réponse, événement, profil : même réponse que la politique RLS pour un contenu invisible (pas de sondage d'identifiants).
    if new.target_kind in ('post', 'reply', 'event', 'profile') then
      raise exception 'new row violates row-level security policy for table "reports"' using errcode = '42501';
    end if;
    raise exception 'report_target_not_found' using errcode = 'P0001';
  end if;
  if target_owner = new.reporter then
    raise exception 'report_self' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.snapshot := left(snip, 500);   -- toujours posé par le serveur
  perform public.neighbors_take_quota(new.reporter, 'report', 20);
  return new;
end;
$$;
revoke all on function public.neighbors_report_before_insert() from public, anon, authenticated;
drop trigger if exists neighbors_report_before_insert on public.reports;
create trigger neighbors_report_before_insert before insert on public.reports
  for each row execute function public.neighbors_report_before_insert();

-- ============================================================
-- 5. S8 : masquage automatique plus difficile à fabriquer, et éditeur prévenu AVANT
-- ============================================================
-- Avant : 3 comptes de plus de 24 h suffisaient (3 faux comptes créés la veille masquaient n'importe quelle annonce).
-- Maintenant, un signalement ne compte que s'il vient d'un compte NON banni, de plus de 7 jours, qui a déjà publié quelque
-- chose (annonce, réponse ou message). Journal (moderation_log, action « warn », acteur « auto ») :
--   - au 2e signalement qualifié : « le prochain masquera » ;
--   - au 3e signalement de comptes distincts quand moins de 3 sont qualifiés : « signalements de comptes récents ou inactifs, à examiner » ;
--   - juste avant un masquage : « seuil atteint », puis la ligne « auto_hide » habituelle.
-- Reste possible : 3 comptes patients (7 jours) qui ont chacun écrit un message. Surveiller moderation_log (docs/ENTRAIDE.md).
create or replace function public.neighbors_report_after_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;          -- signaleurs qualifiés
  n_all integer;      -- signaleurs distincts, qualifiés ou non
  hidden_rows integer := 0;
  can_hide boolean;
  new_ok boolean;
begin
  select count(distinct r.reporter) filter (where
           p.banned_at is null and p.created_at < now() - interval '7 days'
           and (exists (select 1 from public.posts x where x.author = r.reporter)
             or exists (select 1 from public.replies y where y.author = r.reporter)
             or exists (select 1 from public.messages m where m.sender = r.reporter))),
         count(distinct r.reporter)
    into n, n_all
  from public.reports r join public.profiles p on p.user_id = r.reporter
  where r.target_kind = new.target_kind and r.target_id = new.target_id;

  can_hide := case new.target_kind
    when 'post'  then exists (select 1 from public.posts   where id = new.target_id and status <> 'hidden')
    when 'reply' then exists (select 1 from public.replies where id = new.target_id and status <> 'hidden')
    when 'event' then exists (select 1 from public.events  where id = new.target_id and status <> 'hidden')
    else false
  end;

  if n >= 3 then
    if can_hide then
      -- L'éditeur est prévenu AVANT le masquage.
      insert into public.moderation_log (actor, action, target_kind, target_id, reason)
      values ('auto', 'warn', new.target_kind, new.target_id, 'seuil atteint : ' || n || ' signalements de comptes qualifiés (plus de 7 jours, déjà actifs) ; masquage automatique');
      if new.target_kind = 'post' then
        update public.posts set status = 'hidden' where id = new.target_id and status <> 'hidden';
        get diagnostics hidden_rows = row_count;
      elsif new.target_kind = 'reply' then
        update public.replies set status = 'hidden' where id = new.target_id and status <> 'hidden';
        get diagnostics hidden_rows = row_count;
      elsif new.target_kind = 'event' then
        update public.events set status = 'hidden' where id = new.target_id and status <> 'hidden';
        get diagnostics hidden_rows = row_count;
      end if;
      if hidden_rows > 0 then
        insert into public.moderation_log (actor, action, target_kind, target_id, reason)
        values ('auto', 'auto_hide', new.target_kind, new.target_id, n || ' signalements de membres distincts');
      end if;
    end if;
  else
    select exists (
      select 1 from public.profiles p
      where p.user_id = new.reporter and p.banned_at is null and p.created_at < now() - interval '7 days'
        and (exists (select 1 from public.posts x where x.author = new.reporter)
          or exists (select 1 from public.replies y where y.author = new.reporter)
          or exists (select 1 from public.messages m where m.sender = new.reporter))
    ) into new_ok;
    if new_ok and n = 2 then
      insert into public.moderation_log (actor, action, target_kind, target_id, reason)
      values ('auto', 'warn', new.target_kind, new.target_id, '2 signalements de comptes qualifiés : le prochain masquera automatiquement');
    elsif n_all = 3 then
      insert into public.moderation_log (actor, action, target_kind, target_id, reason)
      values ('auto', 'warn', new.target_kind, new.target_id, '3 signalements dont seulement ' || n || ' de comptes qualifiés (plus de 7 jours, déjà actifs) : pas de masquage automatique, à examiner');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.neighbors_report_after_insert() from public, anon, authenticated;
drop trigger if exists neighbors_report_after_insert on public.reports;
create trigger neighbors_report_after_insert after insert on public.reports
  for each row execute function public.neighbors_report_after_insert();

-- ============================================================
-- 6. S4 : droits de la purge pour la fonction Edge purge-neighbors-photos
-- ============================================================
-- La fonction (supabase/functions/purge-neighbors-photos) appelle ces deux fonctions avec la clé « service_role » (qui n'existe
-- que dans l'environnement de la fonction), puis efface les fichiers par l'API Storage. Aucun droit pour anon ni les connectés.
revoke all on function public.neighbors_purge_expired() from public, anon, authenticated;
revoke all on function public.neighbors_orphan_photos() from public, anon, authenticated;
grant execute on function public.neighbors_purge_expired() to service_role;
grant execute on function public.neighbors_orphan_photos() to service_role;
