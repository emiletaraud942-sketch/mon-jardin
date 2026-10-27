import { useEffect, useSyncExternalStore } from 'react'
import { pickBanner, type BannerId } from './bannerQueue'
import { useUi } from './ui'

export type { BannerId } from './bannerQueue'

// File d'attente des bandeaux : un seul à la fois, jamais pendant le placement d'une plante.
// Un bandeau dit qu'il veut s'afficher (`useBanner`), le plus prioritaire passe, les autres attendent leur tour.

const wanting = new Set<BannerId>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

function setWanting(id: BannerId, on: boolean) {
  if (on === wanting.has(id)) return
  if (on) wanting.add(id)
  else wanting.delete(id)
  emit()
}

/**
 * Déclare qu'un bandeau veut s'afficher et dit si c'est son tour.
 * Pendant un placement (carte ou 3D), aucun bandeau : la carte est libre.
 */
export function useBanner(id: BannerId, wants: boolean): boolean {
  const { placingSpeciesId, movingPlantId } = useUi()
  const paused = !!(placingSpeciesId || movingPlantId)
  useEffect(() => {
    setWanting(id, wants)
    return () => setWanting(id, false)
  }, [id, wants])
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return wants && pickBanner(wanting, paused) === id
}

/** Pour les tests : vide la file. */
export function resetBanners() {
  wanting.clear()
  emit()
}
