import type { Garden } from '../../types'
import { DEMO_PLACE } from '../../data/demo'

/** Nom donné au jardin d'exemple : on voit tout de suite que ce n'est pas le vrai. */
export const DEMO_GARDEN_NAME = 'Exemple : jardin de démonstration'

/** Vrai pour un jardin créé avec « Visiter un jardin d'exemple » (reconnu à son adresse fictive). */
export const isDemoGarden = (g: Pick<Garden, 'address'>): boolean => g.address === DEMO_PLACE.label
