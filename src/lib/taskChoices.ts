import type { TaskChoice, TaskDone } from '../types'
import { uid } from './geo'

// « Pas maintenant » et « Je ne veux pas le faire » : en plus de « Fait », la personne peut décider d'une tâche.
// Un report la masque jusqu'à une date ; un refus ne la propose plus pour ces plantes. Les deux sont annulables et visibles dans l'historique.

export type Snooze = 'demain' | 'semaine' | 'mois'

export const SNOOZE_LABEL: Record<Snooze, string> = { demain: 'Demain', semaine: 'Dans une semaine', mois: 'Dans un mois' }

/** Date de retour de la tâche : minuit (heure locale) du jour choisi, en ISO. */
export function snoozeUntil(kind: Snooze, now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (kind === 'demain') d.setDate(d.getDate() + 1)
  else if (kind === 'semaine') d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

/** Entrée à enregistrer pour une décision sur une tâche (la clé est celle de la tâche affichée). */
export function choiceEntry(gardenId: string, taskKey: string, choice: TaskChoice, now: Date, snooze?: Snooze): TaskDone {
  const entry: TaskDone = { id: uid(), gardenId, taskKey, doneAt: now.toISOString() }
  if (choice === 'fait') return entry
  entry.status = choice
  if (choice === 'reporte') entry.until = snoozeUntil(snooze ?? 'semaine', now)
  return entry
}

/** « Revient le 5 novembre » / « Ne sera plus proposée ». */
export function choiceSentence(t: Pick<TaskDone, 'status' | 'until'>, now: Date = new Date()): string {
  if (t.status === 'refuse') return 'Ne sera plus proposée.'
  const d = new Date(t.until ?? '')
  if (Number.isNaN(d.getTime())) return 'Reportée.'
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }
  return `Revient le ${d.toLocaleDateString('fr-FR', opts)}.`
}

/** Décisions encore actives : refus, et reports dont la date n'est pas passée. Les plus récentes d'abord. */
export function activeChoices(tasksDone: readonly TaskDone[], gardenId: string, now: Date): TaskDone[] {
  return tasksDone
    .filter((t) => (!t.gardenId || t.gardenId === gardenId) && (t.status === 'refuse' || (t.status === 'reporte' && Date.parse(t.until ?? '') > now.getTime())))
    .sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1))
}
