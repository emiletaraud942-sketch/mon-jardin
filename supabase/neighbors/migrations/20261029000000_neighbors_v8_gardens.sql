-- Entraide entre voisins, version 8 : « Ce que j'ai dans mon jardin » (boutures entre voisins).
-- À coller dans le SQL Editor du projet dédié, APRÈS toutes les versions précédentes (v1 à v7), en DERNIER.
-- Idempotente : peut être rejouée. Aucune donnée n'est supprimée (les « drop … if exists » ne servent qu'à rejouer le fichier).
-- Ce fichier REMPLACE deux objets de la v1 : la fonction neighbors_can_contact et la politique profiles_select.
-- Rejouer la v1 après celui-ci remet les anciennes versions : rejouez alors ce fichier en dernier.
--
-- Ce qui est partagé : la LISTE des espèces du jardin (identifiants de fiches comme « pommier »), rien d'autre. Ni position, ni
-- nombre, ni photo, ni adresse. Facultatif et désactivé par défaut : pas de ligne = rien de visible. La personne l'arrête quand elle veut.
-- Qui la voit : les membres connectés, non bannis, à moins de ~55 km (comme les annonces), sans blocage dans un sens ou dans l'autre.

-- ============================================================
-- 1. Table
-- ============================================================
create table if not exists public.garden_shares (
  user_id    uuid primary key default auth.uid() references public.profiles (user_id) on delete cascade,
  species    text[] not null default '{}',
  updated_at timestamptz not null default now()
);
-- Contrôle de chaque élément (un seul contrôle sur le texte joint laisserait passer « a,b » ou un séparateur caché dans un identifiant).
-- Fonction immuable, sans accès aux tables ; une contrainte CHECK s'exécute avec les droits de l'appelant : « authenticated » doit pouvoir l'exécuter.
create or replace function public.neighbors_species_valid(list text[])
returns boolean
language sql immutable
set search_path = ''
as $$
  select list is not null and cardinality(list) <= 80
    and not exists (select 1 from unnest(list) s where s is null or s !~ '^[a-z0-9-]{2,40}$');
$$;
revoke all on function public.neighbors_species_valid(text[]) from public, anon;
grant execute on function public.neighbors_species_valid(text[]) to authenticated;

-- 80 espèces au plus ; chacune est un identifiant de fiche (minuscules, chiffres, tirets : jamais de texte libre).
alter table public.garden_shares drop constraint if exists garden_shares_species_check;
alter table public.garden_shares add constraint garden_shares_species_check check (public.neighbors_species_valid(species));

-- ============================================================
-- 2. Fonction d'aide : voit-on cette personne ? (zone, bannissement, blocage)
-- ============================================================
-- Fonction séparée (security definer) : la politique de « garden_shares » ne doit pas interroger « profiles » directement,
-- dont la politique lit « garden_shares » (« infinite recursion detected in policy »).
create or replace function public.neighbors_can_see_user(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.neighbors_is_member())
    and not public.neighbors_is_blocked(other)
    and exists (
      select 1 from public.profiles o
      where o.user_id = other and o.banned_at is null and public.neighbors_can_see_cell(o.cell_lat, o.cell_lon)
    );
$$;
revoke all on function public.neighbors_can_see_user(uuid) from public, anon;
grant execute on function public.neighbors_can_see_user(uuid) to authenticated;

-- ============================================================
-- 3. Déclencheur : au nom de soi seulement, liste nettoyée (sans doublon, triée), 20 écritures par jour
-- ============================================================
create or replace function public.neighbors_garden_before_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.neighbors_assert_self(new.user_id);
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  new.species := coalesce(array(select distinct s from unnest(new.species) s where s is not null order by s), '{}');
  new.updated_at := now();
  perform public.neighbors_take_quota(new.user_id, 'garden_share', 20);
  return new;
end;
$$;
revoke all on function public.neighbors_garden_before_write() from public, anon, authenticated;
drop trigger if exists neighbors_garden_before_write on public.garden_shares;
create trigger neighbors_garden_before_write before insert or update on public.garden_shares
  for each row execute function public.neighbors_garden_before_write();

-- ============================================================
-- 4. Droits : colonne par colonne
-- ============================================================
revoke all on public.garden_shares from public, anon, authenticated;
grant select (user_id, species, updated_at) on public.garden_shares to authenticated;
grant insert (species) on public.garden_shares to authenticated;
grant update (species) on public.garden_shares to authenticated;
grant delete on public.garden_shares to authenticated;

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.garden_shares enable row level security;

drop policy if exists garden_shares_select on public.garden_shares;
create policy garden_shares_select on public.garden_shares for select to authenticated using (
  user_id = (select auth.uid())
  or (select public.neighbors_can_see_user(garden_shares.user_id))
);
drop policy if exists garden_shares_insert on public.garden_shares;
create policy garden_shares_insert on public.garden_shares for insert to authenticated with check (
  user_id = (select auth.uid()) and (select public.neighbors_is_member())
);
drop policy if exists garden_shares_update on public.garden_shares;
create policy garden_shares_update on public.garden_shares for update to authenticated
  using (user_id = (select auth.uid()) and (select public.neighbors_is_member()))
  with check (user_id = (select auth.uid()) and (select public.neighbors_is_member()));
drop policy if exists garden_shares_delete on public.garden_shares;
create policy garden_shares_delete on public.garden_shares for delete to authenticated using (
  user_id = (select auth.uid())
);

-- ============================================================
-- 6. Remplace deux objets de la v1
-- ============================================================

-- Contact : en plus d'une annonce ou d'une réponse visible, un jardin partagé visible permet d'écrire (demander une bouture).
create or replace function public.neighbors_can_contact(other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select public.neighbors_is_member())
    and other is distinct from (select auth.uid())
    and not public.neighbors_is_blocked(other)
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
        and public.neighbors_can_see_user(other)
      )
    );
$$;
revoke all on function public.neighbors_can_contact(uuid) from public, anon;
grant execute on function public.neighbors_can_contact(uuid) to authenticated;

-- Profil : lisible aussi pour une personne dont on voit le jardin partagé (pour afficher son pseudo).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  user_id = (select auth.uid())
  or (
    (select public.neighbors_is_member())
    and not public.neighbors_is_blocked(user_id)
    and (
      exists (select 1 from public.posts p where p.author = profiles.user_id)
      or exists (select 1 from public.replies r where r.author = profiles.user_id)
      or exists (select 1 from public.threads t where t.user_a = profiles.user_id or t.user_b = profiles.user_id)
      or exists (select 1 from public.garden_shares g where g.user_id = profiles.user_id)
    )
  )
);
