import { gpsQuality } from '../../lib/calibration'
import { toLocal } from '../../lib/geo'
import type { LonLat, XY } from '../../types'
import { averageFixes } from '../../lib/calibration'

// Logique pure du GPS (sans DOM) : problèmes possibles, messages simples, moyenne d'un relevé.

export type GpsProblem = 'refuse' | 'indisponible' | 'delai' | 'non-securise' | 'absent'

export interface GpsFix {
  lat: number
  lon: number
  accuracy: number
}

/** Signal d'ensemble : la pire valeur retenue pour ne pas promettre trop. */
export type Quality = 'bonne' | 'moyenne' | 'faible'

/** Code d'erreur de `GeolocationPositionError` (1 refus, 2 indisponible, 3 délai). */
export function problemFromCode(code: number | undefined): GpsProblem {
  if (code === 1) return 'refuse'
  if (code === 3) return 'delai'
  return 'indisponible'
}

/** L'appareil peut-il demander la position ? Le GPS exige une adresse sécurisée (https). */
export function gpsSupport(env: { secure: boolean; hasGeolocation: boolean }): GpsProblem | undefined {
  if (!env.hasGeolocation) return 'absent'
  if (!env.secure) return 'non-securise'
  return undefined
}

/** Message simple, puis le détail technique (replié à l'écran sous « Détails »). */
export function gpsMessage(p: GpsProblem): { message: string; detail: string; help?: string } {
  switch (p) {
    case 'refuse':
      return {
        message: 'La position est refusée sur ce téléphone.',
        help: 'Autorisez la position pour PermaJardin dans les réglages du navigateur, puis réessayez.',
        detail: 'Erreur PERMISSION_DENIED : le navigateur a bloqué l’accès à la géolocalisation pour ce site.',
      }
    case 'indisponible':
      return {
        message: 'Le téléphone ne trouve pas votre position.',
        help: 'Allez à l’extérieur, loin des murs, et vérifiez que la localisation est activée.',
        detail: 'Erreur POSITION_UNAVAILABLE : aucun signal GPS ou réseau n’a pu fournir de position.',
      }
    case 'delai':
      return {
        message: 'Le téléphone met trop de temps à trouver votre position.',
        help: 'Attendez quelques secondes à l’extérieur, puis réessayez.',
        detail: 'Erreur TIMEOUT : aucune mesure reçue dans le délai prévu.',
      }
    case 'non-securise':
      return {
        message: 'Le GPS ne marche pas sur cette adresse.',
        help: 'Ouvrez PermaJardin depuis son adresse officielle, qui commence par https.',
        detail: 'Contexte non sécurisé (HTTP) : les navigateurs réservent la géolocalisation aux pages en HTTPS ou sur localhost.',
      }
    case 'absent':
      return {
        message: 'Cet appareil ne sait pas donner sa position.',
        help: 'Essayez avec un téléphone récent, ou placez vos plantes en touchant la carte.',
        detail: 'navigator.geolocation est absent de ce navigateur.',
      }
  }
}

/** Relevés bruts → points locaux (x = est, y = nord), en écartant les mesures trop vagues. */
export function fixesToLocal(center: LonLat, fixes: GpsFix[], maxAccuracyM = 200): { x: number; y: number; accuracy: number }[] {
  return fixes.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && f.accuracy <= maxAccuracyM).map((f) => ({ ...toLocal(center, { lon: f.lon, lat: f.lat }), accuracy: f.accuracy }))
}

export interface Sample {
  x: number
  y: number
  /** Dispersion des relevés (m). */
  spreadM: number
  /** Précision annoncée par le téléphone, en moyenne (m). */
  accuracyM: number
  quality: Quality
  n: number
}

/** Résume un relevé de quelques secondes. `undefined` si aucune mesure utilisable. */
export function summarizeFixes(center: LonLat, fixes: GpsFix[]): Sample | undefined {
  const pts = fixesToLocal(center, fixes)
  if (pts.length === 0) return undefined
  const avg = averageFixes(pts)
  const accuracyM = pts.reduce((s, p) => s + p.accuracy, 0) / pts.length
  return { x: avg.x, y: avg.y, spreadM: avg.spreadM, accuracyM, quality: gpsQuality(accuracyM), n: pts.length }
}

export const QUALITY_LABEL: Record<Quality, string> = { bonne: 'Signal bon', moyenne: 'Signal moyen', faible: 'Signal faible' }
export const QUALITY_HELP: Record<Quality, string> = {
  bonne: 'Vous pouvez continuer.',
  moyenne: 'Ça peut aller. Un endroit plus dégagé serait mieux.',
  faible: 'Éloignez-vous des murs et des arbres, puis recommencez.',
}
