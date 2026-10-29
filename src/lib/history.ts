import { useSyncExternalStore } from 'react'
import { showToast } from './toast'

// Historique « Annuler / Rétablir » des actions sur le jardin (placer, déplacer, supprimer une plante ou une photo).
// Les messages « Annuler » ne servent plus qu'à prévenir : l'historique reste disponible dans la barre de la carte (↶ ↷) et au clavier
// (Ctrl ou ⌘ + Z, Ctrl ou ⌘ + Maj + Z, Ctrl + Y), même quand le message a disparu. Il est vidé à la fermeture de l'appli.

export interface HistoryEntry {
  /** « Placement de « Rosier » » : sert aux messages et aux infobulles. */
  label: string
  undo(): void
  redo(): void
}

const LIMIT = 50
let past: HistoryEntry[] = []
let future: HistoryEntry[] = []
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  snapshot = undefined
  listeners.forEach((l) => l())
}

export interface HistoryView {
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string
  redoLabel?: string
}
let snapshot: HistoryView | undefined
export function getHistory(): HistoryView {
  return (snapshot ??= { canUndo: past.length > 0, canRedo: future.length > 0, undoLabel: past[past.length - 1]?.label, redoLabel: future[future.length - 1]?.label })
}
export function useHistory(): HistoryView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    getHistory,
  )
}
export const historyVersion = () => version

/** Mémorise une action déjà faite. Une nouvelle action efface ce qu'on pouvait rétablir. */
export function recordAction(entry: HistoryEntry) {
  past.push(entry)
  if (past.length > LIMIT) past.shift()
  future = []
  emit()
}

/** Annule la dernière action. Renvoie son entrée, ou `undefined` s'il n'y a rien à annuler. */
export function undoAction(): HistoryEntry | undefined {
  const e = past.pop()
  if (!e) return undefined
  try {
    e.undo()
  } finally {
    future.push(e)
    emit()
  }
  return e
}

export function redoAction(): HistoryEntry | undefined {
  const e = future.pop()
  if (!e) return undefined
  try {
    e.redo()
  } finally {
    past.push(e)
    emit()
  }
  return e
}

/** Annule avec un message qui propose de rétablir. */
export function undoWithToast() {
  const e = undoAction()
  if (e) showToast({ message: `Annulé : ${e.label}.`, actionLabel: 'Rétablir', onAction: redoWithToast })
  else showToast({ message: 'Rien à annuler.' })
}

/** Rétablit avec un message qui propose d'annuler de nouveau. */
export function redoWithToast() {
  const e = redoAction()
  if (e) showToast({ message: `Rétabli : ${e.label}.`, actionLabel: 'Annuler', onAction: undoWithToast })
  else showToast({ message: 'Rien à rétablir.' })
}

/** Mémorise l'action ET prévient (message avec « Annuler »). */
export function recordWithToast(entry: HistoryEntry, message: string) {
  recordAction(entry)
  showToast({ message, actionLabel: 'Annuler', onAction: undoWithToast })
}

export function clearHistory() {
  past = []
  future = []
  emit()
}

/** Raccourcis clavier : Ctrl/⌘ + Z, Ctrl/⌘ + Maj + Z, Ctrl + Y. Ignorés pendant la saisie dans un champ. */
export function historyKeyHandler(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target' | 'preventDefault'>): boolean {
  if (!(e.ctrlKey || e.metaKey)) return false
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? '') || t.isContentEditable)) return false
  const k = e.key.toLowerCase()
  if (k === 'z' && !e.shiftKey) {
    e.preventDefault()
    undoWithToast()
    return true
  }
  if ((k === 'z' && e.shiftKey) || k === 'y') {
    e.preventDefault()
    redoWithToast()
    return true
  }
  return false
}
