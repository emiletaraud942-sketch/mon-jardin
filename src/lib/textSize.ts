// Taille du texte choisie par l'utilisateur (Réglages). Mémorisée sur l'appareil ; appliquée à <html>
// par un attribut : toute l'interface est en `rem`, elle suit.
import { useSyncExternalStore } from 'react'

export type TextSize = 'normal' | 'grand' | 'tres-grand'
export const TEXT_SIZES: TextSize[] = ['normal', 'grand', 'tres-grand']
export const TEXT_SIZE_LABEL: Record<TextSize, string> = { normal: 'Normal', grand: 'Grand', 'tres-grand': 'Très grand' }
/** Taille de base de la page, en % de 16 px. */
export const TEXT_SIZE_PERCENT: Record<TextSize, number> = { normal: 100, grand: 118.75, 'tres-grand': 137.5 }

const KEY = 'permajardin:text-size'

export const parseTextSize = (v: unknown): TextSize => (TEXT_SIZES as unknown[]).includes(v) ? (v as TextSize) : 'normal'

export function getTextSize(): TextSize {
  try {
    return parseTextSize(localStorage.getItem(KEY))
  } catch {
    return 'normal'
  }
}

export function applyTextSize(size: TextSize) {
  const root = document.documentElement
  if (size === 'normal') root.removeAttribute('data-text-size')
  else root.setAttribute('data-text-size', size)
}

const CHANGE_EVENT = 'textsize-change' // nom d'événement, pas une clé de stockage

/** La taille du texte vue par l'interface : suit le bouton « Agrandir le texte » comme le choix de Réglages. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(CHANGE_EVENT, cb)
      return () => window.removeEventListener(CHANGE_EVENT, cb)
    },
    getTextSize,
    () => 'normal' as TextSize,
  )
}

export function setTextSize(size: TextSize) {
  try {
    if (size === 'normal') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, size)
  } catch {
    /* mémorisation impossible : le choix vaut pour cette session */
  }
  applyTextSize(size)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function applyStoredTextSize() {
  applyTextSize(getTextSize())
}
