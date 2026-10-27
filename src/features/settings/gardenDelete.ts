import { panoramaPhotoIds, type AppState } from '../../lib/store'
import type { Garden, Plant, TaskDone } from '../../types'

/** Ce qui part avec un jardin : le jardin, sa place dans la liste, ses plantes et ses tâches faites. */
export interface GardenSnapshot {
  garden: Garden
  index: number
  plants: Plant[]
  tasksDone: TaskDone[]
  wasActive: boolean
}

type Data = Pick<AppState, 'gardens' | 'plants' | 'tasksDone' | 'activeGardenId'>

/** Photos qui ne servent plus à personne une fois le jardin parti (plantes et points de vue en photos). */
export const photosOf = (snap: GardenSnapshot): string[] => [...snap.plants.flatMap((p) => p.photos), ...panoramaPhotoIds([snap.garden])]

/** Retire un jardin (sans toucher aux photos : on peut encore annuler). */
export function removeGardenData(s: Data, id: string): { next: Pick<Data, 'gardens' | 'plants' | 'tasksDone' | 'activeGardenId'>; snapshot?: GardenSnapshot } {
  const index = s.gardens.findIndex((g) => g.id === id)
  if (index < 0) return { next: s }
  const garden = s.gardens[index]
  const snapshot: GardenSnapshot = {
    garden,
    index,
    plants: s.plants.filter((p) => p.gardenId === id),
    tasksDone: s.tasksDone.filter((t) => t.gardenId === id),
    wasActive: s.activeGardenId === id,
  }
  const gardens = s.gardens.filter((g) => g.id !== id)
  return {
    snapshot,
    next: {
      gardens,
      plants: s.plants.filter((p) => p.gardenId !== id),
      tasksDone: s.tasksDone.filter((t) => t.gardenId !== id),
      activeGardenId: s.activeGardenId === id ? gardens[0]?.id : s.activeGardenId,
    },
  }
}

/** Remet un jardin supprimé à sa place, avec ses plantes et ses tâches. */
export function restoreGardenData(s: Data, snap: GardenSnapshot): Data {
  if (s.gardens.some((g) => g.id === snap.garden.id)) return s
  const gardens = [...s.gardens]
  gardens.splice(Math.min(snap.index, gardens.length), 0, snap.garden)
  const known = new Set(s.plants.map((p) => p.id))
  return {
    gardens,
    plants: [...s.plants, ...snap.plants.filter((p) => !known.has(p.id))],
    tasksDone: [...s.tasksDone, ...snap.tasksDone],
    activeGardenId: snap.wasActive || !s.activeGardenId ? snap.garden.id : s.activeGardenId,
  }
}
