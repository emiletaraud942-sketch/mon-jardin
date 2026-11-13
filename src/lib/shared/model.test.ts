import { describe, expect, it } from 'vitest'
import type { Plant } from '../../types'
import { applyPush, emptySyncState, laterTs, planPull, planPush, plantHash, remotePlantData, stableJson, tsKey, type RemoteRow, type SharedSyncState } from './model'

const plant = (id: string, over: Partial<Plant> = {}): Plant => ({ id, gardenId: 'g', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2026-03-01', status: 'en-place', photos: [], ...over })
const make = (id: string, data: Record<string, unknown>, existing?: Plant): Plant => ({ ...(data as unknown as Plant), id, gardenId: 'g', photos: existing?.photos ?? [] })
const nameOf = (p: Plant | undefined, d: Record<string, unknown>) => p?.customName || String(d.speciesId ?? 'plante')
const row = (id: string, at: string, data: Record<string, unknown> = {}, deleted = false): RemoteRow => ({ id, data, deleted, updated_at: at })

describe('ce qui voyage', () => {
  it('garde les photos, le journal, l’achat et le jardin local sur l’appareil', () => {
    const p = plant('a', { photos: ['photo:x'], photoMeta: { 'photo:x': { note: 'n' } }, purchase: { form: 'godet', price: 12 } as never, notes: 'Taillé en mars', keeper: 'Léa' })
    const d = remotePlantData(p)
    expect(d).not.toHaveProperty('photos')
    expect(d).not.toHaveProperty('photoMeta')
    expect(d).not.toHaveProperty('purchase')
    expect(d).not.toHaveProperty('gardenId')
    expect(d).toMatchObject({ speciesId: 'pommier', notes: 'Taillé en mars', keeper: 'Léa' })
  })
  it('l’empreinte ne dépend pas de l’ordre des champs et ignore les photos', () => {
    const a = plant('a', { photos: ['photo:1'] })
    const b = { ...plant('a'), position: { y: 2, x: 1 } }
    expect(plantHash(a)).toBe(plantHash(b))
    expect(plantHash(plant('a', { notes: 'x' }))).not.toBe(plantHash(a))
    expect(stableJson({ b: 1, a: undefined, c: [2, { z: 1, y: 2 }] })).toBe('{"b":1,"c":[2,{"y":2,"z":1}]}')
  })
  it('compare des heures de longueurs de fraction différentes', () => {
    expect(tsKey('2026-11-13T20:53:47.37+00:00')).toBe('2026-11-13T20:53:47.370000+00:00')
    expect(laterTs('2026-11-13T20:53:47.37+00:00', '2026-11-13T20:53:47.370001+00:00')).toBe('2026-11-13T20:53:47.370001+00:00')
    expect(laterTs('2026-11-13T20:53:47.4+00:00', '2026-11-13T20:53:47.373+00:00')).toBe('2026-11-13T20:53:47.4+00:00')
    expect(laterTs(undefined, 'x')).toBe('x')
  })
})

describe('envoi', () => {
  it('envoie les nouvelles plantes sans base, puis plus rien tant que rien ne change', () => {
    const p = plant('a')
    const rows = planPush([p], emptySyncState())
    expect(rows).toEqual([{ id: 'a', data: remotePlantData(p), deleted: false }])
    const st = applyPush(emptySyncState(), rows, { ok: [{ id: 'a', updated_at: 'T1' }], conflicts: [] }, [p])
    expect(planPush([p], st)).toEqual([])
    expect(st.known.a.base).toBe('T1')
  })
  it('envoie une modification avec la base connue', () => {
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(plant('a')) } } }
    const rows = planPush([plant('a', { notes: 'neuf' })], st)
    expect(rows).toHaveLength(1)
    expect(rows[0].base).toBe('T1')
  })
  it('une plante retirée devient une suppression douce, une seule fois', () => {
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: 'h' } } }
    const rows = planPush([], st)
    expect(rows).toEqual([{ id: 'a', data: {}, deleted: true, base: 'T1' }])
    const after = applyPush(st, rows, { ok: [{ id: 'a', updated_at: 'T2' }], conflicts: [] }, [])
    expect(after.known.a).toEqual({ base: 'T2', hash: '', deleted: true })
    expect(planPush([], after)).toEqual([])
  })
  it('annuler une suppression remet la plante avec la base de la suppression', () => {
    const st: SharedSyncState = { known: { a: { base: 'T2', hash: '', deleted: true } } }
    const rows = planPush([plant('a')], st)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'a', deleted: false, base: 'T2' })
  })
})

describe('reprise', () => {
  it('ajoute une plante reçue, garde les photos locales d’une plante connue', () => {
    const mine = plant('a', { photos: ['photo:1'] })
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(mine) } } }
    const out = planPull([mine], [row('a', 'T2', { ...remotePlantData(mine), notes: 'vu par Léa' }), row('b', 'T2', remotePlantData(plant('b')))], st, make, nameOf)
    expect(out.plants.map((p) => p.id).sort()).toEqual(['a', 'b'])
    expect(out.plants.find((p) => p.id === 'a')).toMatchObject({ notes: 'vu par Léa', photos: ['photo:1'] })
    expect(out.conflicts).toEqual([])
    expect(out.state.since).toBe('T2')
    expect(out.state.known.b.base).toBe('T2')
    expect(out.changed).toBe(true)
  })
  it('ignore la version qu’on connaît déjà (le retour de son propre envoi)', () => {
    const mine = plant('a')
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(mine) } } }
    const out = planPull([mine], [row('a', 'T1', remotePlantData(mine))], st, make, nameOf)
    expect(out.changed).toBe(false)
    expect(out.conflicts).toEqual([])
  })
  it('une suppression reçue retire la plante', () => {
    const mine = plant('a')
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(mine) } } }
    const out = planPull([mine], [row('a', 'T2', {}, true)], st, make, nameOf)
    expect(out.plants).toEqual([])
    expect(out.state.known.a.deleted).toBe(true)
  })
  it('conflit : la version en ligne est gardée et la personne est prévenue, avec le nom de la plante', () => {
    const synced = plant('a')
    const mine = plant('a', { notes: 'ma modif locale', customName: 'Mon pommier' })
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(synced) } } }
    const out = planPull([mine], [row('a', 'T2', { ...remotePlantData(synced), notes: 'modif de Léa' })], st, make, nameOf)
    expect(out.plants[0].notes).toBe('modif de Léa')
    expect(out.conflicts).toEqual([{ id: 'a', name: 'Mon pommier' }])
  })
  it('conflit aussi quand j’ai supprimé et qu’un autre a modifié', () => {
    const synced = plant('a')
    const st: SharedSyncState = { known: { a: { base: 'T1', hash: plantHash(synced) } } }
    const out = planPull([], [row('a', 'T2', { ...remotePlantData(synced), notes: 'modif' })], st, make, nameOf)
    expect(out.conflicts).toHaveLength(1)
    expect(out.plants.map((p) => p.id)).toEqual(['a']) // la plante revient : la modif de l'autre compte
  })
  it('une ligne illisible est laissée de côté sans casser le reste', () => {
    const bad = (id: string, d: Record<string, unknown>) => (d.speciesId === 'x' ? undefined : make(id, d))
    const out = planPull([], [row('a', 'T1', { speciesId: 'x' }), row('b', 'T1', remotePlantData(plant('b')))], emptySyncState(), bad, nameOf)
    expect(out.plants.map((p) => p.id)).toEqual(['b'])
    expect(out.state.known.a).toBeUndefined()
  })
  it('reçoit les lignes dans l’ordre des heures et garde la plus récente comme repère', () => {
    const out = planPull([], [row('b', '2026-01-01T00:00:00.5+00:00', remotePlantData(plant('b'))), row('a', '2026-01-01T00:00:00.25+00:00', remotePlantData(plant('a')))], emptySyncState(), make, nameOf)
    expect(out.state.since).toBe('2026-01-01T00:00:00.5+00:00')
  })
})
