// Mesures saisies sur une plante : lecture d'un nombre français, ajout, suppression, comparaison, rappel annuel. Pur.
import { plantSizeAt } from '../engine/growth'
import type { Plant, PlantMeasurement, Species } from '../types'
import { frMeters } from './format'

export const MAX_HEIGHT_M = 60
export const MAX_SPREAD_M = 40
/** Délai avant de proposer de mesurer à nouveau. */
export const REMEASURE_DAYS = 365

/** « 1,5 », « 1.5 », « 1,5 m » → 1.5. Vide ou illisible : undefined. Négatif ou nul : undefined. */
export function parseMeasure(text: string, maxM: number): number | undefined {
  const t = text.trim().replace(/\s*m$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined
  const n = Number(t)
  return n > 0 && n <= maxM ? Math.round(n * 100) / 100 : undefined
}

/** Ajoute une mesure ; une mesure du même jour est remplacée. Triées de la plus récente à la plus ancienne. */
export function addMeasurement(list: PlantMeasurement[] | undefined, m: PlantMeasurement): PlantMeasurement[] {
  const day = m.at.slice(0, 10)
  return [...(list ?? []).filter((x) => x.at.slice(0, 10) !== day), m].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

export const removeMeasurement = (list: PlantMeasurement[] | undefined, at: string): PlantMeasurement[] => (list ?? []).filter((x) => x.at !== at)

/** Taille prévue par le calendrier, sans tenir compte des mesures, et taille après recalage. */
export function expectedVsAdjusted(plant: Plant, species: Species, now: Date) {
  const expected = plantSizeAt({ ...plant, measurements: undefined }, species, now)
  const adjusted = plantSizeAt(plant, species, now)
  return { expected, adjusted }
}

/** « Selon le calendrier, votre pommier devrait mesurer 2,1 m ; vous avez mesuré 1,6 m. » */
export function compareSentence(name: string, expectedM: number, measuredM: number, what: 'de haut' | 'de large' = 'de haut'): string {
  const w = what === 'de haut' ? '' : ' de large'
  return `Selon le calendrier, ${name} devrait mesurer ${frMeters(expectedM)}${w} ; vous avez mesuré ${frMeters(measuredM)}.`
}

/** Écart de plus de 10 % : la prévision change de façon visible. */
export const differs = (expectedM: number, measuredM: number) => expectedM > 0 && Math.abs(measuredM - expectedM) / expectedM > 0.1

/** Vrai si la dernière mesure date de plus d'un an (et que la plante est en place depuis autant). */
export function needsRemeasure(plant: Plant, now: Date): boolean {
  const list = plant.measurements ?? []
  const last = list.map((m) => Date.parse(m.at)).filter(Number.isFinite).sort((a, b) => b - a)[0]
  if (last !== undefined) return now.getTime() - last >= REMEASURE_DAYS * 86400000
  const planted = Date.parse(plant.plantedAt)
  return plant.status === 'en-place' && Number.isFinite(planted) && now.getTime() - planted >= REMEASURE_DAYS * 86400000
}

const KEY = 'pj.remeasure'
export function remindersEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}
export function setRemindersEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* mémoire indisponible */
  }
}
