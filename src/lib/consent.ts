import { useSyncExternalStore } from 'react'

// Consentements de l'utilisateur (envoi de photos à Pl@ntNet, synchronisation en ligne, entraide entre voisins, alertes de nouveaux messages).
// Stockés dans localStorage (clé effacée par « Effacer toutes mes données »). Si le stockage est
// indisponible, le choix ne vaut que pour la session : on redemande au prochain lancement.

export type ConsentId = 'plantnet' | 'sync' | 'voisins' | 'notifications'
export const CONSENT_IDS: readonly ConsentId[] = ['plantnet', 'sync', 'voisins', 'notifications']
/** À incrémenter quand le sens d'un consentement change : les anciens accords ne comptent plus. */
export const CONSENT_VERSION = 1
export const CONSENT_KEY = 'permajardin:consent'

type Record_ = Partial<Record<ConsentId, string>>
/** Repli quand localStorage est indisponible. */
let memory: Record_ = {}
let version = 0
const listeners = new Set<() => void>()

function read(): Record_ {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return { ...memory }
    const data = JSON.parse(raw) as { v?: unknown } & Record<string, unknown>
    if (!data || typeof data !== 'object' || data.v !== CONSENT_VERSION) return { ...memory }
    const out: Record_ = {}
    for (const id of CONSENT_IDS) if (typeof data[id] === 'string') out[id] = data[id] as string
    return { ...out, ...memory }
  } catch {
    return { ...memory }
  }
}

function write(next: Record_) {
  memory = { ...next }
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, ...next }))
    memory = {} // bien enregistré : le repli n'est plus nécessaire
  } catch {
    /* stockage indisponible : le choix reste en mémoire pour cette session */
  }
  version++
  listeners.forEach((l) => l())
}

export function hasConsent(id: ConsentId): boolean {
  return !!read()[id]
}

/** Date (ISO) de l'accord, ou undefined. */
export function consentDate(id: ConsentId): string | undefined {
  return read()[id]
}

export function grantConsent(id: ConsentId, now = new Date()) {
  write({ ...read(), [id]: now.toISOString() })
}

/** Retire l'accord. N'efface aucune donnée : la question sera reposée au prochain envoi. */
export function revokeConsent(id: ConsentId) {
  const next = read()
  delete next[id]
  write(next)
}

/** Pour l'interface : se met à jour quand un consentement change. */
export function useConsents(): Record<ConsentId, boolean> {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return { plantnet: hasConsent('plantnet'), sync: hasConsent('sync'), voisins: hasConsent('voisins'), notifications: hasConsent('notifications') }
}

/** Réservé aux tests. */
export function resetConsentMemory() {
  memory = {}
  version++
}
