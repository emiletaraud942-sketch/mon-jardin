// « Partager cet événement » : un texte neutre, sans compte ni position. Logique pure, testée sans navigateur.
// Rien n'est envoyé par l'appli : la personne choisit où va le texte (messagerie, notes, presse-papiers).
import { inviteUrl } from '../invite'
import { checkHttpsUrl, formatEventDate } from './logic'
import type { EventItem } from './types'

export type ShareEvent = Pick<EventItem, 'title' | 'startsAt' | 'endsAt' | 'place' | 'organizerName' | 'signupUrl'>

const oneLine = (s: unknown) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Titre, date en lettres, lieu, organisateur, lien d'inscription https s'il existe.
 * La mention « Trouvé dans l'appli PermaJardin » et l'adresse du site ne sont ajoutées que si `origin` est une adresse web (même règle que l'invitation).
 */
export function buildEventShareText(event: ShareEvent, origin?: string | null, timeZone?: string): string {
  const lines = [oneLine(event.title) || 'Événement']
  const when = formatEventDate(event.startsAt, event.endsAt, timeZone)
  if (when) lines.push(`Quand : ${when}`)
  const place = oneLine(event.place)
  if (place) lines.push(`Où : ${place}`)
  const who = oneLine(event.organizerName)
  if (who) lines.push(`Organisé par ${who}`)
  if (event.signupUrl && checkHttpsUrl(event.signupUrl).ok) lines.push(`Inscription : ${event.signupUrl}`)
  const app = inviteUrl(origin)
  if (app) lines.push('', `Trouvé dans l’appli PermaJardin : ${app}`)
  return lines.join('\n')
}

/** Titre de la feuille de partage du téléphone. */
export const eventShareTitle = (event: Pick<EventItem, 'title'>) => oneLine(event.title) || 'Événement'
