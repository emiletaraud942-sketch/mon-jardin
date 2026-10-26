import { useSyncExternalStore } from 'react'

// Écran de scan ouvert (état d'interface, non enregistré). Petit module sans dépendance lourde :
// l'application le lit au démarrage, les écrans eux-mêmes se chargent à la demande.

export type ScanScreen = 'menu' | 'recaler' | 'scanner' | 'mesures'

/** Ce que « Placer par mesures » doit faire du point trouvé. */
export type MeasureTarget = { kind: 'plant'; plantId: string } | { kind: 'new' }

export interface ScanUi {
  screen?: ScanScreen
  target?: MeasureTarget
}

let ui: ScanUi = {}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openScan(screen: ScanScreen, target?: MeasureTarget) {
  ui = { screen, target }
  emit()
}

export function closeScan() {
  ui = {}
  emit()
}

export function useScanUi(): ScanUi {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => ui,
  )
}
