import { cleanLine } from './security/sanitize'

// « Mes graines » : un petit stock de sachets (nom, date de récolte, à donner ou échanger).
// UNE clé localStorage `pj.seeds` (JSON). Cet appareil seulement : rien n'est envoyé, ni synchronisé, ni dans les sauvegardes.
// Module sans React : lecture validée, jamais d'exception.

export const SEEDS_KEY = 'pj.seeds'
export const MAX_SEEDS = 100
const MAX_NAME = 40
const MAX_NOTE = 80
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface Seed {
  id: string
  /** Nom du sachet : une plante du catalogue ou un nom libre (« Haricot de ma grand-mère »). */
  name: string
  /** Jour de récolte ou d'achat (AAAA-MM-JJ), s'il est connu. */
  at?: string
  /** À donner ou échanger. */
  toGive: boolean
  note?: string
  /** Ce qui a été lu sur le sachet (photo) ou saisi : tout est facultatif. */
  info?: SeedInfo
}

/** Informations d'un sachet. Mois de 1 à 12 ; durées et tailles en cm ou en jours. */
export interface SeedInfo {
  /** Espèce du catalogue reconnue. */
  speciesId?: string
  semis?: number[]
  recolte?: number[]
  profondeurCm?: number
  espacementCm?: number
  leveeJours?: number
  soleil?: 'soleil' | 'mi-ombre' | 'ombre'
  hauteurCm?: number
  /** « 2 g », « 100 graines ». */
  contenu?: string
}

const monthsOf = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined
  const out = [...new Set(v.filter((m): m is number => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b)
  return out.length ? out : undefined
}
const numIn = (v: unknown, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? Math.round(v * 10) / 10 : undefined)

/** Valide les informations d'un sachet : formes inconnues et valeurs aberrantes retirées. */
export function sanitizeSeedInfo(raw: unknown): SeedInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const info: SeedInfo = {}
  if (typeof r.speciesId === 'string' && /^[a-z0-9-]{1,40}$/.test(r.speciesId)) info.speciesId = r.speciesId
  const semis = monthsOf(r.semis)
  if (semis) info.semis = semis
  const recolte = monthsOf(r.recolte)
  if (recolte) info.recolte = recolte
  const prof = numIn(r.profondeurCm, 40)
  if (prof !== undefined) info.profondeurCm = prof
  const esp = numIn(r.espacementCm, 500)
  if (esp !== undefined) info.espacementCm = esp
  const levee = numIn(r.leveeJours, 365)
  if (levee !== undefined) info.leveeJours = Math.round(levee)
  if (r.soleil === 'soleil' || r.soleil === 'mi-ombre' || r.soleil === 'ombre') info.soleil = r.soleil
  const haut = numIn(r.hauteurCm, 1000)
  if (haut !== undefined) info.hauteurCm = Math.round(haut)
  if (typeof r.contenu === 'string') {
    const c = cleanLine(r.contenu, 20)
    if (c) info.contenu = c
  }
  return Object.keys(info).length ? info : undefined
}

const realDate = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Valide une liste lue du stockage : formes inconnues ignorées, textes nettoyés, doublons d'identifiant retirés, au plus MAX_SEEDS. */
export function sanitizeSeeds(raw: unknown): Seed[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Seed[] = []
  for (const v of raw.slice(0, MAX_SEEDS * 2)) {
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    const id = typeof r.id === 'string' ? cleanLine(r.id, 40) : ''
    const name = typeof r.name === 'string' ? cleanLine(r.name, MAX_NAME) : ''
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    const seed: Seed = { id, name, toGive: r.toGive === true }
    if (realDate(r.at)) seed.at = r.at
    const note = typeof r.note === 'string' ? cleanLine(r.note, MAX_NOTE) : ''
    if (note) seed.note = note
    const info = sanitizeSeedInfo(r.info)
    if (info) seed.info = info
    out.push(seed)
    if (out.length >= MAX_SEEDS) break
  }
  return out
}

export function parseSeeds(text: string | null | undefined): Seed[] {
  if (!text || text.length > 60_000) return []
  try {
    return sanitizeSeeds(JSON.parse(text))
  } catch {
    return []
  }
}

// Mémoire de la session : sert seulement quand localStorage est absent ou refuse l'écriture.
let memory: Seed[] | undefined
let cache: { raw: string | null; list: Seed[] } | undefined
const listeners = new Set<() => void>()

const rawStored = (): string | null | undefined => {
  try {
    return localStorage.getItem(SEEDS_KEY)
  } catch {
    return undefined
  }
}

/** Les sachets. Même tableau d'un appel à l'autre tant que rien ne change (utilisable avec useSyncExternalStore). */
export function readSeeds(): Seed[] {
  const raw = rawStored()
  if (raw === undefined) return memory ?? EMPTY
  if (raw === null && memory) return memory
  if (cache && cache.raw === raw) return cache.list
  cache = { raw, list: parseSeeds(raw) }
  return cache.list
}
const EMPTY: Seed[] = []

function write(next: Seed[]) {
  memory = undefined
  cache = undefined
  try {
    if (next.length === 0) localStorage.removeItem(SEEDS_KEY)
    else localStorage.setItem(SEEDS_KEY, JSON.stringify(next))
  } catch {
    memory = next
  }
  listeners.forEach((l) => l())
}

export function subscribeSeeds(l: () => void): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent) => {
    if (e.key === SEEDS_KEY || e.key === null) {
      cache = undefined
      l()
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(l)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

let counter = 0
const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`

/** Ajoute un sachet. Renvoie `undefined` si le nom est vide ou si la liste est pleine. */
export function addSeed(input: { name: string; at?: string; toGive?: boolean; note?: string; info?: SeedInfo }): Seed | undefined {
  const list = readSeeds()
  if (list.length >= MAX_SEEDS) return undefined
  const [seed] = sanitizeSeeds([{ id: newId(), name: input.name, at: input.at, toGive: input.toGive, note: input.note, info: input.info }])
  if (!seed) return undefined
  write([seed, ...list])
  return seed
}

export function toggleGive(id: string) {
  write(readSeeds().map((s) => (s.id === id ? { ...s, toGive: !s.toGive } : s)))
}

export function removeSeed(id: string): Seed[] {
  const before = readSeeds()
  write(before.filter((s) => s.id !== id))
  return before
}

/** Remet une liste gardée avant une suppression (annulation). */
export function restoreSeeds(list: readonly Seed[]) {
  write(sanitizeSeeds([...list]))
}

/** Efface tout (« Effacer toutes mes données » retire la clé ; ce bouton sert aux tests et à l'interface). */
export function clearSeeds() {
  write([])
}

/** Texte à partager : ce qu'on peut donner ou échanger (ou tout, s'il n'y a rien à donner). */
export function seedsShareText(list: readonly Seed[], day: Date = new Date()): string {
  const give = list.filter((s) => s.toGive)
  const rows = give.length > 0 ? give : list
  const when = day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const lines = [give.length > 0 ? 'Graines à donner ou échanger' : 'Mes graines', `Liste du ${when}`, '']
  for (const s of rows) {
    const date = s.at ? ` (récolte ${new Date(`${s.at}T00:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })})` : ''
    lines.push(`• ${s.name}${date}${s.note ? ` : ${s.note}` : ''}`)
  }
  return lines.join('\n')
}
