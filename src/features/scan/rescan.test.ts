import { describe, expect, it } from 'vitest'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { LIMITS } from '../../lib/security/limits'
import type { Plant } from '../../types'
import { newItem, type ScanItem } from './queue'
import { distanceText, SAME_PLANT_M, twinOf } from './rescan'

const plant = (id: string, speciesId: string, x: number, y: number, extra: Partial<Plant> = {}): Plant => ({ id, gardenId: 'g', speciesId, position: { x, y }, plantedAt: '2025-01-01', status: 'en-place', photos: [], ...extra }) as Plant
const item = (speciesId: string, x: number, y: number, extra: Partial<ScanItem> = {}): ScanItem => ({ ...newItem({ id: 'i', gardenId: 'g', photoId: 'photo:abc', position: { x, y }, accuracyM: 3 }), status: 'a-valider', speciesId, ...extra })

describe('twinOf : la plante scannée est-elle déjà posée ici ?', () => {
  it('même espèce à moins de 1,5 m : la plus proche', () => {
    const t = twinOf([plant('a', 'pommier', 1, 0), plant('b', 'pommier', 0.3, 0)], item('pommier', 0, 0))
    expect(t?.plant.id).toBe('b')
    expect(t?.distanceM).toBeCloseTo(0.3)
    expect(t?.canAttach).toBe(true)
  })
  it('pas la même espèce, trop loin, autre jardin : rien', () => {
    expect(twinOf([plant('a', 'poirier', 0.2, 0)], item('pommier', 0, 0))).toBeUndefined()
    expect(twinOf([plant('a', 'pommier', SAME_PLANT_M + 0.1, 0)], item('pommier', 0, 0))).toBeUndefined()
    expect(twinOf([{ ...plant('a', 'pommier', 0, 0), gardenId: 'autre' }], item('pommier', 0, 0))).toBeUndefined()
  })
  it('position inconnue : on ne devine pas', () => {
    expect(twinOf([plant('a', 'pommier', 0, 0)], item('pommier', 0, 0, { accuracyM: 99 }))).toBeUndefined()
  })
  it('sans espèce choisie : rien', () => {
    expect(twinOf([plant('a', 'pommier', 0, 0)], item('pommier', 0, 0, { speciesId: undefined }))).toBeUndefined()
  })
  it('un nom libre : même nom (sans tenir compte de la casse) seulement', () => {
    const p = plant('a', UNKNOWN_SPECIES_ID, 0, 0, { customName: 'Rosier de grand-mère' })
    expect(twinOf([p], item(UNKNOWN_SPECIES_ID, 0, 0, { customName: ' rosier de grand-mère ' }))?.plant.id).toBe('a')
    expect(twinOf([p], item(UNKNOWN_SPECIES_ID, 0, 0, { customName: 'Autre' }))).toBeUndefined()
  })
  it('la plante déjà créée par cet élément n’est pas son propre double', () => {
    expect(twinOf([plant('a', 'pommier', 0, 0)], item('pommier', 0, 0, { plantId: 'a' }))).toBeUndefined()
  })
  it('plante pleine de photos : on le dit, sans proposer d’ajout', () => {
    const full = plant('a', 'pommier', 0, 0, { photos: Array.from({ length: LIMITS.photosPerPlant }, (_, k) => 'photo:' + k) })
    expect(twinOf([full], item('pommier', 0, 0))?.canAttach).toBe(false)
  })
  it('texte de distance', () => {
    expect(distanceText(0.05)).toBe('au même endroit')
    expect(distanceText(0.84)).toBe('à 0,8 m')
  })
})
