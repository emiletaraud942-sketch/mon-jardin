// File d'attente des bandeaux : un seul à la fois. Module pur (aucun accès au navigateur), testé.

export type BannerId = 'stockage' | 'miseajour' | 'donnees' | 'carte' | 'exemple'

/** Ordre de passage : d'abord ce qui met les données en danger, puis la mise à jour, puis le reste. */
export const BANNER_ORDER: BannerId[] = ['stockage', 'miseajour', 'donnees', 'carte', 'exemple']

/** Le bandeau qui passe maintenant parmi ceux qui le demandent (rien tant que `paused`). Fonction pure. */
export function pickBanner(wanting: Iterable<BannerId>, paused = false): BannerId | undefined {
  if (paused) return undefined
  const set = new Set(wanting)
  return BANNER_ORDER.find((id) => set.has(id))
}

