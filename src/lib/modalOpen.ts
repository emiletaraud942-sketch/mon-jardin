import { useSyncExternalStore } from 'react'

// Nombre de boîtes de dialogue (`Modal`, natives en couche supérieure) ouvertes. Les messages (`ToastHost`) s'effacent le temps
// qu'une boîte est ouverte : ils restaient à moitié cachés dessous, avec leur « Annuler » inatteignable (la boîte rend le reste inerte).

let count = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** À appeler à l'ouverture d'une boîte ; renvoie la fonction à appeler à sa fermeture (sans effet si elle est appelée deux fois). */
export function modalOpened(): () => void {
  count++
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    count = Math.max(0, count - 1)
    emit()
  }
}

export const isModalOpen = (): boolean => count > 0

export function useModalOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => count > 0,
  )
}

/** Pour les tests. */
export function resetModalOpen() {
  count = 0
  emit()
}
