-- Entraide entre voisins, version 5 : alertes de nouveaux messages (Web Push) et préférences de notification.
-- À coller dans le SQL Editor du projet dédié, APRÈS 20261023000000_neighbors.sql, _v2, _v3_read et _v4_events.
-- Idempotente : peut être rejouée. Aucune donnée n'est supprimée (les « drop … if exists » ne servent qu'à rejouer le fichier).
-- Ce fichier ne contient AUCUN secret. Les clés VAPID privées vivent seulement dans l'environnement de la fonction
-- notify-message (voir docs/ENTRAIDE.md). La fonction lit la base avec la clé « service_role » du projet.
-- Ce fichier ne remplace aucune fonction existante : le rejouer après un ancien fichier est sans risque.

-- ============================================================
-- 1. Tables
-- ============================================================

-- Abonnements d'alerte : un par appareil et par navigateur. L'adresse (endpoint) est celle du service d'alerte du navigateur
-- (Google, Mozilla, Apple, Microsoft). Supprimés avec le compte (cascade). Aucun autre membre ne les lit.
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (user_id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
-- Un appareil, une seule ligne.
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);
-- L'adresse doit être celle d'un service d'alerte connu : sinon la fonction enverrait des requêtes où un membre voudrait
-- (SSRF). Pour accepter un autre service un jour, remplacer cette contrainte (voir docs/ENTRAIDE.md, section v5).
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check check (
  char_length(endpoint) between 20 and 700
  and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[!-~]+$'
);
alter table public.push_subscriptions drop constraint if exists push_subscriptions_keys_check;
alter table public.push_subscriptions add constraint push_subscriptions_keys_check check (
  p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and auth ~ '^[A-Za-z0-9_-]{16,32}$'
);

-- Préférences : une ligne par membre. Sans ligne, RIEN n'est envoyé. L'appli crée la ligne quand la personne active les alertes.
-- « nouveautes » et « evenements » sont gardés pour plus tard : aucune alerte de ce genre n'est envoyée aujourd'hui.
create table if not exists public.notification_prefs (
  user_id   uuid primary key default auth.uid() references public.profiles (user_id) on delete cascade,
  messages  boolean not null default true,
  nouveautes boolean not null default false,
  evenements boolean not null default false
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ============================================================
-- 2. Déclencheur : plafond de 5 appareils par personne, 20 abonnements par jour
-- ============================================================
create or replace function public.neighbors_push_before_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.neighbors_assert_self(new.user_id);
  new.created_at := now();
  -- Deux abonnements simultanés ne dépassent pas le plafond : un verrou par personne le temps de la transaction.
  perform pg_advisory_xact_lock(hashtextextended('push:' || new.user_id::text, 0));
  if (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 5 then
    raise exception 'push_limit' using errcode = 'P0001';
  end if;
  perform public.neighbors_take_quota(new.user_id, 'push', 20);
  return new;
end;
$$;
revoke all on function public.neighbors_push_before_insert() from public, anon, authenticated;
drop trigger if exists neighbors_push_before_insert on public.push_subscriptions;
create trigger neighbors_push_before_insert before insert on public.push_subscriptions
  for each row execute function public.neighbors_push_before_insert();

-- ============================================================
-- 3. Fonction réservée à la fonction notify-message (clé « service_role » seulement)
-- ============================================================

-- Les faits dont la fonction a besoin pour décider d'envoyer ou non une alerte pour UN message. Ne renvoie ni le texte du
-- message ni le pseudo : seulement des identifiants, des dates, des indicateurs et les abonnements du DESTINATAIRE.
-- La décision (préférences, blocage, bannissement, rythme) est prise par la fonction, avec ces faits.
create or replace function public.neighbors_push_facts(p_message_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  m record;
  t record;
  rcpt uuid;
begin
  select id, thread_id, sender, created_at into m from public.messages where id = p_message_id;
  if not found then return null; end if;
  select user_a, user_b into t from public.threads where id = m.thread_id;
  if not found then return null; end if;
  rcpt := case when m.sender = t.user_a then t.user_b when m.sender = t.user_b then t.user_a else null end;
  if rcpt is null then return null; end if;
  return jsonb_build_object(
    'message_id', m.id,
    'sender', m.sender,
    'recipient', rcpt,
    'sent_at', m.created_at,
    'sender_banned', coalesce((select p.banned_at is not null from public.profiles p where p.user_id = m.sender), true),
    'recipient_banned', coalesce((select p.banned_at is not null from public.profiles p where p.user_id = rcpt), true),
    'blocked', exists (
      select 1 from public.blocks b
      where (b.blocker = m.sender and b.blocked = rcpt) or (b.blocker = rcpt and b.blocked = m.sender)
    ),
    -- null : pas de ligne de préférences = pas d'alerte.
    'prefs_messages', (select np.messages from public.notification_prefs np where np.user_id = rcpt),
    -- Dernier message du même expéditeur dans cette conversation avant celui-ci (pour ne pas alerter dix fois de suite).
    'previous_at', (
      select max(x.created_at) from public.messages x
      where x.thread_id = m.thread_id and x.sender = m.sender and x.id <> m.id and x.created_at < m.created_at
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth) order by s.created_at)
      from public.push_subscriptions s where s.user_id = rcpt
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.neighbors_push_facts(uuid) from public, anon, authenticated;
grant execute on function public.neighbors_push_facts(uuid) to service_role;

-- ============================================================
-- 4. Droits : colonne par colonne
-- ============================================================
-- (Supabase accorde tout par défaut aux nouvelles tables : on retire d'abord.)
revoke all on public.push_subscriptions, public.notification_prefs from public, anon, authenticated;

-- Abonnements : on ajoute et on retire les siens. On ne lit JAMAIS les clés (p256dh, auth) : seulement l'adresse et la date.
-- user_id n'est pas accordé : il vaut toujours le compte connecté. Pas de mise à jour : on supprime puis on recrée.
grant select (id, endpoint, created_at) on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

-- Préférences : lire, créer et modifier les siennes. user_id n'est pas modifiable.
grant select (messages, nouveautes, evenements) on public.notification_prefs to authenticated;
grant insert (messages, nouveautes, evenements) on public.notification_prefs to authenticated;
grant update (messages, nouveautes, evenements) on public.notification_prefs to authenticated;
-- Pour le « on conflict (user_id) » d'une mise à jour en un seul appel, la colonne user_id doit pouvoir être lue.
grant select (user_id) on public.notification_prefs to authenticated;

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (
  user_id = (select auth.uid())
);
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated with check (
  user_id = (select auth.uid()) and (select public.neighbors_is_member())
);
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (
  user_id = (select auth.uid())
);

drop policy if exists notification_prefs_select on public.notification_prefs;
create policy notification_prefs_select on public.notification_prefs for select to authenticated using (
  user_id = (select auth.uid())
);
drop policy if exists notification_prefs_insert on public.notification_prefs;
create policy notification_prefs_insert on public.notification_prefs for insert to authenticated with check (
  user_id = (select auth.uid()) and (select public.neighbors_is_member())
);
drop policy if exists notification_prefs_update on public.notification_prefs;
create policy notification_prefs_update on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid()) and (select public.neighbors_is_member()))
  with check (user_id = (select auth.uid()) and (select public.neighbors_is_member()));
