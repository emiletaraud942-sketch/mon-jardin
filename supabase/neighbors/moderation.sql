-- Modération de l'entraide : requêtes à copier dans Supabase › SQL Editor (compte éditeur uniquement).
-- Les clients n'ont aucun accès à reports/moderation_log : seul l'éditeur les voit.

-- 1) SIGNALEMENTS À TRAITER (à lire chaque jour). Les cas jamais décidés sont en premier.
with r as (
  select target_kind, target_id, count(*) as nb, count(distinct reporter) as personnes,
         min(created_at) as premier_signalement, max(created_at) as dernier_signalement,
         string_agg(distinct reason, ', ') as motifs,
         string_agg(distinct nullif(details, ''), ' | ') as precisions
  from public.reports
  group by target_kind, target_id
)
select r.target_kind as type, r.nb, r.personnes, r.motifs, r.precisions,
       r.premier_signalement, r.dernier_signalement,
       coalesce(p.status, rp.status, ev.status, case when m.id is not null then 'message' end) as statut,
       coalesce(p.title, left(rp.body, 120), ev.title, left(m.body, 120), pr.pseudo) as contenu,
       p.kind as type_annonce, p.category as categorie,   -- categorie : après la migration neighbors_v2 (null pour les anciennes annonces)
       coalesce(p.author, rp.author, ev.organizer, m.sender, r.target_id) as auteur_id,
       coalesce(pa.pseudo, pra.pseudo, pea.pseudo, pma.pseudo, pr.pseudo) as auteur_pseudo,
       r.target_id,
       (select l.action from public.moderation_log l where l.target_kind = r.target_kind and l.target_id = r.target_id order by l.at desc limit 1) as derniere_decision
from r
left join public.posts p on r.target_kind = 'post' and p.id = r.target_id
left join public.replies rp on r.target_kind = 'reply' and rp.id = r.target_id
left join public.events ev on r.target_kind = 'event' and ev.id = r.target_id   -- après la migration neighbors_v4_events
left join public.messages m on r.target_kind = 'message' and m.id = r.target_id
left join public.profiles pr on r.target_kind = 'profile' and pr.user_id = r.target_id
left join public.profiles pa on pa.user_id = p.author
left join public.profiles pra on pra.user_id = rp.author
left join public.profiles pea on pea.user_id = ev.organizer
left join public.profiles pma on pma.user_id = m.sender
order by (select l.at from public.moderation_log l where l.target_kind = r.target_kind and l.target_id = r.target_id order by l.at desc limit 1) nulls first, r.dernier_signalement desc;

-- 2) DÉCISIONS (remplacer l'identifiant ; noter chaque décision dans moderation_log)
-- Masquer une annonce :        update public.posts set status = 'hidden' where id = '<target_id>';
-- Rétablir une annonce :       update public.posts set status = 'open'   where id = '<target_id>';
-- Masquer un événement :       update public.events  set status = 'hidden' where id = '<target_id>';
-- Rétablir un événement :      update public.events  set status = 'open'   where id = '<target_id>';
-- Masquer une réponse :        update public.replies set status = 'hidden' where id = '<target_id>';
-- Rétablir une réponse :       update public.replies set status = 'open'   where id = '<target_id>';
-- Bannir un membre (masque aussitôt ses annonces et réponses, journal automatique) :
--                              update public.profiles set banned_at = now() where user_id = '<auteur_id>';
-- Lever un bannissement :      update public.profiles set banned_at = null where user_id = '<auteur_id>';
-- Journal d'une décision (action : hide, restore, delete, warn, dismiss, legal_request, other) :
--   insert into public.moderation_log (action, target_kind, target_id, reason) values ('hide', 'post', '<target_id>', 'motif court, sans recopier le contenu');

-- 3) HISTORIQUE DES DÉCISIONS
-- select at, actor, action, target_kind, target_id, reason from public.moderation_log order by at desc limit 100;

-- 4) ORGANISATEURS D'ÉVÉNEMENTS (après la migration neighbors_v4_events)
-- Seuls les organisateurs VALIDÉS publient des événements. Une demande arrive avec verified_at vide ; vous seul la validez.
-- Demandes à examiner (les plus anciennes d'abord). Vérifiez que le nom correspond à une association ou une personne réelle
-- (site, mairie, annuaire des associations), puis validez. Sans certitude : ne validez pas, répondez par e-mail.
select o.user_id, o.name as nom_public, o.description, o.created_at as demande_le, pr.pseudo, pr.cell_lat, pr.cell_lon
from public.organizers o join public.profiles pr on pr.user_id = o.user_id
where o.verified_at is null and pr.banned_at is null
order by o.created_at;

-- Organisateurs validés, avec leur nombre d'événements à venir :
-- select o.user_id, o.name, o.verified_at, pr.pseudo,
--        (select count(*) from public.events e where e.organizer = o.user_id and e.status = 'open' and e.ends_at > now()) as a_venir
-- from public.organizers o join public.profiles pr on pr.user_id = o.user_id
-- where o.verified_at is not null order by o.verified_at desc;

-- Valider un organisateur (journal écrit automatiquement) :
--   update public.organizers set verified_at = now() where user_id = '<user_id>';
-- Retirer un organisateur (ses événements sont masqués aussitôt, journal écrit automatiquement) :
--   update public.organizers set verified_at = null where user_id = '<user_id>';
-- Refuser une demande sans réponse favorable : la personne peut retirer sa demande elle-même. Pour la retirer vous-même :
--   delete from public.organizers where user_id = '<user_id>';   -- efface aussi ses événements

-- 5) ÉVÉNEMENTS À VENIR ET MASQUÉS
-- select e.id, e.title, e.starts_at, e.place, e.status, e.interest_count, o.name as organisateur
-- from public.events e join public.organizers o on o.user_id = e.organizer
-- where e.ends_at > now() order by e.starts_at limit 100;
-- Masquer / rétablir : voir « Décisions » ci-dessus. Journal : insert into public.moderation_log (action, target_kind, target_id, reason) values ('hide', 'event', '<id>', 'motif court');
