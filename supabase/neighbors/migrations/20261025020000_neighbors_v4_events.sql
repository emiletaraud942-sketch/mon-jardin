-- Entraide entre voisins, version 4 : événements près de chez soi (organisateurs validés, intérêt, signalement).
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql, _v2 et _v3_read. Idempotente : peut être rejouée.
-- Aucune adresse exacte (le lieu est un texte libre de 120 caractères, à choisir public), aucun e-mail.
-- Décision par défaut : seuls les ORGANISATEURS VALIDÉS PAR L'ÉDITEUR publient. Les membres lisent, s'« intéressent » et signalent.
-- Les « drop … if exists » ne servent qu'à rejouer le fichier : aucune donnée n'est supprimée.
-- Ordre : si vous rejouez un ancien fichier (v1), rejouez ensuite celui-ci : v1 remet l'ancienne version de quelques fonctions.

-- ============================================================
-- 1. Tables
-- ============================================================

-- Organisateur : une personne (ou une association) qui demande à publier des événements. La demande est une insertion
-- AVEC verified_at vide ; seul l'éditeur (SQL Editor, rôle postgres) pose verified_at. Aucun droit client d'écriture dessus.
create table if not exists public.organizers (
  user_id     uuid primary key references public.profiles (user_id) on delete cascade,
  name        text not null,
  description text not null default '',
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.organizers drop constraint if exists organizers_name_check;
alter table public.organizers add constraint organizers_name_check check (
  char_length(name) between 3 and 60 and name = btrim(name)
  and name !~ '[[:cntrl:]<>]'
  and name !~ '[­͏؜ᅟᅠ឴឵᠎​-‏ -‮⁠-⁯ㅤ﻿ﾠ]'
  and name ~ '[[:alnum:]]'
);
alter table public.organizers drop constraint if exists organizers_description_check;
alter table public.organizers add constraint organizers_description_check check (char_length(description) <= 500);
-- Deux organisateurs ne portent pas le même nom (une demande en attente ne peut pas se faire passer pour un organisateur validé).
create unique index if not exists organizers_name_key on public.organizers (lower(name));

-- Événements.
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  organizer      uuid not null default auth.uid() references public.organizers (user_id) on delete cascade,
  title          text not null check (char_length(btrim(title)) between 1 and 80),
  description    text not null default '' check (char_length(description) <= 2000),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  place          text not null check (char_length(btrim(place)) between 1 and 120),
  cell_lat       numeric(6, 2) not null,       -- recopié du profil par déclencheur
  cell_lon       numeric(7, 2) not null,
  -- Lien d'inscription externe : https seulement, nom de domaine (pas d'adresse IP, pas d'identifiants dans l'adresse), 300 caractères,
  -- caractères ASCII seulement (un lien copié du navigateur l'est : accents codés %xx ; exclut aussi invisibles et inversions de sens).
  -- Comparaison SANS « ~* » : avec la casse ignorée, la plage \u0080-\uffff retire aussi i, s, k (ı, ſ, K se replient sur eux).
  signup_url     text,
  capacity       integer,
  status         text not null default 'open' check (status in ('open', 'cancelled', 'hidden')),
  interest_count integer not null default 0 check (interest_count >= 0),   -- tenu par déclencheur
  created_at     timestamptz not null default now(),
  constraint events_dates_check check (ends_at >= starts_at)
);
alter table public.events drop constraint if exists events_signup_url_check;
alter table public.events add constraint events_signup_url_check check (
  signup_url is null or (
    char_length(signup_url) <= 300
    and signup_url ~ '^[Hh][Tt][Tt][Pp][Ss]://([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z][a-zA-Z0-9-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]<>"''\\`{}|^\u0080-\uffff]*)?$'
  )
);
alter table public.events drop constraint if exists events_capacity_check;
alter table public.events add constraint events_capacity_check check (capacity is null or capacity between 1 and 10000);

-- Intérêt : « Je suis intéressé(e) ». Une ligne par membre et par événement.
create table if not exists public.event_interest (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Signalements et journal : la cible peut être un événement.
alter table public.reports drop constraint if exists reports_target_kind_check;
alter table public.reports add constraint reports_target_kind_check
  check (target_kind in ('post', 'reply', 'profile', 'message', 'event'));
alter table public.moderation_log drop constraint if exists moderation_log_target_kind_check;
alter table public.moderation_log add constraint moderation_log_target_kind_check
  check (target_kind is null or target_kind in ('post', 'reply', 'profile', 'message', 'event'));

-- ============================================================
-- 2. Index
-- ============================================================
create index if not exists events_feed_idx      on public.events (cell_lat, cell_lon, starts_at) where status <> 'hidden';
create index if not exists events_organizer_idx on public.events (organizer);
create index if not exists events_ends_idx      on public.events (ends_at);
create index if not exists event_interest_user_idx on public.event_interest (user_id);

-- ============================================================
-- 3. Fonction d'aide
-- ============================================================

-- Organisateur validé = demande validée par l'éditeur, et compte non banni.
create or replace function public.neighbors_is_organizer()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organizers o join public.profiles p on p.user_id = o.user_id
    where o.user_id = (select auth.uid()) and o.verified_at is not null and p.banned_at is null
  );
$$;

-- ============================================================
-- 4. Déclencheurs
-- ============================================================

-- Organisateur : la demande part toujours « non validée » ; un client ne change jamais verified_at ni user_id ;
-- changer de nom est limité (5 demandes ou changements par jour). L'éditeur (auth.uid() vide) fait ce qu'il veut.
create or replace function public.neighbors_organizer_before_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.neighbors_assert_self(new.user_id);
    if (select auth.uid()) is not null then
      new.verified_at := null;
      if not (select public.neighbors_is_member()) then
        raise exception 'not_member' using errcode = 'P0001';
      end if;
    end if;
    new.created_at := now();
    perform public.neighbors_take_quota(new.user_id, 'organizer', 5);
  else
    if (select auth.uid()) is not null then
      new.verified_at := old.verified_at;
      new.user_id := old.user_id;
      new.created_at := old.created_at;
      if new.name is distinct from old.name or new.description is distinct from old.description then
        perform public.neighbors_assert_self(old.user_id);
        perform public.neighbors_take_quota(old.user_id, 'organizer', 5);
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists neighbors_organizer_before_write on public.organizers;
create trigger neighbors_organizer_before_write before insert or update on public.organizers
  for each row execute function public.neighbors_organizer_before_write();

-- Validation ou retrait par l'éditeur : journal automatique ; un retrait masque les événements de la personne.
create or replace function public.neighbors_organizer_after_verify()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.verified_at is not null and old.verified_at is null then
    insert into public.moderation_log (actor, action, target_kind, target_id, reason)
    values ('editeur', 'other', 'profile', new.user_id, 'organisateur validé');
  elsif new.verified_at is null and old.verified_at is not null then
    update public.events set status = 'hidden' where organizer = new.user_id and status <> 'hidden';
    insert into public.moderation_log (actor, action, target_kind, target_id, reason)
    values ('editeur', 'other', 'profile', new.user_id, 'organisateur retiré : événements masqués');
  end if;
  return new;
end;
$$;
drop trigger if exists neighbors_organizer_after_verify on public.organizers;
create trigger neighbors_organizer_after_verify after update of verified_at on public.organizers
  for each row execute function public.neighbors_organizer_after_verify();

-- Événement : organisateur validé et non banni ; cellule recopiée du profil ; dates plausibles ; quotas.
create or replace function public.neighbors_event_before_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  p record;
  v timestamptz;
begin
  perform public.neighbors_assert_self(new.organizer);
  select pr.cell_lat, pr.cell_lon, pr.banned_at into p from public.profiles pr where pr.user_id = new.organizer;
  if not found or p.banned_at is not null then
    raise exception 'not_member' using errcode = 'P0001';
  end if;
  select o.verified_at into v from public.organizers o where o.user_id = new.organizer;
  if v is null then
    raise exception 'not_organizer' using errcode = 'P0001';
  end if;
  if new.starts_at < now() - interval '1 hour' then
    raise exception 'event_past' using errcode = 'P0001';
  end if;
  if new.ends_at > now() + interval '1 year' then
    raise exception 'event_far' using errcode = 'P0001';
  end if;
  new.cell_lat := p.cell_lat;
  new.cell_lon := p.cell_lon;
  new.status := 'open';
  new.interest_count := 0;
  new.created_at := now();
  -- Plafond d'événements ouverts en même temps (volume de données).
  if (select count(*) from public.events e where e.organizer = new.organizer and e.status = 'open' and e.ends_at > now()) >= 20 then
    raise exception 'quota_exceeded:event_open' using errcode = 'P0001';
  end if;
  perform public.neighbors_take_quota(new.organizer, 'event', 3);
  return new;
end;
$$;
drop trigger if exists neighbors_event_before_insert on public.events;
create trigger neighbors_event_before_insert before insert on public.events
  for each row execute function public.neighbors_event_before_insert();

-- Intérêt : en son nom seulement ; 50 par jour (jamais rendus).
create or replace function public.neighbors_interest_before_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.neighbors_assert_self(new.user_id);
  new.created_at := now();
  perform public.neighbors_take_quota(new.user_id, 'interest', 50);
  return new;
end;
$$;
drop trigger if exists neighbors_interest_before_insert on public.event_interest;
create trigger neighbors_interest_before_insert before insert on public.event_interest
  for each row execute function public.neighbors_interest_before_insert();

-- Compteur d'intéressés : tenu ici, lisible avec l'événement, sans montrer QUI est intéressé.
create or replace function public.neighbors_interest_count()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.events set interest_count = interest_count + 1 where id = new.event_id;
  else
    update public.events set interest_count = greatest(interest_count - 1, 0) where id = old.event_id;
  end if;
  return null;
end;
$$;
drop trigger if exists neighbors_interest_count on public.event_interest;
create trigger neighbors_interest_count after insert or delete on public.event_interest
  for each row execute function public.neighbors_interest_count();

-- Signalement : même fonction qu'en version 1, avec la cible « event » (auteur = organisateur).
create or replace function public.neighbors_report_before_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  target_owner uuid;
begin
  perform public.neighbors_assert_self(new.reporter);
  if new.target_kind = 'post' then
    select author into target_owner from public.posts where id = new.target_id;
  elsif new.target_kind = 'reply' then
    select author into target_owner from public.replies where id = new.target_id;
  elsif new.target_kind = 'event' then
    select organizer into target_owner from public.events where id = new.target_id;
  elsif new.target_kind = 'profile' then
    select user_id into target_owner from public.profiles where user_id = new.target_id;
  else
    -- Message : le signaleur doit être l'un des deux participants, et pas l'expéditeur.
    select m.sender into target_owner
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
  perform public.neighbors_take_quota(new.reporter, 'report', 20);
  return new;
end;
$$;

-- Masquage automatique : 3 signalements de comptes distincts, de plus de 24 h et non bannis (annonce, réponse, événement).
create or replace function public.neighbors_report_after_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
  hidden_rows integer := 0;
begin
  select count(distinct r.reporter) into n
  from public.reports r join public.profiles p on p.user_id = r.reporter
  where r.target_kind = new.target_kind and r.target_id = new.target_id
    and p.banned_at is null and p.created_at < now() - interval '24 hours';
  if n >= 3 then
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
  return new;
end;
$$;

-- Bannissement : annonces, réponses ET événements de la personne sont masqués aussitôt.
create or replace function public.neighbors_profile_after_ban()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.banned_at is not null and old.banned_at is null then
    update public.posts   set status = 'hidden' where author = new.user_id and status <> 'hidden';
    update public.replies set status = 'hidden' where author = new.user_id and status <> 'hidden';
    update public.events  set status = 'hidden' where organizer = new.user_id and status <> 'hidden';
    insert into public.moderation_log (actor, action, target_kind, target_id, reason)
    values ('editeur', 'ban', 'profile', new.user_id, 'bannissement : annonces, réponses et événements masqués');
  elsif new.banned_at is null and old.banned_at is not null then
    insert into public.moderation_log (actor, action, target_kind, target_id, reason)
    values ('editeur', 'unban', 'profile', new.user_id, 'bannissement levé (contenus masqués non rétablis)');
  end if;
  return new;
end;
$$;

-- Les fonctions de déclencheur ne sont pas appelables par l'API.
revoke all on function public.neighbors_organizer_before_write() from public, anon, authenticated;
revoke all on function public.neighbors_organizer_after_verify() from public, anon, authenticated;
revoke all on function public.neighbors_event_before_insert() from public, anon, authenticated;
revoke all on function public.neighbors_interest_before_insert() from public, anon, authenticated;
revoke all on function public.neighbors_interest_count() from public, anon, authenticated;
revoke all on function public.neighbors_report_before_insert() from public, anon, authenticated;
revoke all on function public.neighbors_report_after_insert() from public, anon, authenticated;
revoke all on function public.neighbors_profile_after_ban() from public, anon, authenticated;
-- Aide de politiques : appelée par la RLS, donc exécutable par les connectés.
revoke all on function public.neighbors_is_organizer() from public, anon;
grant execute on function public.neighbors_is_organizer() to authenticated;

-- ============================================================
-- 5. Droits (au plus juste, colonne par colonne)
-- ============================================================
revoke all on public.organizers, public.events, public.event_interest from public, anon, authenticated;

-- organizers : on lit tout sauf rien de secret ; on écrit nom et description seulement. verified_at : lecture seule.
grant select (user_id, name, description, verified_at, created_at) on public.organizers to authenticated;
grant insert (user_id, name, description) on public.organizers to authenticated;
grant update (name, description) on public.organizers to authenticated;
grant delete on public.organizers to authenticated;

-- events : cellule, statut initial, compteur et date : aucun droit d'écriture. Statut : passer open <-> cancelled seulement.
grant select on public.events to authenticated;
grant insert (organizer, title, description, starts_at, ends_at, place, signup_url, capacity) on public.events to authenticated;
grant update (status) on public.events to authenticated;
grant delete on public.events to authenticated;

grant select, delete on public.event_interest to authenticated;
grant insert (event_id, user_id) on public.event_interest to authenticated;

-- ============================================================
-- 6. RLS
-- ============================================================
alter table public.organizers     enable row level security;
alter table public.events         enable row level security;
alter table public.event_interest enable row level security;

-- organizers : le sien, ou celui d'une personne dont on voit déjà un événement (la sous-requête applique la RLS d'events).
drop policy if exists organizers_select on public.organizers;
create policy organizers_select on public.organizers for select to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.events e where e.organizer = organizers.user_id)
);
drop policy if exists organizers_insert on public.organizers;
create policy organizers_insert on public.organizers for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.neighbors_is_member()));
-- Modifier sa demande tant qu'elle n'est pas validée. Après validation : l'éditeur seul (sinon on changerait de nom une fois validé).
drop policy if exists organizers_update on public.organizers;
create policy organizers_update on public.organizers for update to authenticated
  using (user_id = (select auth.uid()) and verified_at is null and (select public.neighbors_is_member()))
  with check (user_id = (select auth.uid()) and verified_at is null);
-- Retirer sa demande ou arrêter d'être organisateur (efface aussi ses événements).
drop policy if exists organizers_delete on public.organizers;
create policy organizers_delete on public.organizers for delete to authenticated
  using (user_id = (select auth.uid()));

-- events : l'organisateur voit les siens ; les membres voient ceux ni masqués ni finis depuis plus de 7 jours, à moins de ~55 km,
-- sans blocage dans un sens ou dans l'autre.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (
  organizer = (select auth.uid())
  or (
    status in ('open', 'cancelled') and ends_at > now() - interval '7 days'
    and public.neighbors_can_see_cell(cell_lat, cell_lon)
    and not public.neighbors_is_blocked(organizer)
  )
);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (organizer = (select auth.uid()) and (select public.neighbors_is_organizer()));
-- L'auteur ne peut ni démasquer un événement masqué, ni le masquer lui-même : open <-> cancelled seulement.
drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (organizer = (select auth.uid()) and (select public.neighbors_is_organizer()) and status in ('open', 'cancelled'))
  with check (organizer = (select auth.uid()) and (select public.neighbors_is_organizer()) and status in ('open', 'cancelled'));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (organizer = (select auth.uid()));

-- event_interest : chacun gère le sien, et ne voit que le sien.
drop policy if exists event_interest_select on public.event_interest;
create policy event_interest_select on public.event_interest for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists event_interest_insert on public.event_interest;
create policy event_interest_insert on public.event_interest for insert to authenticated with check (
  user_id = (select auth.uid())
  and (select public.neighbors_is_member())
  -- Seulement pour un événement que l'on voit (RLS d'events), ouvert et pas fini.
  and exists (select 1 from public.events e where e.id = event_interest.event_id and e.status = 'open' and e.ends_at > now())
);
drop policy if exists event_interest_delete on public.event_interest;
create policy event_interest_delete on public.event_interest for delete to authenticated
  using (user_id = (select auth.uid()));

-- reports : on ne signale que ce que l'on voit, événements compris.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (
    reporter = (select auth.uid()) and (select public.neighbors_is_member())
    and case reports.target_kind
      when 'post'  then exists (select 1 from public.posts p where p.id = reports.target_id)
      when 'reply' then exists (select 1 from public.replies r where r.id = reports.target_id)
      when 'event' then exists (select 1 from public.events e where e.id = reports.target_id)
      when 'profile' then exists (select 1 from public.profiles pr where pr.user_id = reports.target_id)
      else true
    end
  );

-- ============================================================
-- 7. Purge quotidienne : on y ajoute les événements finis depuis plus de 30 jours
-- ============================================================
-- (même signature et même retour qu'en version 1 : chemins de photos des annonces supprimées)
create or replace function public.neighbors_purge_expired()
returns setof text
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.quotas where day < (now() at time zone 'utc')::date - 7;
  delete from public.reports where created_at < now() - interval '12 months';
  delete from public.moderation_log where at < now() - interval '12 months';
  delete from public.events where ends_at < now() - interval '30 days';   -- les intérêts partent en cascade
  return query delete from public.posts where expires_at < now() returning photo_path;
end;
$$;
revoke all on function public.neighbors_purge_expired() from public, anon, authenticated;

comment on table public.organizers is 'Organisateurs d''événements. verified_at est posé par l''éditeur seulement (aucun droit client d''écriture).';
comment on table public.events is 'Événements près de chez soi. Lieu en texte libre (120 car.), cellule recopiée du profil, supprimés 30 jours après leur fin.';
comment on table public.event_interest is '« Je suis intéressé(e) » : une ligne par membre et événement. Seul le membre voit la sienne ; le total est dans events.interest_count.';
