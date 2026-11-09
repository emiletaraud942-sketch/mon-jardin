import type { Garden } from '../../types'
import { DEMO_PLACE } from '../../data/demo'

/** Nom donné au jardin d'exemple : on voit tout de suite que ce n'est pas le vrai. */
export const DEMO_GARDEN_NAME = 'Exemple : jardin de démonstration'

/** Vrai pour un jardin créé avec « Visiter un jardin d'exemple » (reconnu à son adresse fictive). */
export const isDemoGarden = (g: Pick<Garden, 'address'>): boolean => g.address === DEMO_PLACE.label

/** Titre de la carte d'accueil : « Jardin d'exemple » pour l'exemple (pas de « Chez » collé à son nom), sinon `fallback`. */
export const demoHomeTitle = (g: Pick<Garden, 'address' | 'name'>, fallback: string): string =>
  isDemoGarden(g) && g.name.startsWith(DEMO_GARDEN_NAME) ? 'Jardin d’exemple' : fallback
