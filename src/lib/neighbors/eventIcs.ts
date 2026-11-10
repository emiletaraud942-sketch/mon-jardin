// « Ajouter à mon calendrier » : un fichier .ics pour UN événement de l'entraide. Logique pure, sans réseau ni navigateur.
// Le rappel est dans le fichier (deux alarmes), pas sur un serveur. Rien de personnel : ni pseudo, ni quartier, ni position.
import { icsEscape, icsFold } from '../icsText'
import { checkHttpsUrl } from './logic'
import type { EventItem } from './types'

/** Durée quand l'événement n'a pas de fin exploitable. */
export const DEFAULT_DURATION_MS = 2 * 3_600_000
/** Longueur maximale de la description reprise dans l'agenda (en caractères). */
export const DESCRIPTION_MAX = 500
export const CHECK_WITH_ORGANIZER = 'Vérifiez les modalités auprès de l’organisateur.'

export type IcsEvent = Pick<EventItem, 'id' | 'title' | 'description' | 'startsAt' | 'endsAt' | 'place' | 'organizerName' | 'signupUrl'>

const pad = (n: number) => String(n).padStart(2, '0')
/** « 20261114T220000Z » : date et heure en UTC. */
export const icsUtc = (d: Date): string =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`

/** Retire les caractères de contrôle et d'orientation : un saut de ligne dans un champ ne doit jamais ouvrir une nouvelle propriété. */
function clean(s: unknown): string {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
}

/** Coupe à `max` caractères, sur une espace si possible, et ajoute « … ». */
export function truncateText(s: string, max = DESCRIPTION_MAX): string {
  const chars = Array.from(s)
  if (chars.length <= max) return s
  const cut = chars.slice(0, max).join('')
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '') + '…'
}

/** Début et fin en dates : sans fin valable (absente, avant ou égale au début), la fin est 2 h après le début. Null si le début est illisible. */
export function eventTimes(e: Pick<IcsEvent, 'startsAt' | 'endsAt'>): { start: Date; end: Date } | null {
  const start = new Date(e.startsAt)
  if (!Number.isFinite(start.getTime())) return null
  const end = new Date(e.endsAt)
  const ok = Number.isFinite(end.getTime()) && end.getTime() > start.getTime()
  return { start, end: ok ? end : new Date(start.getTime() + DEFAULT_DURATION_MS) }
}

/** Texte .ics de l'événement (fins de ligne CRLF), ou null si la date de début est illisible. */
export function buildEventIcs(event: IcsEvent, now: Date = new Date()): string | null {
  const times = eventTimes(event)
  if (!times) return null
  const title = clean(event.title) || 'Événement'
  const url = event.signupUrl && checkHttpsUrl(event.signupUrl).ok ? event.signupUrl : null
  const body = clean(event.description)
  const description = [
    `Organisé par ${clean(event.organizerName) || 'un organisateur'}`,
    body ? truncateText(body) : '',
    url ? `Inscription : ${url}` : '',
    CHECK_WITH_ORGANIZER,
  ]
    .filter(Boolean)
    .join('\n\n')
  const uid = String(event.id).replace(/[^A-Za-z0-9-]/g, '')
  const alarm = (trigger: string, text: string) => ['BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(text)}`, 'END:VALARM']
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PermaJardin//Evenement//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:event-${uid}@permajardin`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(times.start)}`,
    `DTEND:${icsUtc(times.end)}`,
    `SUMMARY:${icsEscape(title)}`,
    ...(clean(event.place) ? [`LOCATION:${icsEscape(clean(event.place))}`] : []),
    `DESCRIPTION:${icsEscape(description)}`,
    ...(url ? [`URL:${url}`] : []),
    ...alarm('-P1D', `Demain : ${title}`),
    ...alarm('-PT1H', `Dans une heure : ${title}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/** « evenement-atelier-de-taille.ics » : lettres sans accent, chiffres et tirets seulement. */
export function eventIcsFilename(title: string): string {
  const slug = clean(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `evenement-${slug || 'rendez-vous'}.ics`
}
