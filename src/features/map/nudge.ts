import type { XY } from '../../types'

/** Pas d'un bouton « Ajuster » pendant le placement : 10 cm. */
export const AIM_NUDGE_M = 0.1

/** Pas d'une flèche du clavier sur une plante : 0,5 m ; avec Maj, 2 m. */
export const NUDGE_M = 0.5
export const NUDGE_BIG_M = 2

/** Nouvelle position après une flèche (x = est, y = nord). `undefined` si la touche n'est pas une flèche. */
export function nudgePosition(pos: XY, key: string, big = false): XY | undefined {
  const d = big ? NUDGE_BIG_M : NUDGE_M
  const round = (n: number) => Math.round(n * 100) / 100
  switch (key) {
    case 'ArrowLeft':
      return { x: round(pos.x - d), y: pos.y }
    case 'ArrowRight':
      return { x: round(pos.x + d), y: pos.y }
    case 'ArrowUp':
      return { x: pos.x, y: round(pos.y + d) }
    case 'ArrowDown':
      return { x: pos.x, y: round(pos.y - d) }
    default:
      return undefined
  }
}

/** Distance (px) dont il faut bouger le doigt avant qu'un appui devienne un glissement : plus large au doigt qu'à la souris. */
export const dragThresholdPx = (coarsePointer: boolean) => (coarsePointer ? 12 : 3)
