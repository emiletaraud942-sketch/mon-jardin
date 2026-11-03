// Cohérence entre les mois des fiches (semis, plantation, récolte) et les tâches que le moteur en tire.
// Sert à repérer les fiches dont le calendrier affiché ne correspond à aucune tâche (ou l'inverse).
import type { Garden, Month, Plant, Species, TaskType } from '../types'
import { generateTasks } from './tasks'

export type GapKind = 'semis' | 'plantation' | 'recolte'
/** 'sans-tache' : la fiche annonce ces mois mais aucune tâche n'est générée ; 'tache-hors-fiche' : une tâche tombe hors des mois de la fiche. */
export type GapIssue = 'sans-tache' | 'tache-hors-fiche'

export interface CalendarGap {
  speciesId: string
  kind: GapKind
  issue: GapIssue
  months: Month[]
  /** Phrase pour l'agronome. */
  detail: string
}

const ALL_MONTHS: Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const NAMES = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const KIND_LABEL: Record<GapKind, string> = { semis: 'semis', plantation: 'plantation', recolte: 'récolte' }
const monthsText = (ms: Month[]) => (ms.length === 12 ? 'toute l’année' : ms.map((m) => NAMES[m - 1]).join(', '))

/** Jardin sans donnée de gelée : les mois ne sont pas décalés, on compare la fiche telle qu'écrite. */
const NEUTRAL_GARDEN: Garden = { id: 'g-consistance', name: 'Consistance', address: '', center: { lon: 2.35, lat: 48.85 }, createdAt: '2026-01-01' }

/** Mois (sur une année) où le moteur génère au moins une tâche de ces types pour une plante à tel statut. */
function taskMonths(sp: Species, status: Plant['status'], types: TaskType[]): Set<Month> {
  const out = new Set<Month>()
  for (const m of ALL_MONTHS) {
    const mm = String(m).padStart(2, '0')
    // Plantée le 1er du mois (l'annuelle est donc dans sa saison) et assez âgée pour qu'une vivace récolte.
    const plant: Plant = {
      id: 'p-consistance', gardenId: NEUTRAL_GARDEN.id, speciesId: sp.id, position: { x: 0, y: 0 },
      plantedAt: `2026-${mm}-01`, ageAtPlanting: 60, status, photos: [],
    }
    const tasks = generateTasks({ garden: NEUTRAL_GARDEN, plants: [plant], speciesById: { [sp.id]: sp }, today: new Date(2026, m - 1, 15, 9), tasksDone: [] })
    if (tasks.some((t) => types.includes(t.type))) out.add(m)
  }
  return out
}

/** Écarts d'une fiche. Liste vide = calendrier de la fiche et tâches concordent. */
export function calendarConsistency(sp: Species): CalendarGap[] {
  const gaps: CalendarGap[] = []
  const check = (kind: GapKind, ficheMonths: Month[] | undefined, generated: Set<Month>) => {
    const fiche = new Set(ficheMonths ?? [])
    const missing = ALL_MONTHS.filter((m) => fiche.has(m) && !generated.has(m))
    const extra = ALL_MONTHS.filter((m) => generated.has(m) && !fiche.has(m))
    if (missing.length) {
      gaps.push({
        speciesId: sp.id, kind, issue: 'sans-tache', months: missing,
        detail: `${sp.nomCommun} : la fiche donne ${KIND_LABEL[kind]} en ${monthsText(missing)} mais aucune tâche n’est générée ces mois-là.`,
      })
    }
    if (extra.length) {
      gaps.push({
        speciesId: sp.id, kind, issue: 'tache-hors-fiche', months: extra,
        detail: `${sp.nomCommun} : une tâche de ${KIND_LABEL[kind]} tombe en ${monthsText(extra)}, hors des mois de la fiche.`,
      })
    }
  }
  const semis = taskMonths(sp, 'projet', ['semis'])
  const plantation = taskMonths(sp, 'projet', ['plantation'])
  check('semis', [...(sp.semisAbri ?? []), ...(sp.semisPleineTerre ?? [])], semis)
  check('plantation', sp.plantation, plantation)
  check('recolte', sp.recolte, taskMonths(sp, 'en-place', ['recolte']))
  return gaps
}

/** Écarts de toutes les fiches. */
export function calendarConsistencyAll(all: Species[]): CalendarGap[] {
  return all.flatMap(calendarConsistency)
}
