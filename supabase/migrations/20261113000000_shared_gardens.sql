-- Jardins partagés : un jardin modifié à plusieurs (famille, voisins, association), sur invitation par code. Idempotente.
--
-- Principe : le jardin partagé vit en ligne (une ligne `shared_gardens`, ses plantes dans `shared_plants`, une plante par ligne) ; chaque membre en
-- garde une copie sur son appareil (l'appli reste local-first). Les écritures de membres, d'invitations et de plantes passent par des fonctions
-- ou par des politiques qui vérifient l'appartenance ; aucun accès anonyme ; rien n'est public ; pas de découverte : on entre avec un code.
-- Les photos ne sont PAS partagées (elles restent sur l'appareil qui les a prises).
--
-- Limites : 20 membres, 500 plantes, 10 jardins partagés par personne ; invitation valable 7 jours, 10 utilisations.

create schema if not exists shared_private;
revoke all on schema shared_private from public, anon;
grant usage on schema shared_private to authenticated;

-- ---------- Tables ----------
create table if not exists public.shared_gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  garden jsonb not null check (jsonb_typeof(garden) = 'object' and pg_column_size(garden) <= 1000000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_garden_members (
  garden_id uuid not null references public.shared_gardens (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at timestamptz not null default now(),
  primary key (garden_id, user_id)
);
create index if not exists shared_garden_members_user on public.shared_garden_members (user_id);

create table if not exists public.shared_garden_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  garden_id uuid not null references public.shared_gardens (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  uses integer not null default 0 check (uses >= 0),
  max_uses integer not null default 10 check (max_uses between 1 and 50)
);
create index if not exists shared_garden_invites_garden on public.shared_garden_invites (garden_id);

create table if not exists public.shared_plants (
  garden_id uuid not null references public.shared_gardens (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (garden_id, id)
);
create index if not exists shared_plants_garden_updated on public.shared_plants (garden_id, updated_at);

-- ---------- Aides (hors de l'API : schéma privé) ----------
create or replace function shared_private.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_garden_members m where m.garden_id = gid and m.user_id = (select auth.uid()))
$$;

create or replace function shared_private.is_admin(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shared_garden_members m where m.garden_id = gid and m.user_id = (select auth.uid()) and m.role = 'admin')
$$;

-- Compte anonyme refusé (comme pour les copies en ligne personnelles).
create or replace function shared_private.require_real_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  return uid;
end $$;

revoke all on function shared_private.is_member(uuid), shared_private.is_admin(uuid), shared_private.require_real_user() from public, anon;
grant execute on function shared_private.is_member(uuid), shared_private.is_admin(uuid), shared_private.require_real_user() to authenticated;

-- ---------- Déclencheurs ----------
-- L'heure et l'auteur d'une écriture sont ceux du serveur : jamais ceux que le client enverrait.
create or replace function shared_private.touch_plant() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := (select auth.uid());
  if tg_op = 'UPDATE' then
    new.garden_id := old.garden_id;
    new.id := old.id;
  end if;
  return new;
end $$;
drop trigger if exists shared_plants_touch on public.shared_plants;
create trigger shared_plants_touch before insert or update on public.shared_plants
  for each row execute function shared_private.touch_plant();

-- 500 plantes au plus par jardin partagé.
create or replace function shared_private.cap_plants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.shared_plants p where p.garden_id = new.garden_id) >= 500 then
    raise exception 'Ce jardin partagé a atteint 500 plantes.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists shared_plants_cap on public.shared_plants;
create trigger shared_plants_cap before insert on public.shared_plants
  for each row execute function shared_private.cap_plants();

create or replace function shared_private.touch_garden() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists shared_gardens_touch on public.shared_gardens;
create trigger shared_gardens_touch before update on public.shared_gardens
  for each row execute function shared_private.touch_garden();

-- Un jardin sans plus aucun membre (comptes supprimés) est effacé avec ses plantes et ses invitations.
create or replace function shared_private.drop_empty_garden() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shared_garden_members m where m.garden_id = old.garden_id) then
    delete from public.shared_gardens g where g.id = old.garden_id;
  end if;
  return null;
end $$;
drop trigger if exists shared_members_empty on public.shared_garden_members;
create trigger shared_members_empty after delete on public.shared_garden_members
  for each row execute function shared_private.drop_empty_garden();

-- Un jardin ne reste jamais sans responsable tant qu'il a des membres : le plus ancien membre le devient.
create or replace function shared_private.keep_an_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if exists (select 1 from public.shared_garden_members m where m.garden_id = old.garden_id)
     and not exists (select 1 from public.shared_garden_members m where m.garden_id = old.garden_id and m.role = 'admin') then
    select m.user_id into heir from public.shared_garden_members m where m.garden_id = old.garden_id order by m.joined_at, m.user_id limit 1;
    update public.shared_garden_members m set role = 'admin' where m.garden_id = old.garden_id and m.user_id = heir;
  end if;
  return null;
end $$;
drop trigger if exists shared_members_admin on public.shared_garden_members;
create trigger shared_members_admin after delete or update of role on public.shared_garden_members
  for each row execute function shared_private.keep_an_admin();

-- ---------- Droits par ligne ----------
alter table public.shared_gardens enable row level security;
alter table public.shared_garden_members enable row level security;
alter table public.shared_garden_invites enable row level security;
alter table public.shared_plants enable row level security;

-- Rien pour `anon` ; pour `authenticated`, seulement ce que les politiques et les fonctions autorisent.
revoke all on public.shared_gardens, public.shared_garden_members, public.shared_garden_invites, public.shared_plants from anon, public;
revoke all on public.shared_gardens, public.shared_garden_members, public.shared_garden_invites, public.shared_plants from authenticated;
grant select on public.shared_gardens, public.shared_garden_members to authenticated;
grant update (name, garden) on public.shared_gardens to authenticated;
grant select, delete on public.shared_garden_invites to authenticated;
grant select, insert on public.shared_plants to authenticated;
grant update (data, deleted) on public.shared_plants to authenticated;

drop policy if exists "jardin partagé : lecture par les membres" on public.shared_gardens;
create policy "jardin partagé : lecture par les membres" on public.shared_gardens
  for select to authenticated using (shared_private.is_member(id));
drop policy if exists "jardin partagé : modification par les responsables" on public.shared_gardens;
create policy "jardin partagé : modification par les responsables" on public.shared_gardens
  for update to authenticated using (shared_private.is_admin(id)) with check (shared_private.is_admin(id));

drop policy if exists "membres : lecture par les membres du jardin" on public.shared_garden_members;
create policy "membres : lecture par les membres du jardin" on public.shared_garden_members
  for select to authenticated using (shared_private.is_member(garden_id));

drop policy if exists "invitations : lecture par les responsables" on public.shared_garden_invites;
create policy "invitations : lecture par les responsables" on public.shared_garden_invites
  for select to authenticated using (shared_private.is_admin(garden_id));
drop policy if exists "invitations : retrait par les responsables" on public.shared_garden_invites;
create policy "invitations : retrait par les responsables" on public.shared_garden_invites
  for delete to authenticated using (shared_private.is_admin(garden_id));

drop policy if exists "plantes partagées : lecture par les membres" on public.shared_plants;
create policy "plantes partagées : lecture par les membres" on public.shared_plants
  for select to authenticated using (shared_private.is_member(garden_id));
drop policy if exists "plantes partagées : ajout par les membres" on public.shared_plants;
create policy "plantes partagées : ajout par les membres" on public.shared_plants
  for insert to authenticated with check (shared_private.is_member(garden_id));
drop policy if exists "plantes partagées : modification par les membres" on public.shared_plants;
create policy "plantes partagées : modification par les membres" on public.shared_plants
  for update to authenticated using (shared_private.is_member(garden_id)) with check (shared_private.is_member(garden_id));

-- Restrictives : aucun compte anonyme, sur aucune de ces tables.
do $$
declare t text;
begin
  foreach t in array array['shared_gardens', 'shared_garden_members', 'shared_garden_invites', 'shared_plants'] loop
    execute format('drop policy if exists "pas de compte anonyme" on public.%I', t);
    execute format($p$create policy "pas de compte anonyme" on public.%I as restrictive for all to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)$p$, t);
  end loop;
end $$;

-- ---------- Fonctions (appelées par l'appli) ----------
-- Créer un jardin partagé : l'appelant en est le responsable.
create or replace function public.create_shared_garden(p_name text, p_garden jsonb, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user(); gid uuid;
begin
  if (select count(*) from public.shared_garden_members m where m.user_id = uid) >= 10 then
    raise exception 'Vous avez atteint 10 jardins partagés.' using errcode = '23514';
  end if;
  insert into public.shared_gardens (name, garden, created_by) values (p_name, p_garden, uid) returning id into gid;
  insert into public.shared_garden_members (garden_id, user_id, role, display_name) values (gid, uid, 'admin', p_display_name);
  return gid;
end $$;

-- Une invitation : code de 8 caractères, valable 7 jours, 10 utilisations. Réservée aux responsables.
create or replace function public.create_shared_invite(p_garden_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user(); alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; bytes bytea; c text := ''; i int;
begin
  if not shared_private.is_admin(p_garden_id) then
    raise exception 'Réservé aux responsables du jardin.' using errcode = '42501';
  end if;
  delete from public.shared_garden_invites v where v.garden_id = p_garden_id and (v.expires_at < now() or v.uses >= v.max_uses);
  if (select count(*) from public.shared_garden_invites v where v.garden_id = p_garden_id) >= 5 then
    raise exception 'Trop d''invitations en cours : retirez-en une.' using errcode = '23514';
  end if;
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    c := '';
    for i in 0..7 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.shared_garden_invites v where v.code = c);
  end loop;
  insert into public.shared_garden_invites (code, garden_id, created_by, expires_at) values (c, p_garden_id, uid, now() + interval '7 days');
  return c;
end $$;

-- Rejoindre avec un code. Renvoie le jardin partagé. Les erreurs ne disent pas si le code a existé.
create or replace function public.join_shared_garden(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user(); inv public.shared_garden_invites%rowtype; v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into inv from public.shared_garden_invites v where v.code = v_code for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'Ce code est invalide ou périmé.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.shared_garden_members m where m.garden_id = inv.garden_id and m.user_id = uid) then
    return inv.garden_id; -- déjà membre : rien à faire
  end if;
  if (select count(*) from public.shared_garden_members m where m.garden_id = inv.garden_id) >= 20 then
    raise exception 'Ce jardin partagé a atteint 20 membres.' using errcode = '23514';
  end if;
  if (select count(*) from public.shared_garden_members m where m.user_id = uid) >= 10 then
    raise exception 'Vous avez atteint 10 jardins partagés.' using errcode = '23514';
  end if;
  insert into public.shared_garden_members (garden_id, user_id, role, display_name) values (inv.garden_id, uid, 'member', p_display_name);
  update public.shared_garden_invites v set uses = v.uses + 1 where v.code = inv.code;
  return inv.garden_id;
end $$;

-- Quitter un jardin partagé (ses plantes y restent, au nom du jardin).
create or replace function public.leave_shared_garden(p_garden_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user();
begin
  delete from public.shared_garden_members m where m.garden_id = p_garden_id and m.user_id = uid;
end $$;

-- Retirer un membre (responsables seulement ; pas soi-même : on « quitte »).
create or replace function public.remove_shared_member(p_garden_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user();
begin
  if not shared_private.is_admin(p_garden_id) then
    raise exception 'Réservé aux responsables du jardin.' using errcode = '42501';
  end if;
  if p_user_id = uid then
    raise exception 'Pour partir, utilisez « Quitter ce jardin ».' using errcode = '23514';
  end if;
  delete from public.shared_garden_members m where m.garden_id = p_garden_id and m.user_id = p_user_id;
end $$;

-- Changer le rôle d'un membre (responsables seulement).
create or replace function public.set_shared_role(p_garden_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform shared_private.require_real_user();
  if not shared_private.is_admin(p_garden_id) then
    raise exception 'Réservé aux responsables du jardin.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Rôle inconnu.' using errcode = '22023';
  end if;
  update public.shared_garden_members m set role = p_role where m.garden_id = p_garden_id and m.user_id = p_user_id;
end $$;

-- Changer son propre nom dans un jardin partagé.
create or replace function public.rename_me_in_shared_garden(p_garden_id uuid, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := shared_private.require_real_user();
begin
  update public.shared_garden_members m set display_name = p_display_name where m.garden_id = p_garden_id and m.user_id = uid;
end $$;

-- Supprimer un jardin partagé (responsables seulement) : tout est effacé en ligne ; les copies des appareils restent.
create or replace function public.delete_shared_garden(p_garden_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform shared_private.require_real_user();
  if not shared_private.is_admin(p_garden_id) then
    raise exception 'Réservé aux responsables du jardin.' using errcode = '42501';
  end if;
  delete from public.shared_gardens g where g.id = p_garden_id;
end $$;

-- Envoyer des plantes (100 au plus à la fois). Chaque ligne : { id, data, deleted, base }.
-- `base` = l'heure de la version que l'appareil connaissait (texte tel que reçu) ; absente = nouvelle plante.
-- Si quelqu'un a modifié la plante entre-temps, la ligne est refusée (« conflicts ») : la version en ligne est gardée et l'appareil la reprend.
create or replace function public.push_shared_plants(p_garden_id uuid, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; ok jsonb := '[]'::jsonb; conflicts jsonb := '[]'::jsonb; n int; at timestamptz;
begin
  perform shared_private.require_real_user();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 100 then
    raise exception 'Envoi trop gros : 100 plantes au plus à la fois.' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    at := null;
    if r ->> 'base' is null then
      insert into public.shared_plants (garden_id, id, data, deleted) values (p_garden_id, r ->> 'id', r -> 'data', coalesce((r ->> 'deleted')::boolean, false))
        on conflict (garden_id, id) do nothing returning updated_at into at;
      get diagnostics n = row_count;
    else
      update public.shared_plants p set data = r -> 'data', deleted = coalesce((r ->> 'deleted')::boolean, false)
        where p.garden_id = p_garden_id and p.id = r ->> 'id' and p.updated_at = (r ->> 'base')::timestamptz returning p.updated_at into at;
      get diagnostics n = row_count;
    end if;
    if n = 1 then ok := ok || jsonb_build_object('id', r ->> 'id', 'updated_at', at);
    else conflicts := conflicts || to_jsonb(r ->> 'id'); end if;
  end loop;
  return jsonb_build_object('ok', ok, 'conflicts', conflicts);
end $$;

-- Aucun droit d'exécution pour `anon` ni pour le public ; `authenticated` seulement.
revoke all on function
  public.create_shared_garden(text, jsonb, text), public.create_shared_invite(uuid), public.join_shared_garden(text, text),
  public.leave_shared_garden(uuid), public.remove_shared_member(uuid, uuid), public.set_shared_role(uuid, uuid, text),
  public.rename_me_in_shared_garden(uuid, text), public.delete_shared_garden(uuid), public.push_shared_plants(uuid, jsonb)
  from public, anon;
grant execute on function
  public.create_shared_garden(text, jsonb, text), public.create_shared_invite(uuid), public.join_shared_garden(text, text),
  public.leave_shared_garden(uuid), public.remove_shared_member(uuid, uuid), public.set_shared_role(uuid, uuid, text),
  public.rename_me_in_shared_garden(uuid, text), public.delete_shared_garden(uuid), public.push_shared_plants(uuid, jsonb)
  to authenticated;
