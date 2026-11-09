// Climat du jardin : phrase d'affichage, zone de rusticité, repérage de la France métropolitaine.
import type { Garden, LonLat, Species } from '../types'
import { winterVerdict, type WinterVerdict } from './planting'

/** Nombre à la française : 1 200 (espace insécable). */
const frInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** « Rusticité USDA 8a » (sortie de `usdaZone`) ou « 8a » → « 8a ». `undefined` si le format est inconnu. */
export function zoneCode(zone: string | undefined): string | undefined {
  const m = /^(?:Rusticité USDA\s+)?(\d{1,2}[ab])$/i.exec((zone ?? '').trim())
  return m ? m[1].toLowerCase() : undefined
}

/**
 * Phrase simple sur le climat enregistré : « Votre jardin : zone 8a, environ 650 mm de pluie par an ».
 * La pluie est arrondie à 10 mm. `short` : sans « Votre jardin : ». `undefined` si le jardin n'a ni zone ni pluie (ancien jardin, calcul en échec).
 */
export function climateSummary(garden: Pick<Garden, 'climateZone' | 'rainMmPerYear'>, opts: { short?: boolean } = {}): string | undefined {
  const parts: string[] = []
  const zone = zoneCode(garden.climateZone)
  if (zone) parts.push(`zone ${zone}`)
  const rain = garden.rainMmPerYear
  if (rain != null && Number.isFinite(rain) && rain >= 0) parts.push(`environ ${frInt(Math.round(rain / 10) * 10)} mm de pluie par an`)
  if (!parts.length) return undefined
  // Forme courte, pour la carte « Chez … » de l'accueil où le mot « jardin » est déjà dit : « Zone 8a, environ 650 mm de pluie par an ».
  if (opts.short) return `${parts.join(', ').replace(/^./, (c) => c.toUpperCase())}`
  return `Votre jardin : ${parts.join(', ')}`
}

/** Nombre signé avec un vrai signe moins : −8. */
const signed = (n: number) => (Math.round(n) < 0 ? `−${Math.abs(Math.round(n))}` : String(Math.round(n)))

const WINTER_LABEL: Record<WinterVerdict, string> = { oui: 'Oui', proteger: 'À protéger', non: 'Non, pas sans abri' }

/**
 * « Passe l'hiver chez vous ? » pour la fiche d'une plante : un mot (oui, à protéger, non) et une phrase en mots simples.
 * Même règle de rusticité que « Où planter ? » (`winterVerdict`, planting.ts) : froid supporté contre le froid observé sur 5 ans
 * (`Garden.minAbsC`) ou, à défaut, estimé d'après les dernières gelées (`lastFrostDoy`).
 * Rien (`undefined`) pour une plante à semer chaque année, un jardin sans donnée de froid, ou hors France métropolitaine :
 * ces conseils n'y sont pas calibrés, on ne promet rien.
 */
export function winterAdvice(
  species: Pick<Species, 'vivace' | 'rusticiteC'>,
  garden: Pick<Garden, 'center' | 'minAbsC' | 'lastFrostDoy'>,
): { verdict: WinterVerdict; label: string; sentence: string } | undefined {
  if (!isMetropolitan(garden.center)) return undefined
  const w = winterVerdict(species, garden)
  if (!w) return undefined
  const supports = `Elle supporte ${signed(species.rusticiteC)} °C`
  const here = w.observed
    ? `votre hiver le plus froid, sur 5 ans, est descendu à ${signed(w.tMinC)} °C`
    : `vos hivers descendent vers ${signed(w.tMinC)} °C (estimation)`
  const tail =
    w.verdict === 'oui' ? '' : w.verdict === 'proteger' ? ' Prévoyez un voile ou un pot à rentrer.' : " Gardez-la en pot, à rentrer l'hiver."
  return { verdict: w.verdict, label: WINTER_LABEL[w.verdict], sentence: `${supports} ; ${here}.${tail}` }
}

// Contour grossier de la France continentale (lon, lat), mer comprise à quelques dizaines de km : sert à dire
// « conseils prévus pour la France métropolitaine », pas à tracer une frontière (précision ≈ 10 à 20 km près des frontières).
const MAINLAND: [number, number][] = [
  [2.55, 51.1], [3.0, 50.8], [3.6, 50.45], [4.2, 50.25], [4.8, 50.15], [4.85, 49.75], [5.5, 49.5], [6.4, 49.45], [7.0, 49.15],
  [8.2, 49.0], [7.6, 47.6], [6.95, 47.35], [6.1, 46.3], [6.95, 45.9], [7.1, 45.1], [7.7, 44.2], [7.6, 43.75],
  [3.2, 42.4], [1.75, 42.45], [0.7, 42.8], [-0.7, 43.05], [-1.8, 43.35],
  [-2.3, 43.4], [-2.1, 46.0], [-3.2, 47.1], [-4.0, 47.4], [-5.3, 48.3], [-4.6, 48.9], [-2.0, 48.9], [-2.0, 49.8], [0.2, 49.8], [1.5, 50.3], [2.0, 51.1],
]
const CORSICA = { lonMin: 8.45, lonMax: 9.7, latMin: 41.3, latMax: 43.1 }

function inPolygon(lon: number, lat: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Le point est-il en France métropolitaine (continent ou Corse) ? Outre-mer et pays voisins : non. Approximatif près des frontières. */
export function isMetropolitan(center: LonLat): boolean {
  const { lon, lat } = center
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false
  if (lon >= CORSICA.lonMin && lon <= CORSICA.lonMax && lat >= CORSICA.latMin && lat <= CORSICA.latMax) return true
  return inPolygon(lon, lat, MAINLAND)
}
