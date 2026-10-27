import { isoDate } from './dates'
import { getState } from './store'
import { serializeState } from './migrate'

// Export de sauvegarde et rappel mensuel. Aucune donnée n'est envoyée nulle part.

const LAST_EXPORT_KEY = 'permajardin:last-export'
const LAST_REMINDER_KEY = 'permajardin:last-export-reminder'
const FIRST_USE_KEY = 'permajardin:first-use'
const DAY_MS = 86400000
export const REMIND_EVERY_DAYS = 30

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

/** Télécharge un contenu. Le lien est ajouté au DOM (Firefox, Safari) et l'URL révoquée après 10 s. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Télécharge un texte JSON. */
export function downloadJson(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: 'application/json' }), filename)
}

/** Exporte l'état courant. `name` : préfixe du fichier (par défaut « permajardin »). */
export function exportCurrentState(name = 'permajardin', remember = true) {
  const { gardens, plants, tasksDone } = getState()
  downloadJson(JSON.stringify(serializeState({ gardens, plants, tasksDone }), null, 2), `${name}-${isoDate()}.json`)
  if (remember) write(LAST_EXPORT_KEY, String(Date.now()))
}

/** Note qu'une sauvegarde vient d'être faite (rappel mensuel). */
export function markExported(now = Date.now()) {
  write(LAST_EXPORT_KEY, String(now))
}

export function lastExportAt(): number | undefined {
  const n = Number(read(LAST_EXPORT_KEY))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Note la première utilisation (point de départ du premier rappel). */
export function noteFirstUse(now = Date.now()) {
  if (!read(FIRST_USE_KEY)) write(FIRST_USE_KEY, String(now))
}

export interface ReminderInput {
  now: number
  hasData: boolean
  lastExport?: number
  lastReminder?: number
  firstUse?: number
}

/** Vrai s'il faut rappeler d'exporter : données présentes, aucun export ni rappel depuis 30 jours. */
export function shouldRemindExport({ now, hasData, lastExport, lastReminder, firstUse }: ReminderInput): boolean {
  if (!hasData) return false
  const since = (t?: number) => (t === undefined ? Infinity : (now - t) / DAY_MS)
  const baseline = lastExport ?? firstUse
  if (baseline === undefined) return false
  return since(baseline) >= REMIND_EVERY_DAYS && since(lastReminder) >= REMIND_EVERY_DAYS
}

/** À appeler une fois au démarrage : renvoie vrai (et mémorise) si un rappel doit s'afficher. */
export function consumeExportReminder(hasData: boolean, now = Date.now()): boolean {
  noteFirstUse(now)
  const num = (k: string) => {
    const n = Number(read(k))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const due = shouldRemindExport({ now, hasData, lastExport: lastExportAt(), lastReminder: num(LAST_REMINDER_KEY), firstUse: num(FIRST_USE_KEY) })
  if (due) write(LAST_REMINDER_KEY, String(now))
  return due
}
