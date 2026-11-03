// Climat du jardin : phrase d'affichage et repérage de la France métropolitaine.
import type { Garden, LonLat } from '../types'

/** Nombre à la française : 1 200 (espace insécable). */
const frInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/**
 * Phrase simple sur le climat enregistré : « Votre jardin : zone 8a, environ 650 mm de pluie par an ».
 * La pluie est arrondie à 10 mm. `undefined` si le jardin n'a aucun climat (ancien jardin, calcul en échec).
 */
export function climateSummary(garden: Pick<Garden, 'climate'>): string | undefined {
  const c = garden.climate
  if (!c) return undefined
  const parts: string[] = []
  if (c.zone) parts.push(`zone ${c.zone}`)
  if (c.rainMmPerYear != null && Number.isFinite(c.rainMmPerYear) && c.rainMmPerYear >= 0) {
    parts.push(`environ ${frInt(Math.round(c.rainMmPerYear / 10) * 10)} mm de pluie par an`)
  }
  return parts.length ? `Votre jardin : ${parts.join(', ')}` : undefined
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
