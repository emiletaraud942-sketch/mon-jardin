// Réglage « Grandes touches » : les boutons, onglets, cases et lignes de listes passent à 56 px de haut (au lieu de 44 px).
// Mémorisé sur l'appareil ; appliqué à <html> par un attribut (`data-big-taps`), le CSS fait le reste (`--tap`).
import { useSyncExternalStore } from 'react'

const KEY = 'pj.bigTaps'
const CHANGE_EVENT = 'bigtaps-change' // nom d'événement, pas une clé de stockage

/** Hauteur minimale d'une cible tactile, en pixels (les tests de cibles s'y réfèrent). */
export const TAP_NORMAL = 44
export const TAP_BIG = 56

export const parseBigTaps = (v: unknown): boolean => v === '1'

export function getBigTaps(): boolean {
  try {
    return parseBigTaps(localStorage.getItem(KEY))
  } catch {
    return false
  }
}

export function applyBigTaps(on: boolean) {
  const root = document.documentElement
  if (on) root.setAttribute('data-big-taps', '')
  else root.removeAttribute('data-big-taps')
}

export function setBigTaps(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* mémorisation impossible : le choix vaut pour cette session */
  }
  applyBigTaps(on)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function applyStoredBigTaps() {
  applyBigTaps(getBigTaps())
}

/** « Grandes touches » vu par l'interface : suit le réglage de Réglages et la page « Tout ce que je peux faire ». */
export function useBigTaps(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(CHANGE_EVENT, cb)
      return () => window.removeEventListener(CHANGE_EVENT, cb)
    },
    getBigTaps,
    () => false,
  )
}
