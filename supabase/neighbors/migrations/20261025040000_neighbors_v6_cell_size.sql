-- Entraide entre voisins, version 6 : quartier plus grand (environ 2 km par défaut, « large » environ 5 km au choix).
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql, _v2, _v3_read, _v4_events et _v5_push.
-- Idempotente : peut être rejouée. Aucune donnée n'est supprimée (les « drop … if exists » ne servent qu'à rejouer le fichier).
-- Ordre : si vous rejouez un ancien fichier (v1), rejouez ensuite celui-ci : v1 remet l'ancien arrondi à 0,01°.
--
-- Pourquoi : en zone rurale, une cellule de 1 km peut ne contenir qu'un foyer (pseudo + cellule = ré-identification possible).
--
-- Grille (même formule côté client, src/lib/neighbors/cell.ts) : arrondi = floor(x / pas + 0,5) * pas
--   « standard » : pas 0,02° de latitude, 0,03° de longitude (environ 2,2 km x 2,3 km à 47° N)
--   « large »    : pas 0,05° de latitude, 0,07° de longitude (environ 5,5 km x 5,3 km à 47° N)
-- Les colonnes cell_lat / cell_lon restent numeric(6,2) / numeric(7,2) : tous les pas ont 2 décimales.
--
-- Profils existants : leur cellule (0,01°) est ré-arrondie ICI sur la grille « standard ». Leurs annonces et événements
-- existants le sont aussi (chaque cellule est arrondie sur la grille de son auteur, elle ne déménage pas). Idempotent.
-- Annonces et événements créés ensuite copient la cellule du profil (déclencheurs inchangés).

-- ============================================================
-- 1. Colonne cell_size
-- ============================================================
alter table public.profiles add column if not exists cell_size text not null default 'standard';
alter table public.profiles drop constraint if exists profiles_cell_size_check;
alter table public.profiles add constraint profiles_cell_size_check check (cell_size in ('standard', 'large'));
comment on column public.profiles.cell_size is 'Taille du quartier : standard (environ 2 km, pas 0,02° x 0,03°) ou large (environ 5 km, pas 0,05° x 0,07°).';

-- ============================================================
-- 2. Arrondi sur la grille (une seule formule, pour les déclencheurs et la migration)
-- ============================================================
create or replace function public.neighbors_cell_snap(v numeric, size text, axis text)
returns numeric
language sql immutable
set search_path = ''
as $$
  select floor(v / s.step + 0.5) * s.step
  from (
    select (case when axis = 'lat' then (case when size = 'large' then 0.05 else 0.02 end)
                 else (case when size = 'large' then 0.07 else 0.03 end) end)::numeric as step
  ) s
$$;
revoke all on function public.neighbors_cell_snap(numeric, text, text) from public, anon, authenticated;

-- ============================================================
-- 3. Déclencheurs du profil
-- ============================================================

-- Arrondi selon cell_size, quoi que le client envoie (une valeur hors grille est ramenée sur la grille).
-- security definer : la fonction d'arrondi ci-dessus n'est exécutable par aucun client.
create or replace function public.neighbors_profile_round()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  new.cell_lat := public.neighbors_cell_snap(new.cell_lat, new.cell_size, 'lat');
  new.cell_lon := public.neighbors_cell_snap(new.cell_lon, new.cell_size, 'lon');
  return new;
end;
$$;
revoke all on function public.neighbors_profile_round() from public, anon, authenticated;
drop trigger if exists neighbors_profile_round on public.profiles;
create trigger neighbors_profile_round before insert or update on public.profiles
  for each row execute function public.neighbors_profile_round();

-- Quota de 5 modifications par jour. Ce déclencheur s'exécute AVANT l'arrondi (ordre alphabétique) : il arrondit lui-même
-- la valeur reçue, sinon un client pourrait changer de taille (ou envoyer une valeur hors grille) sans consommer de quota.
create or replace function public.neighbors_profile_before_update()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.pseudo is distinct from old.pseudo
     or new.cell_size is distinct from old.cell_size
     or public.neighbors_cell_snap(new.cell_lat, new.cell_size, 'lat') is distinct from old.cell_lat
     or public.neighbors_cell_snap(new.cell_lon, new.cell_size, 'lon') is distinct from old.cell_lon then
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

-- ============================================================
-- 4. Ré-arrondi des données existantes (sans consommer le quota de personne)
-- ============================================================
-- Le déclencheur de quota est coupé le temps de la mise à jour, puis remis. Si une instruction échoue, tout le
-- fichier est annulé (une seule transaction dans le SQL Editor) et le déclencheur reste en place.
alter table public.profiles disable trigger neighbors_profile_before_update;

update public.profiles
set cell_lat = public.neighbors_cell_snap(cell_lat, cell_size, 'lat'),
    cell_lon = public.neighbors_cell_snap(cell_lon, cell_size, 'lon')
where cell_lat is distinct from public.neighbors_cell_snap(cell_lat, cell_size, 'lat')
   or cell_lon is distinct from public.neighbors_cell_snap(cell_lon, cell_size, 'lon');

alter table public.profiles enable trigger neighbors_profile_before_update;

-- Annonces et événements : chaque cellule est arrondie sur la grille de son auteur (pas de déménagement).
update public.posts p
set cell_lat = public.neighbors_cell_snap(p.cell_lat, pr.cell_size, 'lat'),
    cell_lon = public.neighbors_cell_snap(p.cell_lon, pr.cell_size, 'lon')
from public.profiles pr
where pr.user_id = p.author
  and (p.cell_lat is distinct from public.neighbors_cell_snap(p.cell_lat, pr.cell_size, 'lat')
    or p.cell_lon is distinct from public.neighbors_cell_snap(p.cell_lon, pr.cell_size, 'lon'));

update public.events e
set cell_lat = public.neighbors_cell_snap(e.cell_lat, pr.cell_size, 'lat'),
    cell_lon = public.neighbors_cell_snap(e.cell_lon, pr.cell_size, 'lon')
from public.profiles pr
where pr.user_id = e.organizer
  and (e.cell_lat is distinct from public.neighbors_cell_snap(e.cell_lat, pr.cell_size, 'lat')
    or e.cell_lon is distinct from public.neighbors_cell_snap(e.cell_lon, pr.cell_size, 'lon'));

-- ============================================================
-- 5. Droits, colonne par colonne
-- ============================================================
-- Écriture : seulement les membres connectés. Lecture : ceux qui lisent déjà le profil (la politique « profiles_select » filtre les lignes).
grant insert (user_id, pseudo, cell_lat, cell_lon, cell_size) on public.profiles to authenticated;
grant update (pseudo, cell_lat, cell_lon, cell_size) on public.profiles to authenticated;
grant select (user_id, pseudo, cell_lat, cell_lon, cell_size, created_at) on public.profiles to authenticated;
revoke all (cell_size) on public.profiles from anon;

comment on table public.profiles is 'Profil public d''entraide : pseudo et quartier (cellule de 0,02° x 0,03°, ou 0,05° x 0,07° en « large »). Donnée personnelle, effaçable via delete_my_account().';

-- La visibilité (neighbors_can_see_cell, environ 55 km autour du centre de sa propre cellule) est inchangée : le rayon
-- maximal de l'appli est 50 km, et un centre de cellule « large » est à 2,8 km au plus du domicile réel.
