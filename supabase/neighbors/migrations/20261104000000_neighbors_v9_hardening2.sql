-- Entraide entre voisins, version 9 : second durcissement (constats S6, S7 complément, S8, S4 de l'audit du 27 octobre 2026).
-- À coller dans le SQL Editor du projet dédié, APRÈS toutes les versions précédentes (v1 à v8), en DERNIER.
-- Idempotente : peut être rejouée. Aucune donnée n'est supprimée ni modifiée (les « drop … if exists » ne servent qu'à rejouer le fichier).
-- Ce fichier ne contient AUCUN secret.
-- Ordre : si vous rejouez un ancien fichier (v1, v4, v7, v8), rejouez ensuite celui-ci : ils remettent d'anciennes versions
-- de fonctions, de politiques ou de contraintes.
--
--   S6  neighbors_is_blocked / neighbors_can_contact / neighbors_can_see_user ne sont plus appelables par l'API (schéma non exposé)
--   S7  contrôles C1 (U+0080-U+009F) interdits dans les textes libres ; contrainte sur les organisateurs (nom et description)
--   S8  masquage automatique : signaleurs de plus de 7 jours ET déjà actifs ; avertissement dans moderation_log AVANT masquage
--   S4  droits de la purge pour la fonction Edge purge-neighbors-photos (clé service_role)
--
-- Non repris volontairement : l'extrait du contenu signalé (décision du propriétaire) et la durée de 7 jours entre deux
-- changements de quartier (v7, inchangée).

-- ============================================================
-- 1. S6 : schéma privé pour les aides de politiques qui sondent l'existence d'autrui
-- ============================================================
-- Ces trois fonctions étaient appelables en RPC (/rest/v1/rpc/…) : une personne bloquée pouvait confirmer son blocage
-- (neighbors_is_blocked), sonder si elle peut contacter quelqu'un, ou si quelqu'un est visible. Retirer EXECUTE aux connectés
-- casserait toutes les politiques (une politique s'exécute avec les droits de l'appelant : « permission denied for function »,
-- constaté). On les déplace donc dans un schéma que PostgREST n'expose pas : les politiques les appellent toujours, l'API non.
-- NE JAMAIS ajouter ce schéma à « Exposed schemas » (Settings > API).
create schema if not exists neighbors_private;
revoke all on schema neighbors_private from public, anon;
grant usage on schema neighbors_private to authenticated;

-- Blocage entre l'utilisateur courant et « other », dans un sens ou dans l'autre.
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

-- Voit-on cette personne ? (zone, bannissement, blocage). Même corps que la v8, seul le schéma change.
create or replace function neighbors_private.neighbors_can_see_user(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.neighbors_is_member())
    and not neighbors_private.neighbors_is_blocked(other)
    and exists (
      select 1 from public.profiles o
      where o.user_id = other and o.banned_at is null and public.neighbors_can_see_cell(o.cell_lat, o.cell_lon)
    );
$$;
revoke all on function neighbors_private.neighbors_can_see_user(uuid) from public, anon;
grant execute on function neighbors_private.neighbors_can_see_user(uuid) to authenticated;

-- Peut-on écrire à cette personne ? Même corps que la v8 (annonce, réponse ou jardin partagé visible), seul le schéma change.
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
      or (
        exists (select 1 from public.garden_shares g where g.user_id = other)
        and neighbors_private.neighbors_can_see_user(other)
      )
    );
$$;
revoke all on function neighbors_private.neighbors_can_contact(uuid) from public, anon;
grant execute on function neighbors_private.neighbors_can_contact(uuid) to authenticated;

-- Politiques qui appelaient les fonctions publiques : mêmes règles qu'avant, seul le nom du schéma change.
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
      or exists (select 1 from public.garden_shares g where g.user_id = profiles.user_id)
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
  -- On n'écrit qu'à une personne dont le profil est déjà visible (annonce, réponse, jardin partagé) : connaître un
  -- identifiant ne suffit pas pour contacter quelqu'un hors zone ou banni, ni pour lire son pseudo et son quartier.
  and (select neighbors_private.neighbors_can_contact(case when threads.user_a = (select auth.uid()) then threads.user_b else threads.user_a end))
  -- Annonce citée : visible de l'appelant ET écrite par l'un des deux participants (pas un contexte trompeur).
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

drop policy if exists garden_shares_select on public.garden_shares;
create policy garden_shares_select on public.garden_shares for select to authenticated using (
  user_id = (select auth.uid())
  or (select neighbors_private.neighbors_can_see_user(garden_shares.user_id))
);

-- Les copies publiques disparaissent (plus aucune politique ni fonction ne les utilise). Sans « cascade » : si une dépendance
-- avait été oubliée, la commande échoue au lieu de supprimer une politique en silence. Ordre : celles qui en appellent d'autres d'abord.
drop function if exists public.neighbors_can_contact(uuid);
drop function if exists public.neighbors_can_see_user(uuid);
drop function if exists public.neighbors_is_blocked(uuid);

-- ============================================================
-- 2. S7 (complément) : contrôles C1 et organisateurs
-- ============================================================
-- La v7 interdit déjà les contrôles C0, DEL, le trait d'union conditionnel, U+061C, U+200B-U+200F (dont les marques U+200E/U+200F),
-- U+2028-U+202E (dont U+202A-U+202E), U+2060-U+206F (dont les isolats U+2066-U+2069) et U+FEFF. Il manquait :
--   - les contrôles C1 (U+0080-U+009F, dont U+0085 « ligne suivante ») dans les textes des annonces, réponses, messages,
--     signalements et événements ;
--   - les organisateurs : description (aucun contrôle de caractères) ; le nom n'avait que [[:cntrl:]], qui dépend de la locale.
-- Les contraintes de la v7 gardent leur nom et sont REMPLACÉES par la même règle plus la plage C1 (pas de doublon).
-- « not valid » : toute nouvelle écriture est contrôlée, sans échouer si une ancienne ligne était étrange ; la validation des lignes
-- existantes est tentée plus bas, sans jamais faire échouer la migration.
alter table public.posts drop constraint if exists posts_text_clean;
alter table public.posts add constraint posts_text_clean check (
  title !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]'
  and body !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
) not valid;

alter table public.replies drop constraint if exists replies_text_clean;
alter table public.replies add constraint replies_text_clean check (
  body !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
) not valid;

alter table public.messages drop constraint if exists messages_text_clean;
alter table public.messages add constraint messages_text_clean check (
  body !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
) not valid;

alter table public.reports drop constraint if exists reports_text_clean;
alter table public.reports add constraint reports_text_clean check (
  details is null or details !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
) not valid;

alter table public.events drop constraint if exists events_text_clean;
alter table public.events add constraint events_text_clean check (
  title !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]'
  and description !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
  and place !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]'
) not valid;

-- Nouvelle : organisateurs (nom et description). Le nom garde aussi ses contrôles de la v4 (organizers_name_check).
alter table public.organizers drop constraint if exists organizers_text_clean;
alter table public.organizers add constraint organizers_text_clean check (
  name !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>]'
  and description !~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]'
) not valid;

-- Validation des lignes existantes. Si l'une d'elles contient un caractère interdit, la contrainte reste « not valid »
-- (elle contrôle quand même les nouvelles écritures) et un message l'indique : rien n'est modifié ni supprimé.
-- À nettoyer à la main puis : alter table public.<table> validate constraint <nom>;
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('posts', 'posts_text_clean'), ('replies', 'replies_text_clean'), ('messages', 'messages_text_clean'),
      ('reports', 'reports_text_clean'), ('events', 'events_text_clean'), ('organizers', 'organizers_text_clean')
    ) as v(tbl, cname)
  loop
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.cname);
    exception when check_violation then
      raise notice 'S7 : d''anciennes lignes de public.% violent % ; contrainte laissée NOT VALID (les nouvelles écritures sont contrôlées). À nettoyer puis valider à la main.', c.tbl, c.cname;
    end;
  end loop;
end $$;

-- ============================================================
-- 3. S8 : masquage automatique plus difficile à fabriquer, et éditeur prévenu AVANT
-- ============================================================
-- Avant : 3 comptes de plus de 24 h suffisaient (3 faux comptes créés la veille masquaient n'importe quelle annonce).
-- Maintenant un signalement ne compte que s'il vient d'un compte NON banni, de plus de 7 jours, qui a déjà publié quelque chose
-- (annonce, réponse ou message). Journal (moderation_log, action « warn », acteur « auto ») :
--   - au 2e signalement qualifié : « le prochain masquera » ;
--   - au 3e signalement de comptes distincts quand moins de 3 sont qualifiés : « à examiner » ;
--   - juste avant un masquage : « seuil atteint », puis la ligne « auto_hide » habituelle ;
--   - un profil ou un message ne se masque pas tout seul : l'éditeur est seulement prévenu, une fois, au 3e signalement qualifié.
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
    elsif new.target_kind in ('profile', 'message') and n = 3 then
      insert into public.moderation_log (actor, action, target_kind, target_id, reason)
      values ('auto', 'warn', new.target_kind, new.target_id, '3 signalements de comptes qualifiés sur un ' || new.target_kind || ' (pas de masquage automatique) : à examiner');
    end if;
  else
    select exists (
      select 1 from public.profiles p
      where p.user_id = new.reporter and p.banned_at is null and p.created_at < now() - interval '7 days'
        and (exists (select 1 from public.posts x where x.author = new.reporter)
          or exists (select 1 from public.replies y where y.author = new.reporter)
          or exists (select 1 from public.messages m where m.sender = new.reporter))
    ) into new_ok;
    if new_ok and n = 2 and can_hide then
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
-- 4. S4 : droits de la purge pour la fonction Edge purge-neighbors-photos
-- ============================================================
-- La fonction (supabase/functions/purge-neighbors-photos) appelle ces deux fonctions avec la clé « service_role » (qui n'existe
-- que dans l'environnement de la fonction), puis efface les fichiers par l'API Storage. Aucun droit pour anon ni les connectés.
revoke all on function public.neighbors_purge_expired() from public, anon, authenticated;
revoke all on function public.neighbors_orphan_photos() from public, anon, authenticated;
grant execute on function public.neighbors_purge_expired() to service_role;
grant execute on function public.neighbors_orphan_photos() to service_role;
