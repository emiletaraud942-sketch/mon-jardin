-- Entraide entre voisins, version 10 : voir les événements près de chez soi SANS compte.
-- À coller dans le SQL Editor du projet, APRÈS toutes les versions précédentes (v1 à v9), en DERNIER.
-- Idempotente : peut être rejouée. Aucune donnée n'est modifiée ni supprimée. Ne touche à aucune table, politique ni droit existant.
--
-- Principe : AUCUN accès direct aux tables n'est ouvert à « anon ». Une seule fonction, en lecture, renvoie une liste très restreinte :
--   - seulement les événements OUVERTS, pas finis, qui commencent dans les 90 prochains jours ;
--   - seulement ceux d'un organisateur VALIDÉ et non banni (jamais un événement masqué, annulé ou en attente) ;
--   - seulement ceux d'une fenêtre de 25 km autour d'un point ARRONDI à la grande cellule (≈ 5 km, comme le quartier « large ») : une position fine
--     envoyée par un client est arrondie ici aussi, et la fenêtre ne permet pas de situer un organisateur à moins de ≈ 5 km ;
--   - 20 événements au plus, les plus proches dans le temps ;
--   - seulement titre, dates, lieu (texte public) et nom de l'organisateur : ni identifiant, ni description, ni lien d'inscription, ni cellule,
--     ni distance, ni nombre d'intéressés.
-- Limite connue : « anon » peut appeler la fonction avec n'importe quel point. Un moissonnage de toute la France demanderait des centaines
-- d'appels et ne rendrait que des événements déjà publics par nature (publiés par des organisateurs validés) : risque accepté, à surveiller
-- (limitation de débit de Supabase, journaux de l'API).

create or replace function public.neighbors_public_events(p_lat numeric, p_lon numeric)
returns table (title text, starts_at timestamptz, ends_at timestamptz, place text, organizer_name text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  c_lat numeric;
  c_lon numeric;
  d_lat double precision;
  d_lon double precision;
begin
  if p_lat is null or p_lon is null or p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
    raise exception 'invalid_cell' using errcode = '22023';
  end if;
  -- Grande cellule (≈ 5 km) : même grille que le quartier « large » (v6).
  c_lat := public.neighbors_cell_snap(p_lat, 'large', 'lat');
  c_lon := public.neighbors_cell_snap(p_lon, 'large', 'lon');
  d_lat := 25 / 111.32;
  d_lon := 25 / (111.32 * greatest(cos(radians(c_lat::double precision)), 0.09));
  return query
    select e.title, e.starts_at, e.ends_at, e.place, o.name
    from public.events e
    join public.organizers o on o.user_id = e.organizer and o.verified_at is not null
    join public.profiles p on p.user_id = e.organizer and p.banned_at is null
    where e.status = 'open'
      and e.ends_at > now()
      and e.starts_at < now() + interval '90 days'
      and abs((e.cell_lat - c_lat)::double precision) <= d_lat
      and abs((e.cell_lon - c_lon)::double precision) <= d_lon
    order by e.starts_at, e.id
    limit 20;
end;
$$;

revoke all on function public.neighbors_public_events(numeric, numeric) from public, anon, authenticated;
grant execute on function public.neighbors_public_events(numeric, numeric) to anon, authenticated;

comment on function public.neighbors_public_events(numeric, numeric) is
  'Événements ouverts et à venir autour d''un point arrondi à 5 km, visibles sans compte : titre, dates, lieu, nom de l''organisateur seulement (20 au plus).';
