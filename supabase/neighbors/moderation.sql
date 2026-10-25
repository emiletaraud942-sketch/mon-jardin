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
       coalesce(p.status, rp.status, case when m.id is not null then 'message' end) as statut,
       coalesce(p.title, left(rp.body, 120), left(m.body, 120), pr.pseudo) as contenu,
       p.kind as type_annonce, p.category as categorie,   -- categorie : après la migration neighbors_v2 (null pour les anciennes annonces)
       coalesce(p.author, rp.author, m.sender, r.target_id) as auteur_id,
       coalesce(pa.pseudo, pra.pseudo, pma.pseudo, pr.pseudo) as auteur_pseudo,
       r.target_id,
       (select l.action from public.moderation_log l where l.target_kind = r.target_kind and l.target_id = r.target_id order by l.at desc limit 1) as derniere_decision
from r
left join public.posts p on r.target_kind = 'post' and p.id = r.target_id
left join public.replies rp on r.target_kind = 'reply' and rp.id = r.target_id
left join public.messages m on r.target_kind = 'message' and m.id = r.target_id
left join public.profiles pr on r.target_kind = 'profile' and pr.user_id = r.target_id
left join public.profiles pa on pa.user_id = p.author
left join public.profiles pra on pra.user_id = rp.author
left join public.profiles pma on pma.user_id = m.sender
order by (select l.at from public.moderation_log l where l.target_kind = r.target_kind and l.target_id = r.target_id order by l.at desc limit 1) nulls first, r.dernier_signalement desc;

-- 2) DÉCISIONS (remplacer l'identifiant ; noter chaque décision dans moderation_log)
-- Masquer une annonce :        update public.posts set status = 'hidden' where id = '<target_id>';
-- Rétablir une annonce :       update public.posts set status = 'open'   where id = '<target_id>';
-- Masquer une réponse :        update public.replies set status = 'hidden' where id = '<target_id>';
-- Rétablir une réponse :       update public.replies set status = 'open'   where id = '<target_id>';
-- Bannir un membre (masque aussitôt ses annonces et réponses, journal automatique) :
--                              update public.profiles set banned_at = now() where user_id = '<auteur_id>';
-- Lever un bannissement :      update public.profiles set banned_at = null where user_id = '<auteur_id>';
-- Journal d'une décision (action : hide, restore, delete, warn, dismiss, legal_request, other) :
--   insert into public.moderation_log (action, target_kind, target_id, reason) values ('hide', 'post', '<target_id>', 'motif court, sans recopier le contenu');

-- 3) HISTORIQUE DES DÉCISIONS
-- select at, actor, action, target_kind, target_id, reason from public.moderation_log order by at desc limit 100;
