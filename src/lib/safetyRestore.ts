import type { StateData } from './migrate'
import { migrateState } from './migrate'
import { listPhotoIds } from './photos'
import { getState, keepLocalSafetyCopy, readSafetyCopies, replaceData, setActiveGarden } from './store'

export interface SafetyCopySummary {
  id: 'recente' | 'precedente'
  data: StateData
  /** Pour chaque jardin : nom, plantes, points de vue en photos, et combien de ces photos sont encore sur ce téléphone. */
  gardens: { id: string; name: string; plants: number; points: number; photosHere: number; photosTotal: number; here: boolean }[]
}

/** Les copies de sécurité lisibles de cet appareil (la récente et la précédente), avec ce qu'elles contiennent. */
export async function listSafetyCopies(): Promise<SafetyCopySummary[]> {
  const out: SafetyCopySummary[] = []
  const have = new Set(await listPhotoIds().catch(() => [] as string[]))
  const now = getState()
  for (const { id, raw } of await readSafetyCopies()) {
    const m = migrateState(raw)
    if (!m.ok) continue
    const gardens = m.data.gardens.map((g) => {
      const ids = (g.panoramas ?? []).flatMap((p) => p.shots.map((x) => x.photoId))
      return {
        id: g.id,
        name: g.name,
        plants: m.data.plants.filter((p) => p.gardenId === g.id).length,
        points: g.panoramas?.length ?? 0,
        photosHere: ids.filter((x) => have.has(x)).length,
        photosTotal: ids.length,
        here: now.gardens.some((x) => x.id === g.id),
      }
    })
    out.push({ id, data: m.data, gardens })
  }
  return out
}

/**
 * Remet dans l'état actuel ce que les copies de sécurité ont en plus : les jardins absents (avec leurs plantes), les plantes absentes,
 * les points de vue en photos des jardins qui n'en ont pas. N'efface RIEN et ne change pas le jardin ouvert. Une copie de l'état actuel est
 * gardée avant (comme pour tout remplacement). Renvoie ce qui a été ajouté, ou `undefined` si la copie de l'état actuel a échoué.
 */
export async function restoreFromSafetyCopies(copies: StateData[]): Promise<{ gardens: number; plants: number; points: number } | undefined> {
  const state = getState()
  let gardens = state.gardens
  let plants = state.plants
  const added = { gardens: 0, plants: 0, points: 0 }
  for (const data of copies) {
    const gardenIds = new Set(gardens.map((g) => g.id))
    const plantIds = new Set(plants.map((p) => p.id))
    const newGardens = data.gardens.filter((g) => !gardenIds.has(g.id))
    gardens = gardens.map((g) => {
      const old = data.gardens.find((x) => x.id === g.id)
      if (old?.panoramas?.length && !g.panoramas?.length) {
        added.points += old.panoramas.length
        return { ...g, panoramas: old.panoramas }
      }
      return g
    })
    for (const g of newGardens) added.points += g.panoramas?.length ?? 0
    const allIds = new Set([...gardenIds, ...newGardens.map((g) => g.id)])
    const newPlants = data.plants.filter((p) => !plantIds.has(p.id) && allIds.has(p.gardenId))
    gardens = [...gardens, ...newGardens]
    plants = [...plants, ...newPlants]
    added.gardens += newGardens.length
    added.plants += newPlants.length
  }
  if (added.gardens === 0 && added.plants === 0 && added.points === 0) return added
  if (!(await keepLocalSafetyCopy())) return undefined
  const active = state.activeGardenId
  replaceData({ gardens, plants, tasksDone: state.tasksDone }, { keepPhotos: true })
  if (active && getState().gardens.some((g) => g.id === active)) setActiveGarden(active)
  return added
}
