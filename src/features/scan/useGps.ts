import { useCallback, useEffect, useRef, useState } from 'react'
import type { LonLat } from '../../types'
import { gpsSupport, problemFromCode, summarizeFixes, type GpsFix, type GpsProblem, type Sample } from './gps'

export interface GpsState {
  status: 'repos' | 'mesure' | 'ok' | 'erreur'
  /** 0 à 1 pendant la mesure. */
  progress: number
  /** Précision du dernier relevé (m), en direct. */
  accuracy?: number
  sample?: Sample
  problem?: GpsProblem
}

/** Au-delà de ce délai sans aucun relevé, on abandonne. */
const HARD_LIMIT_MS = 20_000

const supportNow = () => gpsSupport({ secure: typeof window !== 'undefined' && window.isSecureContext, hasGeolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator })

/** Autorisation de position déjà donnée ou refusée ? `undefined` si le navigateur ne le dit pas. */
export async function geolocationPermission(): Promise<PermissionState | undefined> {
  try {
    const r = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return r?.state
  } catch {
    return undefined
  }
}

/**
 * Mesure de position de quelques secondes (watchPosition, haute précision), moyennée.
 * La position reste dans l'appareil : elle n'est envoyée nulle part.
 */
export function useGps(center: LonLat) {
  const [state, setState] = useState<GpsState>({ status: 'repos', progress: 0 })
  const centerRef = useRef(center)
  centerRef.current = center
  const stopRef = useRef<() => void>()

  const cancel = useCallback(() => {
    stopRef.current?.()
    stopRef.current = undefined
    setState((s) => (s.status === 'mesure' ? { status: 'repos', progress: 0 } : s))
  }, [])

  useEffect(() => () => stopRef.current?.(), [])

  /** Lance une mesure de `durationMs`. Renvoie le résumé, ou `undefined` en cas d'échec ou d'annulation. */
  const start = useCallback(
    (durationMs = 8000) =>
      new Promise<Sample | undefined>((resolve) => {
        stopRef.current?.()
        const problem = supportNow()
        if (problem) {
          setState({ status: 'erreur', progress: 0, problem })
          resolve(undefined)
          return
        }
        const fixes: GpsFix[] = []
        const t0 = Date.now()
        let lastProblem: GpsProblem | undefined
        let done = false
        setState({ status: 'mesure', progress: 0 })
        const finish = (cancelled: boolean) => {
          if (done) return
          done = true
          navigator.geolocation.clearWatch(id)
          window.clearInterval(timer)
          stopRef.current = undefined
          if (cancelled) return resolve(undefined)
          const sample = summarizeFixes(centerRef.current, fixes)
          if (sample) {
            setState({ status: 'ok', progress: 1, accuracy: sample.accuracyM, sample })
            resolve(sample)
          } else {
            setState({ status: 'erreur', progress: 0, problem: lastProblem ?? 'delai' })
            resolve(undefined)
          }
        }
        const id = navigator.geolocation.watchPosition(
          (pos) => {
            fixes.push({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy })
            setState((s) => (s.status === 'mesure' ? { ...s, accuracy: pos.coords.accuracy } : s))
          },
          (err) => {
            lastProblem = problemFromCode(err.code)
            if (err.code === 1) finish(false)
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
        )
        const timer = window.setInterval(() => {
          const el = Date.now() - t0
          setState((s) => (s.status === 'mesure' ? { ...s, progress: Math.min(1, el / durationMs) } : s))
          if (el >= durationMs && (fixes.length > 0 || el >= HARD_LIMIT_MS)) finish(false)
        }, 200)
        stopRef.current = () => finish(true)
      }),
    [],
  )

  const reset = useCallback(() => setState({ status: 'repos', progress: 0 }), [])
  return { state, start, cancel, reset }
}
