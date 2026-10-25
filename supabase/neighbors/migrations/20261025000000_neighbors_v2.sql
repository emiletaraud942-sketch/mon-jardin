-- Entraide entre voisins, version 2 : type d'annonce « cherche » (« Je cherche ») et catégories.
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql. Idempotente : peut être rejouée.
-- Ne change aucune politique RLS ni aucun quota. Les anciennes annonces gardent category = null.
-- Les « drop constraint if exists » ne servent qu'à rejouer le fichier : aucune donnée n'est supprimée.

-- 1. Colonne « category » (null autorisé : annonces d'avant la version 2, et dons, échanges, prêts, questions sans catégorie).
alter table public.posts add column if not exists category text;

-- 2. Types d'annonce : on ajoute « cherche ».
alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check
  check (kind in ('don', 'echange', 'pret', 'question', 'cherche'));

-- 3. Catégories autorisées.
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts add constraint posts_category_check
  check (category is null or category in ('graines', 'plantes', 'compost', 'outils', 'materiel', 'services', 'autre'));

-- 4. Une demande « Je cherche » doit avoir une catégorie.
alter table public.posts drop constraint if exists posts_cherche_category_check;
alter table public.posts add constraint posts_cherche_category_check
  check (kind <> 'cherche' or category is not null);

-- 5. Index du fil filtré par catégorie (annonces ouvertes seulement, comme posts_feed_idx).
create index if not exists posts_category_idx
  on public.posts (category, cell_lat, cell_lon, created_at desc)
  where status = 'open' and category is not null;

-- 6. Droits : le client peut écrire la catégorie à la création, et seulement là.
--    Le GRANT de colonne s'ajoute à celui de la version 1 (author, kind, title, body, species_id, photo_path).
grant insert (category) on public.posts to authenticated;

comment on column public.posts.category is 'Catégorie facultative (obligatoire pour kind = cherche) : graines, plantes, compost, outils, materiel, services, autre.';
