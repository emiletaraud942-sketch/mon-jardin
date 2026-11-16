import type { Plant, Species } from '../types'
import { plantStateAt, type PlantState } from './growth'

// Saison du jardin : voir son jardin fleuri et feuillu même en hiver. Pur, testé dans season.test.ts.
// Un seul choix (Aujourd'hui, Hiver, Printemps, Été, Automne) sert à la carte et aux photos du jardin.

export type SeasonChoice = 'aujourdhui' | 'hiver' | 'printemps' | 'ete' | 'automne'

export interface SeasonInfo {
  id: Exclude<SeasonChoice, 'aujourdhui'>
  label: string
  /** Jour représentatif : le cœur de la saison (floraison du printemps, plein été, couleurs d'automne, plein hiver). */
  month: number
  day: number
  /** « au printemps », « en été »… pour les phrases. */
  phrase: string
}

export const SEASONS: readonly SeasonInfo[] = [
  { id: 'hiver', label: 'Hiver', month: 1, day: 15, phrase: 'en hiver' },
  { id: 'printemps', label: 'Printemps', month: 4, day: 20, phrase: 'au printemps' },
  { id: 'ete', label: 'Été', month: 7, day: 10, phrase: 'en été' },
  { id: 'automne', label: 'Automne', month: 10, day: 20, phrase: 'en automne' },
]

export const SEASON_CHOICES: readonly { id: SeasonChoice; label: string }[] = [{ id: 'aujourdhui', label: 'Aujourd’hui' }, ...SEASONS.map((s) => ({ id: s.id, label: s.label }))]

/** Date (midi, heure locale) qui représente le choix, dans l'année de `now`. « Aujourd'hui » : `now`. */
export function seasonDate(choice: SeasonChoice | undefined, now: Date): Date {
  const s = SEASONS.find((x) => x.id === choice)
  return s ? new Date(now.getFullYear(), s.month - 1, s.day, 12) : now
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * État de la plante pour le rendu. `growthAt` fixe l'âge (taille, stade) ; `seasonAt` fixe la saison (feuilles, fleurs, fruits,
 * teinte d'automne). Sans `seasonAt`, une seule date pilote tout. Les annuelles sont ressemées chaque année :
 * leur cycle suit la saison choisie, y compris dans les années futures.
 */
export function stateAtSeason(plant: Plant, species: Species | undefined, growthAt: Date, seasonAt: Date = growthAt): PlantState {
  const grown = plantStateAt(plant, species, growthAt)
  if (grown.dead || seasonAt.getTime() === growthAt.getTime() || plant.status === 'projet') return grown
  if (species && !species.vivace) {
    // ressemis : l'année de plantation devient celle de la saison affichée
    const planted = new Date(plant.plantedAt)
    const y = seasonAt.getFullYear()
    if (Number.isFinite(planted.getTime()) && y > planted.getFullYear()) {
      const shifted = new Date(planted)
      shifted.setFullYear(y)
      return plantStateAt({ ...plant, plantedAt: isoLocal(shifted), ageAtPlanting: 0, measurements: undefined }, species, seasonAt)
    }
    return plantStateAt(plant, species, seasonAt)
  }
  // Vivace : même âge qu'à growthAt, vu à la saison choisie.
  const start = new Date(seasonAt.getTime() - grown.ageYears * 365.25 * 86400000)
  const s = plantStateAt({ ...plant, plantedAt: isoLocal(start), ageAtPlanting: 0, measurements: undefined }, species, seasonAt)
  return { ...s, heightM: grown.heightM, spreadM: grown.spreadM, ageYears: grown.ageYears, stage: grown.stage }
}

export type Phase = 'fleurs' | 'fruits' | 'automne' | 'nu' | 'bourgeons' | 'feuilles' | 'morte'

/** Ce que l'on voit sur la plante à cette saison (le plus marquant d'abord : fleurs, fruits, couleurs d'automne). */
export function phaseOf(st: PlantState): Phase {
  if (st.dead) return 'morte'
  if (st.flowering >= 0.5) return 'fleurs'
  if (st.fruiting >= 0.5) return 'fruits'
  if (st.autumnTint >= 0.5 && st.leafCover >= 0.2) return 'automne'
  if (st.leafCover < 0.15) return 'nu'
  if (st.leafCover < 0.6) return 'bourgeons'
  return 'feuilles'
}

export const PHASE_LABEL: Record<Phase, string> = {
  fleurs: 'en fleurs',
  fruits: 'avec ses fruits',
  automne: 'aux couleurs d’automne',
  nu: 'sans feuilles',
  bourgeons: 'aux premières feuilles',
  feuilles: 'en feuilles',
  morte: 'morte',
}

const hex = (c: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  const n = m ? parseInt(m[1], 16) : 0x4a8a3a
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** Mélange de deux couleurs (t = 0 : a, t = 1 : b). */
export function mixHex(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * Math.max(0, Math.min(1, t))))
}

const AUTUMN_LEAF = '#d9822b'
const BARE_WOOD = '#8c7a66'

/** Couleur et opacité du houppier sur la carte à cette saison : vert, orange d'automne, bois nu l'hiver, touche de fleur ou de fruit. */
export function canopyLook(st: PlantState, sp: Pick<Species, 'couleur' | 'couleurAccent'> | undefined): { color: string; opacity: number } {
  const base = sp?.couleur ?? '#4a8a3a'
  const accent = sp?.couleurAccent ?? base
  const phase = phaseOf(st)
  if (phase === 'morte') return { color: '#7a6a5a', opacity: 0.25 }
  if (phase === 'nu') return { color: BARE_WOOD, opacity: 0.18 }
  if (phase === 'fleurs') return { color: mixHex(base, accent, 0.55 * st.flowering + 0.2), opacity: 0.45 }
  if (phase === 'fruits') return { color: mixHex(base, accent, 0.45), opacity: 0.45 }
  if (phase === 'automne') return { color: mixHex(base, AUTUMN_LEAF, Math.min(1, st.autumnTint)), opacity: 0.45 }
  if (phase === 'bourgeons') return { color: mixHex(BARE_WOOD, base, st.leafCover * 1.4), opacity: 0.25 + 0.2 * st.leafCover }
  return { color: base, opacity: 0.4 }
}

/** « En hiver : 3 plantes sans feuilles, 1 en feuilles. » : une phrase pour l'écran, jamais plus de 20 mots. */
export function seasonSummary(plants: Plant[], speciesById: Record<string, Species | undefined>, choice: SeasonChoice | undefined, now: Date): string {
  const at = seasonDate(choice, now)
  const counts = new Map<Phase, number>()
  for (const p of plants) {
    if (p.status === 'mort' || p.status === 'projet' || p.status === 'recoltee') continue // une plante récoltée n'est plus en place
    const st = stateAtSeason(p, speciesById[p.speciesId], now, at)
    const ph = phaseOf(st)
    counts.set(ph, (counts.get(ph) ?? 0) + 1)
  }
  const info = SEASONS.find((s) => s.id === choice)
  const head = info ? info.phrase.charAt(0).toUpperCase() + info.phrase.slice(1) : 'Aujourd’hui'
  if (counts.size === 0) return `${head} : aucune plante en place.`
  const order: Phase[] = ['fleurs', 'fruits', 'automne', 'feuilles', 'bourgeons', 'nu', 'morte']
  const parts = order.filter((p) => counts.has(p)).map((p) => `${counts.get(p)} ${PHASE_LABEL[p]}`)
  return `${head} : ${parts.slice(0, 3).join(', ')}.`
}

// ---------- Saison d'une photo (hémisphère nord) ----------

export type SeasonId = Exclude<SeasonChoice, 'aujourdhui'>

/** Mois (1 à 12) -> saison, façon météorologique : hiver déc.-fév., printemps mars-mai, été juin-août, automne sept.-nov. */
export function seasonOfMonth(month: number): SeasonId | undefined {
  if (!Number.isInteger(month) || month < 1 || month > 12) return undefined
  if (month === 12 || month <= 2) return 'hiver'
  if (month <= 5) return 'printemps'
  if (month <= 8) return 'ete'
  return 'automne'
}

/**
 * Date lisible d'une photo : un jour « AAAA-MM-JJ » (midi, heure locale) ou une date ISO avec heure. Sinon `undefined`.
 * Valide = réelle, en 2000 ou après, pas dans le futur (un jour de marge : fuseaux et horloge du téléphone).
 */
export function photoDate(raw: string | undefined, now: Date = new Date()): Date | undefined {
  if (typeof raw !== 'string' || raw.length > 40) return undefined
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(raw)
  const t = d.getTime()
  if (!Number.isFinite(t)) return undefined
  if (day && (d.getMonth() !== Number(day[2]) - 1 || d.getDate() !== Number(day[3]))) return undefined // « 2026-02-30 »
  if (d.getFullYear() < 2000 || t > now.getTime() + 86_400_000) return undefined
  return d
}

/** Saison d'une photo d'après sa date, ou `undefined` sans date valide. */
export function seasonOfPhoto(raw: string | undefined, now: Date = new Date()): SeasonId | undefined {
  const d = photoDate(raw, now)
  return d ? seasonOfMonth(d.getMonth() + 1) : undefined
}

const seasonInfo = (id: SeasonId) => SEASONS.find((s) => s.id === id)!

/** « 12 juin 2026 » (« 1er » pour le premier du mois). */
export function photoDayText(d: Date): string {
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return `${d.getDate() === 1 ? '1er' : d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

/** « Photo prise le 12 juin 2026 (été) : les plantes sont décrites à cette date. » ; `undefined` sans date valide. */
export function photoSeasonPhrase(raw: string | undefined, now: Date = new Date()): string | undefined {
  const d = photoDate(raw, now)
  const id = seasonOfPhoto(raw, now)
  if (!d || !id) return undefined
  return `Photo prise le ${photoDayText(d)} (${seasonInfo(id).label.toLowerCase()}) : les plantes sont décrites à cette date.`
}

/**
 * Ce que l'on voit sur la plante à une saison, en mots (« en fleurs », « sans feuilles »), comme si l'on choisissait cette saison.
 * `undefined` pour une plante prévue ou morte, ou une annuelle pas encore semée à cette saison ; « récoltée » pour une annuelle qui a fini sa saison.
 */
export function plantLabelAtSeason(plant: Plant, species: Species | undefined, now: Date, season: SeasonId): string | undefined {
  if (!species || plant.status === 'projet' || plant.status === 'mort') return undefined
  if (plant.status === 'recoltee') return 'récoltée' // fin de saison : jamais « en fleurs » ni « en feuilles »
  const at = seasonDate(season, now)
  // Une annuelle semée plus tard dans la même année n'existe pas encore à cette saison : on ne dit rien plutôt que « sans feuilles ».
  const planted = new Date(plant.plantedAt)
  if (!species.vivace && Number.isFinite(planted.getTime()) && planted.getFullYear() === at.getFullYear() && at.getTime() < planted.getTime()) return undefined
  return PHASE_LABEL[phaseOf(stateAtSeason(plant, species, now, at))]
}

/** Mention sous une photo du journal : « En hiver : sans feuilles d’ordinaire. » (ou « Photo prise en hiver. » si l'état est inconnu). */
export function journalSeasonNote(raw: string | undefined, plant: Plant, species: Species | undefined, now: Date = new Date()): string | undefined {
  const id = seasonOfPhoto(raw, now)
  if (!id) return undefined
  const phrase = seasonInfo(id).phrase
  const label = plant.status === 'recoltee' ? undefined : plantLabelAtSeason(plant, species, now, id)
  return label ? `${phrase.charAt(0).toUpperCase() + phrase.slice(1)} : ${label} d’ordinaire.` : `Photo prise ${phrase}.`
}
