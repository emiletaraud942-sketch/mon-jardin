import { fetchBuildings, fetchParcel, fetchTerrain, type GeocodeResult } from '../../lib/ign'
import { fetchClimate } from '../../lib/weather'
import { polygonArea, toLocal, uid } from '../../lib/geo'
import { frNumber, plural } from '../../lib/format'
import type { Garden, LonLat } from '../../types'

export type StepState = 'attente' | 'en-cours' | 'ok' | 'echec'
export interface Step {
  id: 'parcelle' | 'batiments' | 'relief' | 'climat'
  label: string
  state: StepState
  detail?: string
}

export const INITIAL_STEPS: Step[] = [
  { id: 'parcelle', label: 'Plan de votre terrain', state: 'attente' },
  { id: 'batiments', label: 'Maisons voisines (pour l’ombre)', state: 'attente' },
  { id: 'relief', label: 'Pente du terrain', state: 'attente' },
  { id: 'climat', label: 'Gel et pluie de votre région', state: 'attente' },
]

/** Ce qui manque, ce que l'utilisateur perd : des phrases courtes, sans nom de service. */
export const FAIL_HELP: Record<Step['id'], string> = {
  parcelle: 'Le plan de votre terrain manque. La carte sera cadrée à peu près, sans vérifier les distances avec les voisins.',
  batiments: 'Les maisons voisines manquent. L’ombre qu’elles font ne sera pas calculée.',
  relief: 'La pente du terrain manque. Le terrain sera plat en Vue 3D.',
  climat: 'Le gel et la pluie de votre région manquent. Le calendrier suivra les dates de toute la France.',
}

/** Sources manquantes d'un jardin existant (bandeau « Réessayer »). Le climat n'en fait pas partie : « aucune gelée » est une réponse valide. */
export function missingSources(g: Garden): Step['id'][] {
  const out: Step['id'][] = []
  if (!g.parcel?.length) out.push('parcelle')
  if (g.buildings === undefined) out.push('batiments')
  if (!g.terrain) out.push('relief')
  return out
}

export const SCENE_HALF_SIZE = 40

/**
 * Construit un jardin à partir d'une adresse : chaque source est facultative,
 * un échec n'empêche pas la création (on pourra relancer depuis les réglages).
 */
export async function buildGarden(
  place: GeocodeResult,
  name: string,
  onStep: (id: Step['id'], state: StepState, detail?: string) => void,
  existing?: Garden,
): Promise<Garden> {
  const point: LonLat = { lon: place.lon, lat: place.lat }
  const garden: Garden = existing
    ? { ...existing }
    : { id: uid(), name, address: place.label, center: point, createdAt: new Date().toISOString() }

  onStep('parcelle', 'en-cours')
  try {
    const parcel = await fetchParcel(point)
    if (parcel && parcel.rings[0]?.length) {
      const ring = parcel.rings[0]
      // Nouveau jardin : centré sur la parcelle. Jardin existant : centre conservé pour ne pas décaler les plantes.
      const c = existing
        ? garden.center
        : ring.reduce((a, p) => ({ lon: a.lon + p.lon / ring.length, lat: a.lat + p.lat / ring.length }), { lon: 0, lat: 0 })
      garden.center = c
      garden.parcel = ring.map((p) => toLocal(c, p))
      garden.parcelRefs = [parcel.ref]
      garden.areaM2 = Math.round(parcel.contenanceM2 ?? polygonArea(garden.parcel))
      onStep('parcelle', 'ok', `${frNumber(garden.areaM2, 0)} m²`)
    } else onStep('parcelle', 'echec', 'Aucun terrain trouvé à cette adresse.')
  } catch (e) {
    onStep('parcelle', 'echec', (e as Error).message)
  }

  const center = garden.center
  await Promise.all([
    (async () => {
      onStep('batiments', 'en-cours')
      try {
        const bs = await fetchBuildings(center, SCENE_HALF_SIZE + 20)
        garden.buildings = bs.map((b) => ({ id: b.id, heightM: b.heightM, ring: b.ring.map((p) => toLocal(center, p)) }))
        onStep('batiments', 'ok', bs.length ? plural(bs.length, 'maison ou bâtiment', 'maisons ou bâtiments') + ' autour' : 'aucune maison autour')
      } catch (e) {
        onStep('batiments', 'echec', (e as Error).message)
      }
    })(),
    (async () => {
      onStep('relief', 'en-cours')
      try {
        const { grid, altitudeCenterM } = await fetchTerrain(center, SCENE_HALF_SIZE, 21)
        garden.terrain = grid
        garden.altitudeM = Math.round(altitudeCenterM)
        const span = Math.max(...grid.heights) - Math.min(...grid.heights)
        onStep('relief', 'ok', `altitude ${frNumber(garden.altitudeM, 0)} m · dénivelé ${frNumber(span)} m`)
      } catch (e) {
        onStep('relief', 'echec', (e as Error).message)
      }
    })(),
    (async () => {
      onStep('climat', 'en-cours')
      try {
        const c = await fetchClimate(center)
        garden.lastFrostDoy = c.lastFrostDoy ?? undefined
        garden.firstFrostDoy = c.firstFrostDoy ?? undefined
        onStep('climat', 'ok', `${frNumber(c.rainMmPerYear, 0)} mm de pluie par an · ${c.zone}`)
      } catch (e) {
        onStep('climat', 'echec', (e as Error).message)
      }
    })(),
  ])
  return garden
}
