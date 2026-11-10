// « Inviter une association ou une mairie à publier » : un texte court à envoyer soi-même. Logique pure, testée sans navigateur.
// Même garde-fous que l'invitation de l'appli (`invite.ts`) : rien n'est envoyé par l'appli, aucun contact lu ni demandé,
// aucune donnée personnelle (ni pseudo, ni quartier, ni jardin).
import { inviteUrl } from '../invite'

export const ORGANIZER_INVITE_TITLE = 'PermaJardin : publier vos rendez-vous'

/** Les phrases du message, de 20 mots au plus chacune. */
export const ORGANIZER_INVITE_SENTENCES: readonly string[] = [
  'Bonjour, PermaJardin est une appli gratuite, en français, pour les jardiniers.',
  'Elle montre les ateliers et les rendez-vous près de chez soi.',
  'Les associations, mairies et jardins partagés peuvent y publier les leurs.',
  'Pour cela : ouvrez l’appli, Voisins, Événements, puis « Devenir organisateur ».',
  'Chaque demande est vérifiée avant publication.',
]

/** Le message, suivi de l'adresse du site seulement si `origin` est une adresse web. */
export function organizerInviteText(origin: string | undefined | null): string {
  const text = ORGANIZER_INVITE_SENTENCES.join(' ')
  const url = inviteUrl(origin)
  return url ? `${text}\n${url}` : text
}
