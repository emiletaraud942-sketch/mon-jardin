import { useSyncExternalStore } from 'react'

// Petits messages éphémères avec une action « Annuler ». Aucune dépendance à React hors du hook.

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  /** Appelée si l'utilisateur touche l'action (le toast se ferme, `onExpire` n'est pas appelée). */
  onAction?: () => void
  /** Appelée quand le toast disparaît sans action (délai écoulé, fermeture, remplacé). Sert à finaliser une suppression. */
  onExpire?: () => void
  durationMs: number
  tone: 'info' | 'error'
}

export interface ToastInput {
  message: string
  actionLabel?: string
  onAction?: () => void
  onExpire?: () => void
  durationMs?: number
  tone?: 'info' | 'error'
}

/** Nombre de messages au-delà duquel on retire les plus anciens (sauf ceux qui ont un bouton « Annuler »). */
export const MAX_TOASTS = 3
/** Message simple : 7 s. Avec « Annuler » : 30 s. Une erreur reste jusqu'à sa fermeture. */
export const INFO_MS = 7000
export const ACTION_MS = 30000

let toasts: Toast[] = []
let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()
/** Temps restant et heure de départ du compte à rebours (pour la pause). */
const clocks = new Map<number, { left: number; since: number }>()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function stopTimer(id: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  clocks.delete(id)
}

function startTimer(id: number, ms: number) {
  stopTimer(id)
  if (ms <= 0) return
  clocks.set(id, { left: ms, since: Date.now() })
  timers.set(id, setTimeout(() => dismissToast(id), ms))
}

function take(id: number): Toast | undefined {
  const t = toasts.find((x) => x.id === id)
  if (!t) return undefined
  toasts = toasts.filter((x) => x.id !== id)
  stopTimer(id)
  return t
}

export function showToast(input: ToastInput): number {
  const id = nextId++
  const tone = input.tone ?? 'info'
  const toast: Toast = {
    id,
    message: input.message,
    actionLabel: input.actionLabel,
    onAction: input.onAction,
    onExpire: input.onExpire,
    // Une erreur n'est jamais retirée toute seule (durée 0 = pas de compte à rebours).
    durationMs: tone === 'error' ? 0 : input.durationMs ?? (input.onAction ? ACTION_MS : INFO_MS),
    tone,
  }
  toasts = [...toasts, toast]
  startTimer(id, toast.durationMs)
  // Au-delà du maximum, le plus ancien est clos (sa suppression en attente est alors confirmée).
  // Un message avec « Annuler » n'est jamais évincé : l'utilisateur doit pouvoir revenir en arrière.
  const overflow: Toast[] = []
  while (toasts.length > MAX_TOASTS) {
    const victim = toasts.find((t) => !t.onAction && !t.actionLabel && t.id !== id)
    if (!victim) break
    overflow.push(take(victim.id)!)
  }
  emit()
  overflow.forEach((t) => t.onExpire?.())
  return id
}

/** Suspend le compte à rebours (souris dessus, focus clavier, doigt posé). */
export function pauseToast(id: number) {
  const c = clocks.get(id)
  if (!c || !timers.has(id)) return
  clearTimeout(timers.get(id))
  timers.delete(id)
  clocks.set(id, { left: Math.max(1000, c.left - (Date.now() - c.since)), since: c.since })
}

/** Reprend le compte à rebours là où il s'était arrêté. */
export function resumeToast(id: number) {
  const c = clocks.get(id)
  if (!c || timers.has(id)) return
  startTimer(id, c.left)
}

/** Ferme un toast sans action : la suppression en attente est confirmée. */
export function dismissToast(id: number) {
  const t = take(id)
  if (!t) return
  emit()
  t.onExpire?.()
}

/** L'utilisateur a touché l'action : annule la suppression en attente. */
export function runToastAction(id: number) {
  const t = take(id)
  if (!t) return
  emit()
  t.onAction?.()
}

export function getToasts(): Toast[] {
  return toasts
}

/** Pour les tests. */
export function clearToasts() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  clocks.clear()
  toasts = []
  emit()
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
