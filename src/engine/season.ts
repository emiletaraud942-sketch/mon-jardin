// Saison d'une plante annuelle : après sa récolte, elle ne génère plus de tâches.
import type { Month, Plant, Species } from '../types'

/** Jours de marge après la fin de la fenêtre de récolte (désherbage, paillage, arrachage de fin de saison). */
export const SEASON_MARGIN_DAYS = 30

const isSowing = (t: string) => t === 'semis' || t === 'plantation'

/** Mois de la fenêtre active d'une annuelle : la récolte de la fiche ; à défaut, les mois de ses tâches d'entretien (engrais verts, fleurs). */
function activeMonths(sp: Species): Set<number> {
  if (sp.recolte?.length) return new Set(sp.recolte)
  return new Set(sp.taches.filter((r) => !isSowing(r.type)).flatMap((r) => r.months))
}

function plantedYM(plant: Plant): { y: number; m: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(plant.plantedAt)
  if (!m) return undefined
  const y = Number(m[1])
  const mo = Number(m[2])
  return mo >= 1 && mo <= 12 ? { y, m: mo } : undefined
}

/**
 * Nombre de mois (0 = mois de plantation) jusqu'à la fin de la fenêtre active atteinte en premier ;
 * un trou d'un seul mois ne coupe pas la fenêtre. `'annee'` si la fenêtre couvre 12 mois ou plus.
 */
function endOffset(plant: Plant, sp: Species): number | 'annee' | undefined {
  const ym = plantedYM(plant)
  const set = activeMonths(sp)
  if (!ym || set.size === 0) return undefined
  const at = (k: number) => ((ym.m - 1 + k) % 12) + 1
  let k = 0
  while (k < 12 && !set.has(at(k))) k++
  if (k >= 12) return undefined
  let last = k
  for (let j = k + 1; j < 12 + 12; j++) {
    if (set.has(at(j))) last = j
    else if (!set.has(at(j + 1)) || j - last > 1) break
  }
  return last >= 12 ? 'annee' : last
}

/** Une annuelle (fiche non vivace) a une saison ; une vivace ou un arbre n'en a pas. */
export const isAnnual = (sp: Species) => !sp.vivace

/**
 * Fin de saison d'une annuelle plantée : fin du mois de la dernière récolte de sa première fenêtre, plus 30 jours.
 * `undefined` pour une vivace, une date illisible ou une fiche sans récolte ni tâche d'entretien.
 * Une annuelle plantée en mai 2026 avec récolte de juillet à octobre : fin de saison le 30 novembre 2026.
 */
export function seasonEnd(plant: Plant, sp: Species): Date | undefined {
  if (!isAnnual(sp)) return undefined
  const ym = plantedYM(plant)
  const off = endOffset(plant, sp)
  if (!ym || off === undefined) return undefined
  const margin = SEASON_MARGIN_DAYS * 86_400_000
  if (off === 'annee') {
    const t = Date.parse(plant.plantedAt)
    return Number.isFinite(t) ? new Date(t + 365 * 86_400_000 + margin) : undefined
  }
  const total = ym.y * 12 + (ym.m - 1) + off
  const endOfMonth = new Date(Math.floor(total / 12), (total % 12) + 1, 0, 23, 59, 59)
  return new Date(endOfMonth.getTime() + margin)
}

/** La saison de cette annuelle est-elle terminée à cette date ? Toujours faux pour une vivace. */
export function seasonEnded(plant: Plant, sp: Species, today: Date): boolean {
  const end = seasonEnd(plant, sp)
  return end !== undefined && today.getTime() > end.getTime()
}

/** Mois du calendrier où une annuelle plantée est encore suivie (du mois de plantation à la marge de fin). `undefined` = tous. */
export function seasonMonths(plant: Plant, sp: Species): Set<Month> | undefined {
  if (!isAnnual(sp)) return undefined
  const ym = plantedYM(plant)
  const off = endOffset(plant, sp)
  if (!ym || off === undefined || off === 'annee') return undefined
  const out = new Set<Month>()
  for (let k = 0; k <= off + 1; k++) out.add((((ym.m - 1 + k) % 12) + 1) as Month)
  return out
}
