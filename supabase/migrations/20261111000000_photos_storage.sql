-- Synchronisation des photos : un espace de stockage PRIVÉ, un dossier par utilisateur (nommé d'après son identifiant).
-- Chacun ne lit, n'écrit et n'efface que ses propres fichiers. Aucun accès anonyme, aucun lien public.
-- Les images sont déjà réduites et débarrassées de leurs métadonnées (EXIF, GPS) par l'appli avant l'envoi.
-- Limites : 4 Mo par fichier, JPEG seulement (l'appli ne produit que du JPEG). Rejouable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 4194304, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos : lecture de ses fichiers" on storage.objects;
create policy "photos : lecture de ses fichiers" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "photos : envoi dans son dossier" on storage.objects;
create policy "photos : envoi dans son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "photos : remplacement dans son dossier" on storage.objects;
create policy "photos : remplacement dans son dossier" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "photos : suppression de ses fichiers" on storage.objects;
create policy "photos : suppression de ses fichiers" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
