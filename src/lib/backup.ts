import { isoDate } from './dates'
import { getState } from './store'
import { serializeState } from './migrate'

// Export de sauvegarde et rappel mensuel. Aucune donnée n'est envoyée nulle part.

const LAST_EXPORT_KEY = 'permajardin:last-export'
const LAST_REMINDER_KEY = 'permajardin:last-export-reminder'
const LAST_EXPORT_NAME_KEY = 'permajardin:last-export-name'
const FIRST_USE_KEY = 'permajardin:first-use'
const DAY_MS = 86400000
export const REMIND_EVERY_DAYS = 30
const EARLY_REMINDER_PLANTS = 3
const EARLY_REMINDER_DAYS = 2
const EARLY_REMINDER_REPEAT_DAYS = 7

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

export type DeviceKind = 'ios' | 'android' | 'bureau'

/** iPhone, iPad (qui se dit parfois « Mac » mais a un écran tactile), Android, ou ordinateur. */
export function deviceKind(ua: string, maxTouchPoints = 0): DeviceKind {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'bureau'
}

export interface SaveOutcome {
  how: 'partage' | 'telecharge' | 'annule'
  name: string
  /** Le fichier, gardé en mémoire pour proposer « Partager » avec un nouveau geste si le premier essai n'a pas pu s'ouvrir. */
  file?: File
}

const currentDevice = () => (typeof navigator === 'undefined' ? 'bureau' : deviceKind(navigator.userAgent, navigator.maxTouchPoints ?? 0))

/** Le navigateur sait-il partager ce fichier (menu « Partager » : Fichiers, Drive, Mail, AirDrop…) ? */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [file] })
  } catch {
    return false
  }
}

/** Ouvre le menu « Partager ». `refuse` : le navigateur n'a pas pu l'ouvrir (geste trop ancien, non pris en charge). */
export async function shareFile(file: File): Promise<'partage' | 'annule' | 'refuse'> {
  try {
    await navigator.share({ files: [file], title: 'Sauvegarde PermaJardin' })
    return 'partage'
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? 'annule' : 'refuse'
  }
}

/**
 * Range une sauvegarde : sur téléphone, le menu « Partager » d'abord (on choisit Fichiers, Drive, Mail…), sinon téléchargement.
 * Partage annulé par l'utilisateur : rien n'est téléchargé dans son dos.
 */
export async function saveBackupBlob(blob: Blob, name: string, opts: { share?: boolean } = {}): Promise<SaveOutcome> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
  if (opts.share && currentDevice() !== 'bureau' && canShareFile(file)) {
    const r = await shareFile(file)
    if (r === 'partage') return { how: 'partage', name, file }
    if (r === 'annule') return { how: 'annule', name, file }
  }
  downloadBlob(blob, name)
  return { how: 'telecharge', name, file }
}

/** Ce qu'on dit à l'utilisateur après une sauvegarde : où est le fichier, en phrases courtes. */
export function saveOutcomeText(o: SaveOutcome, device: DeviceKind = currentDevice()): string {
  if (o.how === 'partage') return 'Sauvegarde envoyée là où vous l’avez choisie. Gardez-la en lieu sûr.'
  if (o.how === 'annule') return 'Partage annulé : rien n’a été enregistré. Appuyez sur « Partager » ou sur « Enregistrer sur cet appareil ».'
  const where =
    device === 'ios'
      ? 'dans l’appli Fichiers, dossier Téléchargements (ou « Sur mon iPhone »)'
      : device === 'android'
        ? 'dans l’appli Fichiers, dossier Téléchargements'
        : 'dans le dossier Téléchargements de l’ordinateur'
  return `Sauvegarde faite. Le fichier « ${o.name} » est ${where}. Vous ne le voyez pas ? Ouvrez la liste des téléchargements de votre navigateur.`
}

/** Sauvegarde simple (JSON, sans photos) de l'état courant. */
export async function backupCurrentState(name = 'permajardin', opts: { remember?: boolean; share?: boolean } = {}): Promise<SaveOutcome> {
  const { gardens, plants, tasksDone } = getState()
  const text = JSON.stringify(serializeState({ gardens, plants, tasksDone }), null, 2)
  const out = await saveBackupBlob(new Blob([text], { type: 'application/json' }), `${name}-${isoDate()}.json`, { share: opts.share })
  if (out.how !== 'annule' && opts.remember !== false) markExported(Date.now(), out.name)
  return out
}

/** Exporte l'état courant. `name` : préfixe du fichier (par défaut « permajardin »). */
export function exportCurrentState(name = 'permajardin', remember = true) {
  const { gardens, plants, tasksDone } = getState()
  downloadJson(JSON.stringify(serializeState({ gardens, plants, tasksDone }), null, 2), `${name}-${isoDate()}.json`)
  if (remember) write(LAST_EXPORT_KEY, String(Date.now()))
}

/** Note qu'une sauvegarde vient d'être faite (rappel mensuel). */
export function markExported(now = Date.now(), fileName?: string) {
  write(LAST_EXPORT_KEY, String(now))
  if (fileName) write(LAST_EXPORT_NAME_KEY, fileName)
}

/** Nom du dernier fichier de sauvegarde (pour dire à l'utilisateur quoi chercher). */
export function lastExportName(): string | undefined {
  return read(LAST_EXPORT_NAME_KEY) ?? undefined
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
  /** Nombre de plantes : à partir de 3 sans aucune sauvegarde, le premier rappel vient après 2 jours (au lieu de 30). */
  plantCount?: number
  lastExport?: number
  lastReminder?: number
  firstUse?: number
}

/** Vrai s'il faut rappeler d'exporter : données présentes, aucun export ni rappel depuis 30 jours (2 jours si 3 plantes ou plus et aucune sauvegarde). */
export function shouldRemindExport({ now, hasData, plantCount, lastExport, lastReminder, firstUse }: ReminderInput): boolean {
  if (!hasData) return false
  const since = (t?: number) => (t === undefined ? Infinity : (now - t) / DAY_MS)
  // Du travail déjà fait et jamais sauvegardé : on ne attend pas un mois (les données ne vivent que dans ce navigateur).
  if (lastExport === undefined && (plantCount ?? 0) >= EARLY_REMINDER_PLANTS && firstUse !== undefined) {
    return since(firstUse) >= EARLY_REMINDER_DAYS && since(lastReminder) >= EARLY_REMINDER_REPEAT_DAYS
  }
  const baseline = lastExport ?? firstUse
  if (baseline === undefined) return false
  return since(baseline) >= REMIND_EVERY_DAYS && since(lastReminder) >= REMIND_EVERY_DAYS
}

/** À appeler une fois au démarrage : renvoie vrai (et mémorise) si un rappel doit s'afficher. */
export function consumeExportReminder(hasData: boolean, now = Date.now(), plantCount = 0): boolean {
  noteFirstUse(now)
  const num = (k: string) => {
    const n = Number(read(k))
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const due = shouldRemindExport({ now, hasData, plantCount, lastExport: lastExportAt(), lastReminder: num(LAST_REMINDER_KEY), firstUse: num(FIRST_USE_KEY) })
  if (due) write(LAST_REMINDER_KEY, String(now))
  return due
}
