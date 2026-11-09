import { TASK_LABEL } from '../../data/labels'
import type { TaskType } from '../../types'

const isTaskType = (x: string): x is TaskType => x in TASK_LABEL

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Libellé lisible d'une tâche faite, d'après sa clé (`période:espèce:type:suite`, ou `période:jardin:type:suite`).
 * Exemples : `2026-W41:pommier:arrosage:0` → « Arrosage · Pommier » ; `…:jardin:arrosage:meteo` → « Arrosage (météo) » ;
 * `…:jardin:protection:gel` → « Protection gel » (de même canicule, sécheresse, vent fort). Tolère les clés inattendues : renvoie « Tâche » plutôt que du jargon.
 */
export function doneTaskLabel(taskKey: string, speciesName: (id: string) => string | undefined): string {
  const parts = taskKey.split(':')
  const typeIdx = parts.findIndex((p, i) => i > 0 && isTaskType(p))
  if (typeIdx === -1) return 'Tâche'
  const type = parts[typeIdx] as TaskType
  const subject = parts[typeIdx - 1]
  const rest = parts.slice(typeIdx + 1)
  const label = TASK_LABEL[type]
  if (subject === 'jardin') {
    if (rest[0] === 'meteo') return `${label} (météo)`
    if (rest[0] === 'gel') return `${label} gel`
    if (rest[0] === 'canicule') return `${label} canicule`
    if (rest[0] === 'secheresse') return `${label} sécheresse`
    if (rest[0] === 'vent') return `${label} vent fort`
    return label
  }
  const name = subject ? speciesName(subject) : undefined
  return name ? `${label} · ${cap(name)}` : label
}

/** « le 21 octobre » (avec l'année si ce n'est pas l'année en cours). Chaîne vide si la date est illisible. */
export function doneOnLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }
  return `Fait le ${d.toLocaleDateString('fr-FR', opts)}`
}
