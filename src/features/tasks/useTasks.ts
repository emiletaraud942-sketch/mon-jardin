import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { isoDate } from '../../lib/dates'
import { useGardenPlants, useStore } from '../../lib/store'
import { fetchWeather } from '../../lib/weather'
import { generateTasks } from '../../engine/tasks'
import type { Garden, GeneratedTask, WeatherBundle } from '../../types'

/** Durée de vie du cache mémoire (alignée sur le cache localStorage de weather.ts). */
const WEATHER_TTL_MS = 3 * 3600 * 1000
/** Données de repli (hors ligne) : on retente après 1 min seulement. */
const STALE_RETRY_MS = 60 * 1000

interface CacheEntry {
  p: Promise<WeatherBundle>
  /** Instant de chargement (ms) ; décalé pour les données périmées afin qu'elles expirent vite. */
  t: number
}
const weatherCache = new Map<string, CacheEntry>()

function loadWeather(center: Garden['center'], force: boolean): Promise<WeatherBundle> {
  const key = `${center.lon.toFixed(2)},${center.lat.toFixed(2)}`
  const hit = weatherCache.get(key)
  if (!force && hit && Date.now() - hit.t < WEATHER_TTL_MS) return hit.p
  const entry: CacheEntry = { p: fetchWeather(center), t: Date.now() }
  weatherCache.set(key, entry)
  entry.p.then(
    (w) => {
      if (w.stale) entry.t = Date.now() - WEATHER_TTL_MS + STALE_RETRY_MS
    },
    () => {
      if (weatherCache.get(key) === entry) weatherCache.delete(key) // purge sur erreur
    },
  )
  return entry.p
}

export function useWeather(garden?: Garden) {
  const [weather, setWeather] = useState<WeatherBundle>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(!!garden)
  const center = garden?.center
  const lon = center?.lon
  const lat = center?.lat
  /** Dernier chargement réussi : instant et jour local. */
  const last = useRef<{ t: number; day: string }>()
  /** Numéro de requête : seule la plus récente met l'état à jour. */
  const seq = useRef(0)
  const needsRetry = useRef(false)

  const load = useCallback(
    (force: boolean) => {
      if (lon == null || lat == null) return
      const id = ++seq.current
      setLoading(true)
      loadWeather({ lon, lat }, force).then(
        (w) => {
          if (id !== seq.current) return
          last.current = { t: Date.now(), day: isoDate() }
          needsRetry.current = !!w.stale
          setWeather(w)
          setError(undefined)
          setLoading(false)
        },
        (e) => {
          if (id !== seq.current) return
          needsRetry.current = true
          setError((e as Error).message)
          setLoading(false)
        },
      )
    },
    [lon, lat],
  )

  useEffect(() => {
    setWeather(undefined)
    setError(undefined)
    last.current = undefined
    needsRetry.current = false
    if (lon == null || lat == null) {
      setLoading(false)
      return
    }
    load(false)
    const onOnline = () => {
      if (needsRetry.current || !last.current || Date.now() - last.current.t > WEATHER_TTL_MS) load(true)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const l = last.current
      // Données de plus de 3 h, ou changement de jour pendant que l'appli dormait (re-découpe via le cache).
      if (!l || Date.now() - l.t > WEATHER_TTL_MS || l.day !== isoDate()) load(true)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      seq.current++ // invalide les réponses en vol
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [lon, lat, load])

  return { weather, error, loading }
}

export interface TasksResult {
  tasks: (GeneratedTask & { done?: boolean })[]
  weather?: WeatherBundle
  weatherError?: string
  weatherLoading: boolean
}

/** Calcul des tâches et de la météo d'un jardin (une instance par appel : préférer `useTasks`, qui réutilise celle de l'appli). */
export function useTasksCompute(garden?: Garden): TasksResult {
  const plants = useGardenPlants(garden?.id)
  const tasksDone = useStore((s) => s.tasksDone)
  const { weather, error, loading } = useWeather(garden)
  const tasks = useMemo(() => {
    if (!garden) return []
    try {
      return generateTasks({
        garden,
        plants,
        speciesById: SPECIES_BY_ID,
        weather,
        today: new Date(),
        tasksDone: tasksDone.filter((t) => t.gardenId === garden.id),
      })
    } catch (e) {
      console.error('Moteur de tâches', e)
      return []
    }
  }, [garden, plants, weather, tasksDone])
  return { tasks, weather, weatherError: error, weatherLoading: loading }
}

/** Résultat partagé par l'appli (un seul calcul et une seule météo pour l'accueil, À faire, la fiche plante et Réglages). */
export const TasksContext = createContext<{ gardenId: string | undefined; value: TasksResult } | undefined>(undefined)

/** Le résultat partagé sert-il pour ce jardin ? */
export const canShare = (sharedGardenId: string | undefined, gardenId: string | undefined) => gardenId !== undefined && sharedGardenId === gardenId

export function useTasks(garden?: Garden): TasksResult {
  const shared = useContext(TasksContext)
  const reuse = !!shared && canShare(shared.gardenId, garden?.id)
  // Sans partage (tests, hors fournisseur) : calcul local. Avec partage : ce calcul-ci reste vide.
  const own = useTasksCompute(reuse ? undefined : garden)
  return reuse ? shared.value : own
}
