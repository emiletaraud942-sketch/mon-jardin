import { useSyncExternalStore } from 'react'
import type { XY } from '../../types'

// Écran « Photos du jardin » ouvert (état d'interface, non enregistré). Module léger : l'appli le lit au démarrage,
// les écrans eux-mêmes se chargent à la demande.

export type PanoScreen = 'home' | 'place' | 'capture' | 'import' | 'view'

export interface PanoUi {
  screen?: PanoScreen
  /** Point regardé (viewer) ou refait (capture). */
  pointId?: string
  /** Façon de faire le prochain point. */
  mode?: 'guide' | 'import'
  /** Position choisie pour le point en cours de création. */
  spot?: XY
  /** Cap à regarder en entrant dans la visionneuse. */
  yaw?: number
  /** D'où on vient : « home » ramène à la liste des points, sinon la visionneuse se ferme sur la carte. */
  back?: 'home'
}

let ui: PanoUi = {}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openPanorama(screen: PanoScreen = 'home', patch: Omit<PanoUi, 'screen'> = {}) {
  ui = { screen, ...patch }
  emit()
}

export function closePanorama() {
  ui = {}
  emit()
}

export function usePanoUi(): PanoUi {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
  )
}
