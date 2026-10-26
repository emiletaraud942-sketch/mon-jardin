import { describe, expect, it } from 'vitest'
import { compactTasksDone, migrateState, serializeState, STATE_VERSION } from './migrate'
import { isoDate } from './dates'

const garden = { id: 'g1', name: 'Jardin', address: 'Lyon', center: { lon: 4.83, lat: 45.76 }, createdAt: '2025-01-01T00:00:00.000Z' }
const plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2024-03-10', status: 'en-place', photos: [] }

const ok = (raw: unknown) => {
  const r = migrateState(raw)
  if (!r.ok) throw new Error('attendu ok : ' + r.error)
  return r
}

describe('migrateState', () => {
  it('accepte un ancien format v1 sans version', () => {
    const r = ok({ gardens: [garden], plants: [plant] })
    expect(r.data.gardens).toHaveLength(1)
    expect(r.data.plants).toHaveLength(1)
    expect(r.data.tasksDone).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('accepte un export version 1 explicite', () => {
    expect(ok({ version: 1, exportedAt: 'x', gardens: [garden], plants: [plant], tasksDone: [] }).data.plants).toHaveLength(1)
  })

  it('refuse ce qui n’est pas exploitable', () => {
    for (const raw of [null, undefined, 42, 'abc', [], {}, { gardens: 'x' }, { foo: 1 }]) {
      expect(migrateState(raw).ok).toBe(false)
    }
  })

  it('refuse une version plus récente que celle de l’appli', () => {
    const r = migrateState({ version: STATE_VERSION + 1, gardens: [garden], plants: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/plus récente/)
  })

  it('accepte des jardins sans tableau de plantes', () => {
    expect(ok({ gardens: [garden] }).data.plants).toEqual([])
  })

  it('écarte les jardins sans id ou sans centre valide', () => {
    const r = ok({
      gardens: [
        garden,
        { ...garden, id: undefined },
        { ...garden, id: 'g2', center: undefined },
        { ...garden, id: 'g3', center: { lon: NaN, lat: 1 } },
        { ...garden, id: 'g4', center: { lon: '4', lat: 45 } },
        { ...garden, id: 'g5', center: { lon: 4, lat: 95 } },
        null,
      ],
      plants: [],
    })
    expect(r.data.gardens.map((g) => g.id)).toEqual(['g1'])
    expect(r.warnings.join(' ')).toMatch(/6 jardins/)
  })

  it('écarte les plantes sans id, sans position ou sans jardin existant', () => {
    const r = ok({
      gardens: [garden],
      plants: [
        plant,
        { ...plant, id: undefined },
        { ...plant, id: 'p2', position: undefined },
        { ...plant, id: 'p3', position: { x: 1, y: NaN } },
        { ...plant, id: 'p4', gardenId: 'inconnu' },
        { ...plant, id: 'p5', speciesId: undefined },
      ],
    })
    expect(r.data.plants.map((p) => p.id)).toEqual(['p1'])
    expect(r.warnings).toContain('2 plantes sans position ont été ignorées.')
    expect(r.warnings.some((w) => /jardin/.test(w) && /1 plante/.test(w))).toBe(true)
  })

  it('met un singulier quand il n’y en a qu’une', () => {
    const r = ok({ gardens: [garden], plants: [plant, { ...plant, id: 'p2', position: null }] })
    expect(r.warnings).toContain('1 plante sans position a été ignorée.')
  })

  it('corrige une date de plantation invalide avec la date du jour', () => {
    const r = ok({ gardens: [garden], plants: [{ ...plant, plantedAt: 'pas une date' }, { ...plant, id: 'p2', plantedAt: undefined }, { ...plant, id: 'p3', plantedAt: '2024-13-45' }] })
    for (const p of r.data.plants) expect(p.plantedAt).toBe(isoDate())
    expect(r.warnings.join(' ')).toMatch(/3 plantes/)
    expect(r.warnings.join(' ')).toMatch(/date de plantation/)
  })

  it('conserve une date valide, y compris au format complet', () => {
    const r = ok({ gardens: [garden], plants: [{ ...plant, plantedAt: '2024-03-10T10:00:00.000Z' }] })
    expect(r.data.plants[0].plantedAt).toBe('2024-03-10T10:00:00.000Z')
    expect(r.warnings).toEqual([])
  })

  it('valide les mesures : nombres finis 0-60 m, dates valides, 50 au plus', () => {
    const mesures = [
      { at: '2024-05-01', heightM: 1.2, spreadM: 0.8 },
      { at: '2024-13-45', heightM: 2 },
      { at: '2024-06-01', heightM: Number.NaN },
      { at: '2024-06-02', heightM: 61 },
      { at: '2024-06-03', heightM: -1, spreadM: 3 },
      { at: '2024-06-04', heightM: '3' },
      'x',
    ]
    const r = ok({ gardens: [garden], plants: [{ ...plant, measurements: mesures }] })
    expect(r.data.plants[0].measurements).toEqual([{ at: '2024-05-01', heightM: 1.2, spreadM: 0.8 }, { at: '2024-06-03', spreadM: 3 }])
    expect(r.warnings.join(' ')).toMatch(/mesures invalides/)
    const beaucoup = Array.from({ length: 80 }, (_, i) => ({ at: '2024-05-01', heightM: 1 + i / 100 }))
    expect(ok({ gardens: [garden], plants: [{ ...plant, measurements: beaucoup }] }).data.plants[0].measurements).toHaveLength(50)
    const sans = ok({ gardens: [garden], plants: [{ ...plant, measurements: 'oups' }, { ...plant, id: 'p2' }] })
    expect(sans.data.plants[0].measurements).toBeUndefined()
    expect(sans.data.plants[1]).not.toHaveProperty('measurements')
  })

  it('remplace un statut inconnu par en-place', () => {
    const r = ok({ gardens: [garden], plants: [{ ...plant, status: 'zombie' }, { ...plant, id: 'p2', status: undefined }, { ...plant, id: 'p3', status: 'projet' }] })
    expect(r.data.plants.map((p) => p.status)).toEqual(['en-place', 'en-place', 'projet'])
  })

  it('remplace photos non tableau par [] et filtre les non-chaînes', () => {
    const r = ok({ gardens: [garden], plants: [{ ...plant, photos: 'x' }, { ...plant, id: 'p2', photos: undefined }, { ...plant, id: 'p3', photos: ['photo:a', 3, null] }] })
    expect(r.data.plants.map((p) => p.photos)).toEqual([[], [], ['photo:a']])
  })

  it('supprime les doublons d’id', () => {
    const r = ok({
      gardens: [garden, { ...garden, name: 'Doublon' }],
      plants: [plant, { ...plant, position: { x: 9, y: 9 } }],
      tasksDone: [
        { id: 't1', gardenId: 'g1', taskKey: 'k', doneAt: '2026-01-01T00:00:00.000Z' },
        { id: 't1', gardenId: 'g1', taskKey: 'k2', doneAt: '2026-01-02T00:00:00.000Z' },
      ],
    })
    expect(r.data.gardens).toHaveLength(1)
    expect(r.data.gardens[0].name).toBe('Jardin')
    expect(r.data.plants).toHaveLength(1)
    expect(r.data.tasksDone).toHaveLength(1)
    expect(r.warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('retire les coordonnées de parcelle et de bâtiments invalides sans écarter le jardin', () => {
    const r = ok({
      gardens: [
        {
          ...garden,
          parcel: [{ x: 0, y: 0 }, { x: 1, y: NaN }, { x: 2, y: 2 }],
          buildings: [
            { id: 'b1', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], heightM: 6 },
            { id: 'b2', ring: [{ x: 0, y: 0 }, { x: 'a', y: 0 }, { x: 4, y: 4 }], heightM: 6 },
            { id: 'b3', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }], heightM: 6 },
            { id: 'b4', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], heightM: NaN },
          ],
          terrain: { size: 30, n: 3, heights: [0, 1, 2] },
          altitudeM: NaN,
        },
      ],
      plants: [],
    })
    const g = r.data.gardens[0]
    expect(g.parcel).toBeUndefined()
    expect(g.buildings?.map((b) => b.id)).toEqual(['b1'])
    expect(g.terrain).toBeUndefined()
    expect(g.altitudeM).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/parcelle/)
    expect(r.warnings.join(' ')).toMatch(/bâtiment/)
    expect(r.warnings.join(' ')).toMatch(/relief/)
  })

  it('conserve une parcelle et un relief valides', () => {
    const parcel = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const terrain = { size: 10, n: 2, heights: [0, 1, 2, 3] }
    const g = ok({ gardens: [{ ...garden, parcel, terrain, altitudeM: 200 }], plants: [] }).data.gardens[0]
    expect(g.parcel).toEqual(parcel)
    expect(g.terrain).toEqual(terrain)
    expect(g.altitudeM).toBe(200)
  })

  it('complète les champs texte et la date de création manquants du jardin', () => {
    const g = ok({ gardens: [{ id: 'g1', center: { lon: 1, lat: 2 } }], plants: [] }).data.gardens[0]
    expect(typeof g.name).toBe('string')
    expect(g.name.length).toBeGreaterThan(0)
    expect(g.address).toBe('')
    expect(Number.isFinite(Date.parse(g.createdAt))).toBe(true)
  })

  it('nettoie tasksDone : entrées sans clé, date invalide ou jardin inconnu', () => {
    const r = ok({
      gardens: [garden],
      plants: [],
      tasksDone: [
        { id: 't1', gardenId: 'g1', taskKey: 'a', doneAt: '2026-01-01T00:00:00.000Z' },
        { id: 't2', gardenId: 'g1', doneAt: '2026-01-01T00:00:00.000Z' },
        { id: 't3', gardenId: 'g1', taskKey: 'b', doneAt: 'nope' },
        { id: 't4', gardenId: 'zzz', taskKey: 'c', doneAt: '2026-01-01T00:00:00.000Z' },
        { gardenId: 'g1', taskKey: 'd', doneAt: '2026-01-01T00:00:00.000Z' },
        'x',
      ],
    })
    expect(r.data.tasksDone.map((t) => t.taskKey)).toEqual(['a', 'd'])
    expect(r.data.tasksDone[1].id).toBeTruthy()
  })

  it('tasksDone non tableau devient []', () => {
    expect(ok({ gardens: [garden], plants: [], tasksDone: 'x' }).data.tasksDone).toEqual([])
  })

  it('ne mute pas l’entrée', () => {
    const raw = { gardens: [garden], plants: [{ ...plant, plantedAt: 'x' }] }
    const copy = JSON.parse(JSON.stringify(raw))
    migrateState(raw)
    expect(raw).toEqual(copy)
  })

  it('est idempotent', () => {
    const first = ok({ gardens: [garden], plants: [plant, { ...plant, id: 'p2', plantedAt: 'x', status: 'bof' }] })
    const second = ok(serializeState(first.data))
    expect(second.data).toEqual(first.data)
    expect(second.warnings).toEqual([])
  })
})

describe('serializeState', () => {
  it('produit le format d’export versionné', () => {
    const out = serializeState({ gardens: [], plants: [], tasksDone: [] })
    expect(out.version).toBe(STATE_VERSION)
    expect(Number.isFinite(Date.parse(out.exportedAt))).toBe(true)
    expect(Object.keys(out).sort()).toEqual(['exportedAt', 'gardens', 'plants', 'tasksDone', 'version'])
  })
})

describe('compactTasksDone', () => {
  const now = new Date('2026-10-18T12:00:00.000Z')
  const t = (id: string, taskKey: string, doneAt: string) => ({ id, gardenId: 'g1', taskKey, doneAt })

  it('supprime ce qui date de plus de 400 jours', () => {
    const out = compactTasksDone([t('1', '2025-01-01:a', '2025-01-01T10:00:00.000Z'), t('2', '2026-10-01:b', '2026-10-01T10:00:00.000Z')], now)
    expect(out.map((x) => x.id)).toEqual(['2'])
  })

  it('ne garde que la dernière entrée par clé de base hors des 30 derniers jours', () => {
    const out = compactTasksDone(
      [
        t('1', '2026-02-01:pommier:arrosage:0', '2026-02-01T10:00:00.000Z'),
        t('2', '2026-03-01:pommier:arrosage:0', '2026-03-01T10:00:00.000Z'),
        t('3', '2026-04-01:pommier:arrosage:0', '2026-04-01T10:00:00.000Z'),
        t('4', '2026-04-01:poirier:arrosage:0', '2026-04-01T10:00:00.000Z'),
      ],
      now,
    )
    expect(out.map((x) => x.id).sort()).toEqual(['3', '4'])
  })

  it('garde toutes les entrées récentes (nuits de gel à venir par exemple)', () => {
    const rec = [t('1', '2026-10-19:jardin:protection:gel', '2026-10-17T10:00:00.000Z'), t('2', '2026-10-20:jardin:protection:gel', '2026-10-16T10:00:00.000Z')]
    expect(compactTasksDone(rec, now)).toHaveLength(2)
  })

  it('renvoie le même tableau s’il n’y a rien à purger', () => {
    const list = [t('1', 'a:b', '2026-10-17T10:00:00.000Z')]
    expect(compactTasksDone(list, now)).toBe(list)
  })

  it('conserve une entrée à la date illisible plutôt que de la perdre', () => {
    expect(compactTasksDone([t('1', 'a:b', 'nope')], now)).toHaveLength(1)
  })
})
