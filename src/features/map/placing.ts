import { SPECIES_BY_ID } from '../../data/species'
import { isoDate } from '../../lib/dates'
import { addPlant, getState, removePlant, updatePlant } from '../../lib/store'
import { dismissToast, showToast } from '../../lib/toast'
import { getUi, setUi, type Tab } from '../../lib/ui'
import { plantName } from '../plants/PlantPanel'
import { uid } from '../../lib/geo'
import type { Garden, XY } from '../../types'

let lastSeriesToast: number | undefined

/**
 * Ajoute une plante à la position choisie.
 * Hors placement en série, la plante est sélectionnée (sa fiche s'ouvre). En série, le mode reste actif
 * pour poser la suivante ; un message permet d'annuler la dernière.
 */
export function placePlant(
  garden: Garden,
  speciesId: string,
  position: XY,
  status: 'en-place' | 'projet' = 'en-place',
  opts: { tab?: Tab; silent?: boolean; customName?: string; photos?: string[] } = {},
): string {
  const id = uid()
  const ui = getUi()
  // `silent` (scan des plantes) : le nom et les photos viennent de l'appelant, l'état d'interface n'est pas touché.
  const placingCustomName = opts.silent ? opts.customName : ui.placingCustomName
  const pendingPhotos = opts.silent ? opts.photos : ui.pendingPhotos
  const placingSeries = opts.silent ? undefined : ui.placingSeries
  const name = placingCustomName || SPECIES_BY_ID[speciesId]?.nomCommun || 'Plante'
  addPlant({
    customName: placingCustomName,
    id,
    gardenId: garden.id,
    speciesId,
    position: { x: Math.round(position.x * 100) / 100, y: Math.round(position.y * 100) / 100 },
    plantedAt: isoDate(),
    status,
    photos: pendingPhotos ?? [],
  })
  if (opts.silent) return id
  if (placingSeries) {
    const count = placingSeries.count + 1
    setUi({ placingSeries: { count }, pendingPhotos: undefined, selectedPlantId: undefined })
    // Un seul message à la fois pour la série : le précédent est remplacé (sa plante reste placée).
    if (lastSeriesToast !== undefined) dismissToast(lastSeriesToast)
    lastSeriesToast = showToast({ message: `Plante placée : ${name} (${count} de suite).`, actionLabel: 'Annuler', onAction: () => removePlant(id) })
    return id
  }
  setUi({ placingSpeciesId: undefined, placingCustomName: undefined, pendingPhotos: undefined, selectedPlantId: id, ...(opts.tab ? { tab: opts.tab } : {}) })
  if (status === 'projet') {
    showToast({
      message: `« ${name} » est prévue à cet endroit. Quand vous l’aurez plantée, touchez « C’est planté ».`,
      actionLabel: 'C’est planté',
      onAction: () => updatePlant(id, { status: 'en-place' }),
    })
  }
  return id
}

/** « Déplacer cette plante » : la plante prend la position touchée ; un message permet de la remettre où elle était. */
export function movePlant(plantId: string, position: XY) {
  const before = getState().plants.find((p) => p.id === plantId)?.position
  setUi({ movingPlantId: undefined, selectedPlantId: plantId })
  if (!before) return
  const next = { x: Math.round(position.x * 100) / 100, y: Math.round(position.y * 100) / 100 }
  updatePlant(plantId, { position: next })
  const plant = getState().plants.find((p) => p.id === plantId)
  const name = plant ? plantName(plant) : 'Plante'
  showToast({ message: `« ${name} » déplacée.`, actionLabel: 'Annuler', onAction: () => updatePlant(plantId, { position: before }) })
}
