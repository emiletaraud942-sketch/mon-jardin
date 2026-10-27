-- Entraide v7 : durcissement issu de l'audit du 27 octobre 2026. Idempotente (rejouable).
-- 1. Changer de zone : au plus une fois tous les 7 jours (après une première journée de correction libre).
-- 2. Textes : plus de caractères de contrôle ni d'invisibles / de direction (usurpation visuelle) dans les annonces,
--    réponses, messages, détails de signalement et événements. Le saut de ligne et la tabulation restent permis.

-- ============================================================
-- 1. Changement de zone
-- ============================================================
-- Avant : 5 changements de pseudo ou de quartier par jour, donc une seule personne pouvait balayer des zones de 55 km
-- et lire les annonces de toute la France en une dizaine de jours. Maintenant la zone (cellule ou taille) ne change
-- qu'une fois par semaine ; le quota de 5 modifications par jour reste pour le pseudo.
alter table public.profiles add column if not exists cell_changed_at timestamptz;
update public.profiles set cell_changed_at = created_at where cell_changed_at is null;
alter table public.profiles alter column cell_changed_at set default now();
alter table public.profiles alter column cell_changed_at set not null;

-- Aucun droit client sur cette colonne : posée par le déclencheur seulement.
revoke all (cell_changed_at) on public.profiles from public, anon, authenticated;

create or replace function public.neighbors_profile_before_update()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  zone_changed boolean;
begin
  zone_changed := new.cell_size is distinct from old.cell_size
    or public.neighbors_cell_snap(new.cell_lat, new.cell_size, 'lat') is distinct from old.cell_lat
    or public.neighbors_cell_snap(new.cell_lon, new.cell_size, 'lon') is distinct from old.cell_lon;
  if new.pseudo is distinct from old.pseudo or zone_changed then
    perform public.neighbors_assert_self(new.user_id);
    perform public.neighbors_take_quota(new.user_id, 'profile', 5);
  end if;
  if zone_changed then
    -- Première journée du profil : corrections libres (erreur de saisie à l'inscription).
    if old.created_at < now() - interval '1 day' and old.cell_changed_at > now() - interval '7 days' then
      raise exception 'quota_exceeded:zone' using errcode = 'P0001';
    end if;
    new.cell_changed_at := now();
  else
    new.cell_changed_at := old.cell_changed_at;   -- un client ne peut pas la modifier
  end if;
  return new;
end;
$$;
revoke all on function public.neighbors_profile_before_update() from public, anon, authenticated;
drop trigger if exists neighbors_profile_before_update on public.profiles;
create trigger neighbors_profile_before_update before update on public.profiles
  for each row execute function public.neighbors_profile_before_update();

-- ============================================================
-- 2. Textes sans caractères de contrôle ni invisibles
-- ============================================================
-- NOT VALID : les lignes existantes ne sont pas contrôlées, toute nouvelle ligne ou modification l'est.
alter table public.posts drop constraint if exists posts_text_clean;
alter table public.posts add constraint posts_text_clean check (
  title !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿<>]' and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿]'
) not valid;

alter table public.replies drop constraint if exists replies_text_clean;
alter table public.replies add constraint replies_text_clean check (
  body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿]'
) not valid;

alter table public.messages drop constraint if exists messages_text_clean;
alter table public.messages add constraint messages_text_clean check (
  body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿]'
) not valid;

alter table public.reports drop constraint if exists reports_text_clean;
alter table public.reports add constraint reports_text_clean check (
  details is null or details !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿]'
) not valid;

alter table public.events drop constraint if exists events_text_clean;
alter table public.events add constraint events_text_clean check (
  title !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿<>]'
  and description !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿]'
  and place !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f­؜​-‏ -‮⁠-⁯﻿<>]'
) not valid;
