import { useCallback, useRef } from 'react'

/**
 * Hauteur que la consigne de placement prend en bas de la carte (ordinateur) : posée dans `--placing-h` sur `.canvas-wrap`.
 * Le CSS s'en sert pour remonter l'échelle et l'attribution IGN et pour borner la colonne d'outils (`.map-top`) :
 * la consigne ne recouvre plus rien, quelle que soit la taille du texte ou le nombre de lignes.
 * À brancher en `ref` de la consigne ; la variable disparaît avec elle.
 */
export const PLACING_VAR = '--placing-h'
/** Écart entre la consigne et le bas de la carte (`bottom` de `.placing-banner`). */
export const PLACING_GAP_PX = 12

export function reserveFor(heightPx: number): string {
  return `${Math.ceil(heightPx) + PLACING_GAP_PX}px`
}

export function usePlacingReserve() {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((el: HTMLElement | null) => {
    stop.current?.()
    stop.current = null
    const wrap = el?.closest<HTMLElement>('.canvas-wrap') ?? null
    if (!el || !wrap) return
    const set = () => wrap.style.setProperty(PLACING_VAR, reserveFor(el.offsetHeight))
    set()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set)
    ro?.observe(el)
    stop.current = () => {
      ro?.disconnect()
      wrap.style.removeProperty(PLACING_VAR)
    }
  }, [])
}
