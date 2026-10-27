import { describe, expect, it } from 'vitest'
import type { Garden, Plant } from '../../types'
import { photosOf, removeGardenData, restoreGardenData } from './gardenDelete'

const g = (id: string): Garden => ({ id, name: id, address: 'a', center: { lon: 0, lat: 0 }, createdAt: '2026-01-01' })
const p = (id: string, gardenId: string, photos: string[] = []): Plant => ({ id, gardenId, speciesId: 'pommier', position: { x: 0, y: 0 }, plantedAt: '2026-01-01', status: 'en-place', photos })
const state = () => ({
  gardens: [g('a'), g('b'), g('c')],
  plants: [p('1', 'a', ['ph1']), p('2', 'b'), p('3', 'b', ['ph2'])],
  tasksDone: [{ id: 't1', gardenId: 'b', taskKey: 'k', doneAt: '2026-01-02' }],
  activeGardenId: 'b' as string | undefined,
})

describe('suppression d’un jardin avec annulation', () => {
  it('retire le jardin, ses plantes et ses tâches', () => {
    const { next, snapshot } = removeGardenData(state(), 'b')
    expect(next.gardens.map((x) => x.id)).toEqual(['a', 'c'])
    expect(next.plants.map((x) => x.id)).toEqual(['1'])
    expect(next.tasksDone).toEqual([])
    expect(next.activeGardenId).toBe('a')
    expect(snapshot?.plants).toHaveLength(2)
    expect(photosOf(snapshot!)).toEqual(['ph2'])
  })

  it('les photos des points de vue partent aussi avec le jardin', () => {
    const st = state()
    st.gardens[1] = { ...st.gardens[1], panoramas: [{ id: 'pv', x: 0, y: 0, takenAt: '2026-05-03', kind: 'guide', shots: [{ photoId: 'photo:v1', headingDeg: 0, fovDeg: 60 }] }] }
    const { snapshot } = removeGardenData(st, 'b')
    expect(photosOf(snapshot!)).toEqual(['ph2', 'photo:v1'])
  })

  it('annuler remet tout à sa place', () => {
    const before = state()
    const { next, snapshot } = removeGardenData(before, 'b')
    const back = restoreGardenData(next, snapshot!)
    expect(back.gardens.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(back.plants.map((x) => x.id).sort()).toEqual(['1', '2', '3'])
    expect(back.tasksDone).toHaveLength(1)
    expect(back.activeGardenId).toBe('b')
  })

  it('annuler deux fois ne double rien', () => {
    const { next, snapshot } = removeGardenData(state(), 'b')
    const once = restoreGardenData(next, snapshot!)
    const twice = restoreGardenData(once, snapshot!)
    expect(twice.gardens).toHaveLength(3)
    expect(twice.plants).toHaveLength(3)
  })

  it('jardin inconnu : rien ne change', () => {
    const s = state()
    expect(removeGardenData(s, 'zzz').snapshot).toBeUndefined()
  })

  it('le dernier jardin supprimé, puis rétabli, redevient le jardin actif', () => {
    const only = { gardens: [g('a')], plants: [], tasksDone: [], activeGardenId: 'a' as string | undefined }
    const { next, snapshot } = removeGardenData(only, 'a')
    expect(next.activeGardenId).toBeUndefined()
    expect(restoreGardenData(next, snapshot!).activeGardenId).toBe('a')
  })
})
