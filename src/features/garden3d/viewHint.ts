import { isTouchDevice } from './touch'

/** Fin de l'aide, la même partout : déplacer une plante. */
const MOVE_PLANT = 'Pour déplacer une plante, glissez-la, ou ouvrez sa fiche et touchez « Déplacer cette plante ».'

/**
 * Aide du panneau de la Vue 3D, selon l'appareil.
 * Souris (OrbitControls de Scene.tsx) : glisser = tourner, clic droit ou Maj + glisser = déplacer la vue, molette = zoomer.
 * Doigt : texte d'origine (inchangé).
 */
export function viewHint(touch: boolean): string {
  const gestes = touch
    ? 'Tournez la vue à deux doigts.'
    : 'Faites glisser pour tourner la vue. Clic droit ou Maj + glisser pour la déplacer. Molette pour zoomer.'
  return `${gestes} ${MOVE_PLANT}`
}

export const currentViewHint = (): string => viewHint(isTouchDevice())
