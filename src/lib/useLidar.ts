// Branchement du LiDAR HD (IGN) : un seul chargement par jardin, partagé entre Réglages, Où planter ? et la 3D.
// Local-first : le cache IndexedDB (90 jours) de fetchLidar évite tout nouvel appel réseau ; la case des Réglages
// désactive tout (aucune requête). Si le service est indisponible, l'état passe à « unavailable » sans bruit :
// les écrans gardent le relief RGE ALTI et les seules ombres des bâtiments et des plantes.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { Garden, LonLat, Plant, TerrainGrid } from '../types'
import { filterTrees, fetchLidar, lidarCacheKey, type DetectedTree, type LidarData } from './lidar'
import { chooseTerrain } from './terrain'

export type LidarStatus = 'idle' | 'loading' | 'ok' | 'unavailable'
export interface LidarState {
  status: LidarStatus
  data: LidarData | null
  /** Détail technique (replié dans l'interface), s'il existe. */
  detail?: string
}
const IDLE: LidarState = { status: 'idle', data: null }

/** Demi-côté de la zone demandée (m) : une fois par jardin, quel que soit l'écran. */
export const LIDAR_HALF_SIZE_M = 60

// ---------- Réglage « Utiliser les arbres des environs » (état d'interface, localStorage) ----------

export const LIDAR_PREF_KEY = 'pj.lidar'
/** Activé par défaut ; seule la valeur « 0 » le désactive. */
export function parseLidarPref(raw: string | null | undefined): boolean {
  return raw !== '0'
}
function readPref(): boolean {
  try {
    return parseLidarPref(localStorage.getItem(LIDAR_PREF_KEY))
  } catch {
    return true
  }
}
let enabled = readPref()
const prefListeners = new Set<() => void>()
export function lidarEnabled(): boolean {
  return enabled
}
export function setLidarEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(LIDAR_PREF_KEY, on ? '1' : '0')
  } catch {
    /* mémoire indisponible : le réglage ne dure que pour cette session */
  }
  prefListeners.forEach((l) => l())
}
export function useLidarEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      prefListeners.add(l)
      return () => prefListeners.delete(l)
    },
    () => enabled,
  )
}

// ---------- Mémoire des chargements (logique pure, testée avec un faux fetchLidar) ----------

type Fetcher = typeof fetchLidar

export function createLidarStore(fetcher: Fetcher = fetchLidar) {
  const states = new Map<string, LidarState>()
  const inflight = new Map<string, Promise<LidarState>>()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const set = (key: string, s: LidarState) => {
    states.set(key, s)
    emit()
  }

  return {
    keyOf: (center: LonLat) => lidarCacheKey(center, LIDAR_HALF_SIZE_M),
    get: (key: string): LidarState => states.get(key) ?? IDLE,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    /** Charge une fois par jardin et par session (réussite ou échec). `force` : bouton « Actualiser », ignore le cache. */
    load(center: LonLat, opts: { force?: boolean } = {}): Promise<LidarState> {
      const key = lidarCacheKey(center, LIDAR_HALF_SIZE_M)
      const running = inflight.get(key)
      if (running) return running
      const known = states.get(key)
      if (!opts.force && known && (known.status === 'ok' || known.status === 'unavailable')) return Promise.resolve(known)
      set(key, { status: 'loading', data: known?.data ?? null })
      let detail: string | undefined
      const p = (async (): Promise<LidarState> => {
        try {
          const data = await fetcher(center, { halfSizeM: LIDAR_HALF_SIZE_M, force: opts.force, onWarning: (_m, d) => (detail = d) })
          const next: LidarState = data ? { status: 'ok', data } : { status: 'unavailable', data: null, detail }
          set(key, next)
          return next
        } catch (e) {
          const next: LidarState = { status: 'unavailable', data: null, detail: e instanceof Error ? e.message : undefined }
          set(key, next)
          return next
        } finally {
          inflight.delete(key)
        }
      })()
      inflight.set(key, p)
      return p
    },
    clear() {
      states.clear()
      inflight.clear()
      emit()
    },
  }
}
export const lidarStore = createLidarStore()

// ---------- Messages en langage simple ----------

export function lidarMessage(state: Pick<LidarState, 'status'>, treeCount: number): string {
  if (state.status === 'unavailable') return 'Données indisponibles ici, on garde le relief habituel.'
  if (state.status === 'loading') return 'Recherche des arbres autour de votre terrain…'
  if (state.status === 'ok') {
    if (treeCount === 0) return 'Aucun arbre trouvé autour de votre terrain.'
    return `${treeCount} arbre${treeCount > 1 ? 's' : ''} ${treeCount > 1 ? 'trouvés' : 'trouvé'} autour de votre terrain.`
  }
  return ''
}

// ---------- Hooks ----------

export interface UseLidar extends LidarState {
  enabled: boolean
  /** Relance en ignorant le cache. */
  refresh: () => Promise<LidarState>
}

/** État du LiDAR du jardin. Lance le chargement (cache d'abord) si le réglage est actif ; sinon `idle`, sans requête. */
export function useLidar(garden: Pick<Garden, 'center'> | undefined): UseLidar {
  const on = useLidarEnabled()
  const center = garden?.center
  const lat = center?.lat
  const lon = center?.lon
  const key = lat != null && lon != null ? lidarStore.keyOf({ lat, lon }) : ''
  const state = useSyncExternalStore(lidarStore.subscribe, () => (key ? lidarStore.get(key) : IDLE))
  useEffect(() => {
    if (on && lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) void lidarStore.load({ lat, lon })
  }, [on, lat, lon])
  const refresh = useCallback(async () => {
    if (lat == null || lon == null) return IDLE
    return lidarStore.load({ lat, lon }, { force: true })
  }, [lat, lon])
  return on ? { ...state, enabled: on, refresh } : { ...IDLE, enabled: on, refresh }
}

export interface LidarScene {
  status: LidarStatus
  detail?: string
  enabled: boolean
  refresh: () => Promise<LidarState>
  /** Arbres des environs à simuler et dessiner (hors bâtiments connus et plantes du jardin). */
  trees: DetectedTree[]
  /** Relief à utiliser pour l'affichage et les pentes (dérivé en mémoire, jamais écrit dans le jardin). */
  terrain: TerrainGrid | undefined
  terrainSource: 'rge' | 'lidar' | 'none'
  /** Le jardin avec le relief d'affichage (même objet s'il ne change pas). */
  gardenView: Garden
}

/** Arbres filtrés + relief choisi, prêts pour les ombres (Où planter ?, 3D) et l'affichage. */
export function useLidarScene(garden: Garden, plants: Plant[]): LidarScene {
  const l = useLidar(garden)
  const plantPositions = useMemo(() => plants.map((p) => p.position), [plants])
  const filtered = useMemo(
    () => (l.data ? filterTrees(l.data.trees, { buildingRings: (garden.buildings ?? []).map((b) => b.ring), plantPositions }) : []),
    [l.data, garden.buildings, plantPositions],
  )
  // Même liste (même contenu) = même objet : les ombres ne sont pas recalculées pour rien.
  const stable = useRef<{ key: string; list: DetectedTree[] }>({ key: '', list: [] })
  const key = filtered.map((t) => `${t.x},${t.y},${t.heightM},${t.radiusM}`).join('|')
  if (stable.current.key !== key) stable.current = { key, list: filtered }
  const trees = stable.current.list
  const picked = useMemo(() => chooseTerrain(garden.terrain, l.data?.terrain), [garden.terrain, l.data])
  const gardenView = useMemo(() => (picked.grid === garden.terrain ? garden : { ...garden, terrain: picked.grid }), [garden, picked])
  return { status: l.status, detail: l.detail, enabled: l.enabled, refresh: l.refresh, trees, terrain: picked.grid, terrainSource: picked.source, gardenView }
}
