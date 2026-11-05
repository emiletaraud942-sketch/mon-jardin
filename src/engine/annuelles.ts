// Annuelles : savoir quand une plante peut être marquée « récoltée » (fin de saison choisie par la personne).
// Le calcul de la fin de saison reste `annualSeasonOver` (tasks.ts) : ici seulement la décision « récoltée ».
import type { Plant, Species } from '../types'
import { annualSeasonOver, isAnnualSpecies } from './tasks'

export interface HarvestedCheck {
  ok: boolean
  /** Phrase courte pour l'écran : pourquoi oui, ou pourquoi non. */
  reason: string
}

/**
 * Une annuelle plantée (en place ou malade) peut être marquée « récoltée » à tout moment : on arrache parfois
 * avant la fin de la fenêtre de récolte. Une vivace, un projet, une plante morte ou déjà récoltée : non.
 */
export function canMarkHarvested(plant: Plant, sp: Species | undefined, today: Date): HarvestedCheck {
  if (!sp) return { ok: false, reason: 'Cette plante n’a pas de fiche : on ne sait pas si elle se récolte en une fois.' }
  if (plant.status === 'recoltee') return { ok: false, reason: 'Elle est déjà marquée récoltée.' }
  if (plant.status === 'mort') return { ok: false, reason: 'Elle est marquée morte.' }
  if (plant.status === 'projet') return { ok: false, reason: 'Elle n’est pas encore plantée.' }
  if (!isAnnualSpecies(sp)) return { ok: false, reason: `${sp.nomCommun} repart chaque année : on ne la marque pas récoltée.` }
  if (annualSeasonOver(plant, sp, today)) return { ok: true, reason: 'Sa saison est finie : vous pouvez la marquer récoltée.' }
  return { ok: true, reason: 'Marquez-la récoltée quand vous l’avez arrachée ou que la récolte est finie.' }
}

/** Annuelles dont la saison est finie et qui sont encore marquées plantées : à proposer en « Marquer récoltées ». */
export function seasonOverPlants(plants: Plant[], speciesById: Record<string, Species>, today: Date): Plant[] {
  return plants.filter((p) => {
    const sp = speciesById[p.speciesId]
    return !!sp && annualSeasonOver(p, sp, today)
  })
}
