import { describe, expect, it } from 'vitest'
import { SPECIES, SPECIES_BY_ID } from '../../data/species'
import type { Plant } from '../../types'
import { buildPlantScene, disposePartGeometries, estimateTriangles, PART_KINDS, partGeometries, partTriangles, renderState } from './plantModel'
import { archetypeOf, generatePlant, type GenTier, type PlantLook } from './plantGen'
import { TRIANGLE_CAP } from './quality'
import { flatSampler } from './terrain'
import type { DetailLevel } from './walk'
import * as THREE from 'three'

const ids = ['pommier', 'cerisier', 'noisetier', 'chene', 'framboisier', 'tomate', 'lavande', 'vigne', 'fraisier', 'courgette', 'basilic', 'consoude']
const mk = (n: number, list = ids): Plant[] =>
  Array.from({ length: n }, (_, i) => ({
    id: 'p' + i,
    gardenId: 'g',
    speciesId: list[i % list.length],
    position: { x: (i % 20) * 3, y: Math.floor(i / 20) * 3 },
    plantedAt: '2019-04-01',
    ageAtPlanting: 2,
    status: 'en-place',
    photos: [],
  }))
const plants = mk(300)
const at = new Date('2026-09-01')
const build = (o: Partial<Parameters<typeof buildPlantScene>[0]> = {}) =>
  buildPlantScene({ plants, speciesById: SPECIES_BY_ID, at, sample: flatSampler, ...o })

describe('modèle des plantes', () => {
  it('les espèces de test existent', () => {
    for (const id of ids) expect(SPECIES_BY_ID[id], id).toBeTruthy()
  })

  it('300 plantes en qualité simple : sous le plafond, au plus 20 appels de dessin', () => {
    const r = build({ tier: 0, triangleCap: TRIANGLE_CAP[0] })
    expect(r.triangles).toBeLessThanOrEqual(TRIANGLE_CAP[0])
    expect(new Set(r.parts.map((p) => p.kind + p.transparent)).size).toBeLessThanOrEqual(PART_KINDS.length * 2)
    expect(r.triangles).toBe(estimateTriangles(r.parts))
  })

  it('60 plantes en détaillé : plafond de 150 k triangles respecté, rapide', () => {
    const t0 = performance.now()
    const r = build({ plants: mk(60), tier: 2, triangleCap: TRIANGLE_CAP[2] })
    const ms = performance.now() - t0
    expect(r.triangles).toBeLessThanOrEqual(150000)
    expect(r.tiers[2] + r.tiers[1]).toBeGreaterThan(0)
    expect(ms).toBeLessThan(800)
  })

  it('le plafond force des niveaux plus simples (aucune plante ne perd ses pièces)', () => {
    const rich = build({ plants: mk(60), tier: 2, triangleCap: 10_000_000 })
    const tight = build({ plants: mk(60), tier: 2, triangleCap: 40000 })
    expect(tight.triangles).toBeLessThan(rich.triangles)
    for (const p of mk(60)) expect(tight.parts.some((x) => x.owner === p.id)).toBe(true)
    expect(rich.tiers[2]).toBe(60)
  })

  it('Promenade : les plantes proches montent de niveau malgré le plafond', () => {
    const lod: Record<string, DetailLevel> = { p0: 2, p5: 2, p7: 1 }
    const base = build({ plants: mk(60), tier: 0 })
    const near = build({ plants: mk(60), tier: 0, lod })
    expect(near.triangles).toBeGreaterThan(base.triangles)
    expect(near.parts.length).toBeGreaterThan(base.parts.length)
  })

  it('déterministe : mêmes pièces d’un appel à l’autre', () => {
    const a = build({ plants: mk(40), tier: 2 }).parts.map((p) => p.kind + p.matrix.elements.join(',') + p.color.getHex())
    const b = build({ plants: mk(40), tier: 2 }).parts.map((p) => p.kind + p.matrix.elements.join(',') + p.color.getHex())
    expect(a).toEqual(b)
  })

  it('géométries mémoïsées', () => {
    expect(partGeometries()).toBe(partGeometries())
  })

  it('estimation de triangles = triangles réels des géométries', () => {
    const t = partTriangles()
    const g = partGeometries()
    for (const k of PART_KINDS) {
      expect(t[k]).toBe(Math.round((g[k].index ? g[k].index!.count : g[k].attributes.position.count) / 3))
      expect(t[k]).toBeGreaterThan(0)
      expect(g[k].attributes.color, k).toBeTruthy()
    }
    expect(t.clump).toBeLessThan(t.blob)
  })
})

describe('graine par plante', () => {
  const look = (id: string, over: Partial<PlantLook> = {}): PlantLook => ({
    id,
    archetype: 'tree',
    H: 6,
    S: 4,
    adultH: 6,
    leaf: 1,
    flower: 0,
    fruit: 0,
    tint: 0,
    vigor: 1,
    dead: false,
    sick: false,
    ghost: false,
    root: false,
    foliage: new THREE.Color('#4c8a3a'),
    accent: new THREE.Color('#c8312f'),
    ...over,
  })
  const sig = (l: PlantLook, tier: GenTier) => generatePlant(l, tier, [0, 0, 0]).map((p) => p.kind + p.matrix.elements.map((v) => v.toFixed(4)).join(',') + p.color.getHexString())
  it('même identifiant = mêmes formes ; autre identifiant = formes et teintes différentes', () => {
    expect(sig(look('a'), 2)).toEqual(sig(look('a'), 2))
    expect(sig(look('a'), 2)).not.toEqual(sig(look('b'), 2))
    const ca = generatePlant(look('a'), 1, [0, 0, 0]).find((p) => p.kind === 'clump')!.color.getHexString()
    const cb = generatePlant(look('zz'), 1, [0, 0, 0]).find((p) => p.kind === 'clump')!.color.getHexString()
    expect(ca).not.toBe(cb)
  })
  it('chaque archétype produit des pièces finies, dans des bornes de taille raisonnables', () => {
    const arch = ['tree', 'fruit', 'conifer', 'shrub', 'hedge', 'perennial', 'grass', 'climber', 'veg', 'ground', 'generic'] as const
    for (const a of arch) {
      for (const tier of [0, 1, 2] as GenTier[]) {
        const H = a === 'ground' ? 0.2 : a === 'tree' ? 12 : 1.5
        const S = a === 'tree' ? 8 : 1.2
        const parts = generatePlant(look('x-' + a, { archetype: a, H, S, adultH: H, flower: 0.8, fruit: 0.8 }), tier, [10, 2, -5])
        expect(parts.length, a).toBeGreaterThan(0)
        let maxX = 0
        let maxY = 0
        const v = new THREE.Vector3()
        for (const p of parts) {
          v.setFromMatrixPosition(p.matrix)
          expect(Number.isFinite(v.x + v.y + v.z), a).toBe(true)
          maxX = Math.max(maxX, Math.abs(v.x - 10), Math.abs(v.z + 5))
          maxY = Math.max(maxY, v.y - 2)
          expect(p.matrix.elements.every(Number.isFinite), a).toBe(true)
        }
        // les pièces restent dans l'emprise de la plante (marge pour l'inclinaison et la taille des touffes)
        expect(maxX, a + tier).toBeLessThan(S * 1.2 + 1)
        expect(maxY, a + tier).toBeLessThan(H * 1.3 + 0.6)
      }
    }
  })
  it('croissance continue : même nombre de pièces à toutes les tailles (pas de saut)', () => {
    for (const a of ['tree', 'fruit', 'shrub', 'hedge', 'perennial', 'climber', 'veg'] as const) {
      const counts = [0.3, 1, 2, 4, 8].map((H) => generatePlant(look('g1', { archetype: a, H, S: H * 0.7, adultH: 3, flower: 0, fruit: 0 }), 2, [0, 0, 0]).length)
      expect(new Set(counts).size, a).toBe(1)
    }
  })
  it('caduc en hiver : squelette de branches sans feuillage ; en été : feuillage', () => {
    const win = generatePlant(look('w', { leaf: 0 }), 2, [0, 0, 0])
    const sum = generatePlant(look('w', { leaf: 1 }), 2, [0, 0, 0])
    expect(win.some((p) => p.kind === 'branch')).toBe(true)
    expect(win.some((p) => p.kind === 'clump' || p.kind === 'blob' || p.kind === 'card')).toBe(false)
    expect(sum.filter((p) => p.kind === 'clump').length).toBeGreaterThan(8)
    expect(estimateTriangles(sum)).toBeGreaterThan(estimateTriangles(win))
  })
  it('fruits seulement quand fruiting > 0, boutons de la couleur d’accent quand flowering > 0', () => {
    const none = generatePlant(look('f', { archetype: 'fruit' }), 2, [0, 0, 0])
    const fr = generatePlant(look('f', { archetype: 'fruit', fruit: 1 }), 2, [0, 0, 0])
    expect(none.filter((p) => p.kind === 'dot').length).toBe(0)
    const dots = fr.filter((p) => p.kind === 'dot')
    expect(dots.length).toBeGreaterThan(5)
    const hsl = { h: 0, s: 0, l: 0 }
    dots[0].color.getHSL(hsl)
    expect(hsl.h < 0.08 || hsl.h > 0.9).toBe(true) // rouge
    const sh = generatePlant(look('r', { archetype: 'shrub', flower: 1, accent: new THREE.Color('#e0201e') }), 2, [0, 0, 0])
    expect(sh.filter((p) => p.kind === 'dot').length).toBeGreaterThan(5)
  })
  it('plante morte : feuillage absent, couleur grise ; projet : transparente', () => {
    const dead = generatePlant(look('d', { dead: true, leaf: 0 }), 2, [0, 0, 0])
    expect(dead.some((p) => p.kind === 'clump')).toBe(false)
    const ghost = generatePlant(look('g', { ghost: true }), 2, [0, 0, 0])
    expect(ghost.every((p) => p.transparent)).toBe(true)
    expect(ghost.some((p) => p.kind === 'card')).toBe(false)
  })
})

describe('archétypes des fiches', () => {
  it('chaque espèce a un archétype, et les arbres/arbustes/grimpantes sont distingués', () => {
    const seen = new Set<string>()
    for (const s of SPECIES) seen.add(archetypeOf(s))
    for (const a of ['tree', 'fruit', 'shrub', 'hedge', 'perennial', 'climber', 'veg', 'ground']) expect(seen.has(a), a).toBe(true)
    expect(archetypeOf(SPECIES_BY_ID.pommier)).toBe('fruit')
    expect(archetypeOf(SPECIES_BY_ID.chene)).toBe('tree')
    expect(archetypeOf(SPECIES_BY_ID.vigne)).toBe('climber')
    expect(archetypeOf(undefined)).toBe('generic')
  })
  it('toutes les espèces, à tous les âges et toutes les saisons : aucune pièce non finie', () => {
    const list = SPECIES.map((s) => s.id)
    const ps = mk(list.length, list)
    for (const date of ['2026-01-15', '2026-04-10', '2026-07-15', '2026-10-20', '2031-07-01', '2046-07-01']) {
      const r = buildPlantScene({ plants: ps, speciesById: SPECIES_BY_ID, at: new Date(date), sample: flatSampler, tier: 2, triangleCap: TRIANGLE_CAP[2] })
      expect(r.triangles).toBeLessThanOrEqual(TRIANGLE_CAP[2] * 1.001)
      for (const p of r.parts) expect(p.matrix.elements.every(Number.isFinite)).toBe(true)
    }
  })
})

describe('saison et âge', () => {
  const pommier = { ...mk(1, ['pommier'])[0], plantedAt: '2020-03-01', ageAtPlanting: 2 }
  const sp = SPECIES_BY_ID.pommier
  it('hiver : sans feuilles ; été : feuillé ; la taille ne dépend pas de la saison choisie', () => {
    const grown = new Date('2026-10-26')
    const winter = renderState(pommier, sp, grown, new Date('2027-01-15'))
    const summer = renderState(pommier, sp, grown, new Date('2027-07-15'))
    expect(winter.leafCover).toBeLessThan(0.05)
    expect(summer.leafCover).toBeGreaterThan(0.9)
    expect(winter.heightM).toBe(summer.heightM)
  })
  it('+10 ans : plus grand', () => {
    const a = renderState(pommier, sp, new Date('2026-10-26'))
    const b = renderState(pommier, sp, new Date('2036-10-26'))
    expect(b.heightM).toBeGreaterThan(a.heightM)
  })
  it('annuelle : ressemée chaque année, cycle visible dans les années futures', () => {
    const t = { ...mk(1, ['tomate'])[0], plantedAt: '2026-05-20', ageAtPlanting: undefined }
    const sp2 = SPECIES_BY_ID.tomate
    const future = renderState(t, sp2, new Date('2031-10-26'), new Date('2031-08-01'))
    expect(future.leafCover).toBeGreaterThan(0.3)
    expect(future.heightM).toBeGreaterThan(0.5)
  })
})

describe('ressources partagées', () => {
  it('disposePartGeometries libère les géométries (événement dispose) et elles sont recréées à la demande', () => {
    const first = partGeometries()
    expect(partGeometries()).toBe(first)
    let disposed = 0
    for (const k of PART_KINDS) first[k].addEventListener('dispose', () => disposed++)
    disposePartGeometries()
    expect(disposed).toBe(PART_KINDS.length)
    const second = partGeometries()
    expect(second).not.toBe(first)
    expect(second.blob.attributes.position.count).toBeGreaterThan(0)
    disposePartGeometries()
    disposePartGeometries()
  })
})
