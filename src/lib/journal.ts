// Journal d'une plante : photos datées, notes, durées « il y a N mois ». Fonctions pures, testées dans journal.test.ts.
// Le format stocké est `Plant.photoMeta` (champ facultatif : une plante sans journal n'a rien de plus à stocker).
import type { PhotoMeta } from '../types'
import { cleanLine, isPhotoId } from './security/sanitize'

/** Longueur maximale de la note d'une photo. */
export const JOURNAL_NOTE_MAX = 140

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** Jour local « AAAA-MM-JJ » qui existe vraiment (« 2026-02-30 » est refusé). */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = DAY_RE.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (y < 1900 || y > 2200) return false
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

/** Note d'une photo : une ligne, sans caractères invisibles, 140 caractères au plus. Texte vide = pas de note. */
export function cleanNote(raw: string): string {
  return cleanLine(raw, JOURNAL_NOTE_MAX)
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Valide un journal lu d'un fichier, du stockage ou d'une synchro : une entrée par photo de `photos` au plus, date réelle
 * (une date-heure est ramenée au jour), note nettoyée. Une entrée sans date ni note, ou dont la photo n'existe pas, est retirée.
 * `dropped` compte ce qui a été écarté ou corrigé (pour le rapport de chargement).
 */
export function sanitizePhotoMeta(raw: unknown, photos: readonly string[]): { meta?: Record<string, PhotoMeta>; dropped: number } {
  if (raw === undefined || raw === null) return { dropped: 0 }
  if (!isRec(raw)) return { dropped: 1 }
  const own = new Set(photos)
  const meta: Record<string, PhotoMeta> = {}
  let dropped = 0
  for (const key of Object.keys(raw)) {
    const v = raw[key]
    if (!isPhotoId(key) || !own.has(key) || !isRec(v)) {
      dropped++
      continue
    }
    const entry: PhotoMeta = {}
    if (typeof v.at === 'string') {
      const day = v.at.slice(0, 10)
      if (isDay(day) && (v.at.length === 10 || v.at[10] === 'T')) entry.at = day
      else dropped++
    } else if (v.at !== undefined) dropped++
    if (typeof v.note === 'string') {
      const note = cleanNote(v.note)
      if (note) entry.note = note
      if (cleanLine(v.note, Infinity) !== note) dropped++ // note trop longue : coupée
    } else if (v.note !== undefined) dropped++
    if (entry.at === undefined && entry.note === undefined) continue
    meta[key] = entry
  }
  return { meta: Object.keys(meta).length > 0 ? meta : undefined, dropped }
}

/** Journal sans les entrées dont la photo n'existe plus ; `undefined` s'il ne reste rien. */
export function pruneMeta(meta: Record<string, PhotoMeta> | undefined, photos: readonly string[]): Record<string, PhotoMeta> | undefined {
  if (!meta) return undefined
  const keep = new Set(photos)
  const out: Record<string, PhotoMeta> = {}
  for (const k of Object.keys(meta)) if (keep.has(k)) out[k] = meta[k]
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Journal avec la date et la note d'une photo changées. `null` efface le champ (date inconnue, pas de note) ; `undefined` ne le touche pas.
 * Rend `undefined` quand le journal est vide : le champ disparaît de la plante.
 */
export function withPhotoMeta(meta: Record<string, PhotoMeta> | undefined, id: string, patch: { at?: string | null; note?: string | null }): Record<string, PhotoMeta> | undefined {
  const out: Record<string, PhotoMeta> = { ...(meta ?? {}) }
  const entry: PhotoMeta = { ...(out[id] ?? {}) }
  if (patch.at === null) delete entry.at
  else if (patch.at !== undefined && isDay(patch.at)) entry.at = patch.at
  if (patch.note === null) delete entry.note
  else if (patch.note !== undefined) {
    const note = cleanNote(patch.note)
    if (note) entry.note = note
    else delete entry.note
  }
  if (entry.at === undefined && entry.note === undefined) delete out[id]
  else out[id] = entry
  return Object.keys(out).length > 0 ? out : undefined
}

export interface JournalEntry {
  id: string
  /** Jour de la photo ; absent = date inconnue. */
  at?: string
  note?: string
}

/**
 * Entrées du journal : les plus récentes d'abord, les photos sans date à la fin.
 * À date égale (ou sans date), l'ordre d'origine de `photos` est gardé.
 */
export function journalEntries(photos: readonly string[], meta?: Record<string, PhotoMeta>): JournalEntry[] {
  const all = photos.map((id, i) => ({ id, i, at: meta?.[id]?.at, note: meta?.[id]?.note }))
  all.sort((a, b) => {
    if (a.at && b.at) return a.at === b.at ? a.i - b.i : a.at < b.at ? 1 : -1
    if (a.at) return -1
    if (b.at) return 1
    return a.i - b.i
  })
  return all.map(({ id, at, note }) => ({ id, ...(at ? { at } : {}), ...(note ? { note } : {}) }))
}

/** Les deux photos proposées d'abord pour comparer : la plus ancienne datée et la plus récente ; sans deux dates, la dernière de la liste (souvent sans date) et la première. */
export function defaultPair(entries: readonly JournalEntry[]): { before: string; after: string } | undefined {
  if (entries.length < 2) return undefined
  const dated = entries.map((e, i) => ({ e, i })).filter((x) => x.e.at)
  if (dated.length >= 2) {
    dated.sort((a, b) => (a.e.at! === b.e.at! ? b.i - a.i : a.e.at! < b.e.at! ? -1 : 1))
    return { before: dated[0].e.id, after: dated[dated.length - 1].e.id }
  }
  return { before: entries[entries.length - 1].id, after: entries[0].id }
}

// ---------- Durées ----------

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Mois entiers entre deux jours (mois civils : du 15 mars au 14 avril, 0 ; au 15 avril, 1). */
function wholeMonths(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
}

/** « 5 jours », « 3 semaines », « 4 mois », « 1 an », « 2 ans et 3 mois » entre deux jours (le premier avant le second). */
export function durationText(from: string, to: string): string {
  const days = dayNumber(to) - dayNumber(from)
  if (days <= 0) return '0 jour'
  const months = wholeMonths(from, to)
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const rest = months % 12
    return `${years} ${years > 1 ? 'ans' : 'an'}${rest > 0 ? ` et ${rest} mois` : ''}`
  }
  if (months >= 1) return `${months} mois`
  if (days >= 14) return `${Math.floor(days / 7)} semaines`
  return `${days} ${days > 1 ? 'jours' : 'jour'}`
}

/** « aujourd’hui », « hier », « il y a 3 semaines », « il y a 8 mois », « il y a 1 an et 2 mois ». Vide si la date est inconnue, invalide ou à venir. */
export function agoText(day: string | undefined, today: string): string {
  if (!day || !isDay(day) || !isDay(today)) return ''
  const days = dayNumber(today) - dayNumber(day)
  if (days < 0) return ''
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'hier'
  return `il y a ${durationText(day, today)}`
}

/** « 8 mois entre les deux photos ». Vide si l'une des dates manque. */
export function spanText(a: string | undefined, b: string | undefined): string {
  if (!a || !b || !isDay(a) || !isDay(b)) return ''
  const [from, to] = a <= b ? [a, b] : [b, a]
  if (from === to) return 'Les deux photos datent du même jour.'
  return `${durationText(from, to)} entre les deux photos.`
}
