// Événements « Jardinons ! » : données ouvertes de la Métropole Rouen Normandie (agenda OpenAgenda, Licence Ouverte v2.0).
// Lecture seule, par notre proxy /ext/agenda (jamais d'appel direct : la CSP l'interdit). Aucune donnée personnelle n'est envoyée :
// la demande est la même pour tout le monde. Tout texte reçu est nettoyé avant affichage.
import { getJson } from '../../lib/ign'

export const AGENDA_PATH = '/ext/agenda/api/explore/v2.1/catalog/datasets/agenda-metropole-rouen-normandie/records'
export const AGENDA_SOURCE = 'Agenda de la Métropole Rouen Normandie (Licence Ouverte v2.0)'
export const MAX_EVENTS = 12

export interface JardinonsEvent {
  id: string
  title: string
  /** Date en français, telle que publiée (« Mercredi 18 novembre, 18h00 »). */
  when: string
  startsAt: string
  endsAt: string
  place: string
  description: string
  conditions: string
  /** Page de l'événement (https, openagenda.com seulement). */
  url?: string
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&#?\w+;/g, ' ')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** Adresse de l'événement : https vers openagenda.com seulement. */
export function safeEventUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && (u.hostname === 'openagenda.com' || u.hostname.endsWith('.openagenda.com')) ? u.toString() : undefined
  } catch {
    return undefined
  }
}

/** La prochaine séance non terminée : `timings` est une liste JSON de { begin, end } (heure locale avec décalage). */
export function nextSlot(timings: unknown, fallbackBegin: unknown, fallbackEnd: unknown, now: Date): { begin: string; end: string } | undefined {
  let slots: { begin: string; end: string }[] = []
  try {
    const raw = typeof timings === 'string' ? JSON.parse(timings) : timings
    if (Array.isArray(raw)) {
      slots = raw
        .filter((s): s is { begin: string; end: string } => !!s && typeof s.begin === 'string' && typeof s.end === 'string')
        .map((s) => ({ begin: s.begin, end: s.end }))
    }
  } catch {
    /* repli sur les dates globales */
  }
  if (slots.length === 0 && typeof fallbackBegin === 'string' && typeof fallbackEnd === 'string') slots = [{ begin: fallbackBegin, end: fallbackEnd }]
  return slots
    .filter((s) => Number.isFinite(Date.parse(s.begin)) && Number.isFinite(Date.parse(s.end)) && Date.parse(s.end) >= now.getTime())
    .sort((a, b) => Date.parse(a.begin) - Date.parse(b.begin))[0]
}

/** Réponse de l'API (Opendatasoft v2.1) vers des événements affichables : à venir, triés, au plus MAX_EVENTS. */
export function parseJardinons(json: unknown, now: Date = new Date()): JardinonsEvent[] {
  const results = (json as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const out: JardinonsEvent[] = []
  for (const r of results as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') continue
    const title = str(r.title_fr, 160)
    if (!title || !/jardinons/i.test(title + ' ' + str(r.description_fr, 300))) continue
    const slot = nextSlot(r.timings, r.lastdate_begin, r.lastdate_end, now)
    if (!slot) continue
    const id = str(r.uid, 40)
    if (!id) continue
    const place = [str(r.location_name, 100), str(r.location_city, 60)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ')
    out.push({
      id,
      title: title.replace(/^Jardinons ?! ?:? ?/i, '').trim() || title,
      when: str(r.daterange_fr, 120),
      startsAt: new Date(slot.begin).toISOString(),
      endsAt: new Date(slot.end).toISOString(),
      place,
      description: str(r.description_fr, 200),
      conditions: str(r.conditions_fr, 160),
      url: safeEventUrl(r.canonicalurl),
    })
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, MAX_EVENTS)
}

/** Adresse de la demande : événements dont le titre parle de « Jardinons » et qui ne sont pas finis. */
export function jardinonsUrl(): string {
  const select = 'uid,title_fr,canonicalurl,daterange_fr,timings,lastdate_begin,lastdate_end,location_city,location_name,description_fr,conditions_fr'
  const where = 'search(title_fr, "jardinons") AND lastdate_end >= now()'
  return `${AGENDA_PATH}?select=${encodeURIComponent(select)}&where=${encodeURIComponent(where)}&order_by=${encodeURIComponent('firstdate_begin')}&limit=${MAX_EVENTS * 2}`
}

export async function fetchJardinons(signal?: AbortSignal): Promise<JardinonsEvent[]> {
  const json = await getJson<unknown>(jardinonsUrl(), { service: 'L’agenda de la Métropole', signal })
  return parseJardinons(json)
}
