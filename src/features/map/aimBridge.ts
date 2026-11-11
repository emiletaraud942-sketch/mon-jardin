import { useSyncExternalStore } from 'react'
import type { XY } from '../../types'
// Pont entre la bannière de placement (bouton « Valider ») et la carte (viseur au centre, endroit touché).
let handler: (() => void) | undefined

export function registerAim(h: () => void): () => void {
  handler = h
  return () => {
    if (handler === h) handler = undefined
  }
}

/** « Valider » : pose (ou déplace) la plante à l'endroit choisi : sous le viseur, sinon là où l'on a touché. Sans carte ouverte : rien. */
export function placeAtAim() {
  handler?.()
}

/**
 * Sur téléphone et sur écran tactile, toucher la carte choisit un endroit et « Valider » le confirme (doigt imprécis, on peut corriger).
 * À la souris, un clic suffit : la plante est posée tout de suite (annulable).
 */
export function confirmBeforePlacing(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

// ---------- Infos de placement affichées dans la bannière : distances et état du GPS ----------
export interface PlacingInfo {
  /** « Limite 6 m · Maison 18 m » pour l'endroit visé. */
  summary: string
  /** Phrase courte sur l'aide utilisée (mesure GPS en cours, précision). */
  note: string
}
let info: PlacingInfo = { summary: '', note: '' }
const listeners = new Set<() => void>()

export function setPlacingInfo(p: Partial<PlacingInfo>) {
  const next = { ...info, ...p }
  if (next.summary === info.summary && next.note === info.note) return
  info = next
  listeners.forEach((l) => l())
}

// ---------- Ajuster l'endroit visé de quelques centimètres (flèches de la consigne) ----------
let nudgeHandler: ((dx: number, dy: number) => void) | undefined
export function registerNudge(h: (dx: number, dy: number) => void): () => void {
  nudgeHandler = h
  return () => {
    if (nudgeHandler === h) nudgeHandler = undefined
  }
}
/** Déplace l'endroit visé (x = est, y = nord, en mètres). Sans carte ouverte : rien. */
export function nudgeAim(dx: number, dy: number) {
  nudgeHandler?.(dx, dy)
}

// ---------- Endroit visé (pour la fiche « Ici ») ----------
let point: XY | undefined
const pointListeners = new Set<() => void>()
export function setPlacingPoint(p: XY | undefined) {
  if (p === point || (p && point && p.x === point.x && p.y === point.y)) return
  point = p
  pointListeners.forEach((l) => l())
}
export function usePlacingPoint(): XY | undefined {
  return useSyncExternalStore(
    (l) => {
      pointListeners.add(l)
      return () => pointListeners.delete(l)
    },
    () => point,
  )
}

export function usePlacingInfo(): PlacingInfo {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => info,
  )
}
