import { useEffect, useRef, useSyncExternalStore } from 'react'

// États d'interface partagés par « Tout ce que je peux faire », « Je suis perdu » et les fenêtres qu'on ouvre depuis n'importe quel écran.
// Rien n'est mémorisé : tout repart de zéro à chaque ouverture de l'appli.

/** Une valeur partagée, lisible hors React (`get`, `set`) et dans un composant (`use`). */
export function createValue<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(value, next)) return
      value = next
      listeners.forEach((l) => l())
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l)
          return () => void listeners.delete(l)
        },
        () => value,
      ),
  }
}

/** Page « Tout ce que je peux faire » ouverte. */
export const toutFaire = createValue(false)
/** Feuille « Je suis perdu » ouverte. */
export const lostSheet = createValue(false)
/** Mode guidé « Que voulez-vous faire ? » ouvert (une question par écran). */
export const guideOpen = createValue(false)
/** Visite des fonctions ouverte (5 ou 6 écrans, une phrase chacun). */
export const tourOpen = createValue(false)
/** Choix d'une plante à ajouter, ouvert depuis le registre. `then` : éléments à montrer une fois la plante choisie (aides au placement). */
export const addPicker = createValue<{ then?: string[] } | undefined>(undefined)
export const identifyOpen = createValue(false)
export const shoppingOpen = createValue(false)
/** Guide « bestioles et maladies » ouvert ; `id` : la fiche à montrer d'emblée (depuis la fiche d'une plante). */
export const ennuisOpen = createValue<{ id?: string } | undefined>(undefined)
export const openEnnui = (id?: string) => ennuisOpen.set({ id })
/** Écran « Rotation de mon potager » ouvert. */
export const rotationOpen = createValue(false)
export const openRotation = () => rotationOpen.set(true)

/** Ce qu'on veut faire avec une plante qu'il faut d'abord choisir. */
export type PlantAsk = 'fiche' | 'photos' | 'journal' | 'croissance' | 'recoltee' | 'supprimer' | 'deplacer'
export const plantChoice = createValue<PlantAsk | undefined>(undefined)

// ---------- Demandes à un écran ----------
// Un écran qui n'est pas encore ouvert (chargé à la demande) lit la demande à son arrivée : « ouvre le panneau de réglages ».
const INTENT_MS = 10_000
let pending: { name: string; at: number }[] = []
const intentListeners = new Set<() => void>()

/** Demande à l'écran concerné d'ouvrir un panneau ou de passer dans un mode. */
export function postIntent(name: string) {
  const now = Date.now()
  pending = pending.filter((p) => now - p.at < INTENT_MS && p.name !== name)
  pending.push({ name, at: now })
  intentListeners.forEach((l) => l())
}

/** Appelle `handler` quand la demande `name` arrive (ou était déjà là à l'ouverture de l'écran). Une demande ne sert qu'une fois. */
export function useIntent(name: string, handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const check = () => {
      const i = pending.findIndex((p) => p.name === name && Date.now() - p.at < INTENT_MS)
      if (i < 0) return
      pending.splice(i, 1)
      // Un tour plus tard : les effets de l'écran qui s'ouvre (remise à zéro, double montage de React en développement) sont passés.
      window.setTimeout(() => ref.current(), 0)
    }
    check()
    intentListeners.add(check)
    return () => void intentListeners.delete(check)
  }, [name])
}
