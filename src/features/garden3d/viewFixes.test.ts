// Détection WebGL, tactile, préchargement, arbres des environs, ombres de contact.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Building } from '../../types'
import { classifyWebGL, isSoftwareRenderer, probeWebGL, resetWebGLCache, resetWebgl2Cache, webgl2Supported, detectWebGL, webglExplanation, NO_3D_TITLE, force3dRequested, requestForce3d, clearForce3d } from '../../lib/webgl'
import { isTouchPrimary } from './touch'
import { shouldPreload3d } from './preload3d'
import { BARE_LEAF, MAX_NEIGHBOR_TREES, deciduousSeason, foliageColor, layoutNeighborTrees, treeShape } from './neighborLayout'
import { MAX_CONTACT_SHADOWS, SHADOW_LIFT_M, contactShadowInstances, plantShadowDiameter } from './contactShadows'
import type { PlantVisual } from './plantModel'
import { plantStateAt } from '../../engine/growth'
import { SPECIES_BY_ID } from '../../data/species'
import type { Plant } from '../../types'

describe('WebGL2 : verdict', () => {
  it('accéléré : ok', () => {
    expect(classifyWebGL({ strict: true, any: true, renderer: 'Adreno (TM) 650' })).toBe('ok')
    expect(classifyWebGL({ strict: true, any: true })).toBe('ok')
  })
  it('rendu logiciel : software, même si le contexte strict a réussi', () => {
    expect(classifyWebGL({ strict: true, any: true, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))' })).toBe('software')
    expect(classifyWebGL({ strict: true, any: true, renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe('software')
  })
  it('contexte refusé à cause d’un gros défaut de performance : software ; aucun contexte : none', () => {
    expect(classifyWebGL({ strict: false, any: true })).toBe('software')
    expect(classifyWebGL({ strict: false, any: false })).toBe('none')
  })
  it('reconnaît les rendus logiciels sans confondre avec des GPU réels', () => {
    for (const r of ['SwiftShader', 'Mesa llvmpipe', 'Microsoft Basic Render Driver', 'Software Rasterizer']) expect(isSoftwareRenderer(r)).toBe(true)
    for (const r of ['Apple GPU', 'Mali-G78', 'NVIDIA GeForce RTX 3060', 'Intel(R) UHD Graphics 620', undefined, '']) expect(isSoftwareRenderer(r)).toBe(false)
  })
  it('sans navigateur (tests, SSR) : ok, et la sonde ne plante pas', () => {
    resetWebGLCache()
    expect(detectWebGL()).toBe('ok')
    expect(probeWebGL(undefined)).toEqual({ strict: false, any: false })
  })
  it('la sonde libère ses contextes et reste sans erreur si getContext lève', () => {
    let lost = 0
    const gl = { getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: () => lost++ } : null), getParameter: () => 'Mali-G78', RENDERER: 1 }
    const ok = probeWebGL({ createElement: () => ({ getContext: () => gl }) as never })
    expect(ok).toEqual({ strict: true, any: true, renderer: 'Mali-G78' })
    expect(lost).toBe(1)
    expect(probeWebGL({ createElement: () => ({ getContext: () => { throw new Error('boom') } }) as never })).toEqual({ strict: false, any: false })
    // strict refusé, souple accepté
    let calls = 0
    const soft = probeWebGL({ createElement: () => ({ getContext: (_: string, o?: unknown) => (o ? null : (calls++, gl)) }) as never })
    expect(soft.strict).toBe(false)
    expect(soft.any).toBe(true)
  })
  it('textes du repli', () => {
    expect(NO_3D_TITLE).toBe('Votre appareil ne peut pas afficher la 3D')
    expect(webglExplanation('none')).not.toBe(webglExplanation('software'))
  })
})

describe('une seule source de vérité WebGL (carte et 3D)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetWebgl2Cache()
  })
  const gl = { getExtension: () => null, getParameter: () => 'SwiftShader', RENDERER: 1 }
  const stubDoc = (getContext: (id: string, o?: unknown) => unknown) => vi.stubGlobal('document', { createElement: () => ({ getContext }) })
  it('rendu logiciel : la carte (webgl2Supported) reste permise, la 3D dit « software »', () => {
    resetWebgl2Cache()
    stubDoc((_id, o) => (o ? null : gl))
    expect(webgl2Supported()).toBe(true)
    expect(detectWebGL()).toBe('software')
  })
  it('pas de WebGL 2 : la carte et la 3D disent non, avec la même réponse', () => {
    resetWebgl2Cache()
    stubDoc(() => null)
    expect(webgl2Supported()).toBe(false)
    expect(detectWebGL()).toBe('none')
  })
  it('GPU réel : ok partout', () => {
    resetWebgl2Cache()
    stubDoc(() => ({ ...gl, getParameter: () => 'Mali-G78' }))
    expect(webgl2Supported()).toBe(true)
    expect(detectWebGL()).toBe('ok')
  })
  it('« Essayer quand même » : clé de session pj.force3d, effaçable', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    clearForce3d()
    expect(force3dRequested()).toBe(false)
    requestForce3d()
    expect(store.get('pj.force3d')).toBe('1')
    expect(force3dRequested()).toBe(true)
    clearForce3d()
    expect(force3dRequested()).toBe(false)
  })
})

describe('écran tactile (définition unique)', () => {
  const env = (q: Record<string, boolean>, maxTouchPoints = 0) => ({ matches: (s: string) => !!q[s], maxTouchPoints })
  it('pointeur principal grossier : téléphone, tablette (iPad avec clavier compris)', () => {
    expect(isTouchPrimary(env({ '(pointer: coarse)': true }, 5))).toBe(true)
    expect(isTouchPrimary(env({ '(pointer: coarse)': true, '(any-pointer: fine)': true }, 5))).toBe(true)
  })
  it('ordinateur à souris, même avec un écran tactile : pas de joystick', () => {
    expect(isTouchPrimary(env({ '(pointer: fine)': true, '(any-pointer: fine)': true }, 10))).toBe(false)
    expect(isTouchPrimary(env({}, 0))).toBe(false)
  })
  it('navigateur ancien (pas de requête de pointeur) mais des points de contact : tactile', () => {
    expect(isTouchPrimary(env({}, 3))).toBe(true)
  })
})

describe('préchargement du chunk 3D', () => {
  it('jamais en économie de données ni en connexion lente', () => {
    expect(shouldPreload3d({ saveData: true })).toBe(false)
    expect(shouldPreload3d({ effectiveType: '2g' })).toBe(false)
    expect(shouldPreload3d({ effectiveType: 'slow-2g' })).toBe(false)
    expect(shouldPreload3d({ effectiveType: '3g' })).toBe(false)
    expect(shouldPreload3d({ effectiveType: '4g' })).toBe(true)
    expect(shouldPreload3d({})).toBe(true)
    expect(shouldPreload3d(undefined)).toBe(true)
  })
})

const visual = (id: string, over: Partial<PlantVisual>): PlantVisual => ({ id, shape: 'tree', heightM: 4, spreadM: 3, base: [2, 0, -3], label: id, archetype: 'tree', ghost: false, ...over })

describe('arbres des environs : variété et saison', () => {
  const trees = Array.from({ length: 60 }, (_, i) => ({ x: Math.cos(i) * 30, y: Math.sin(i) * 30, heightM: 6 + (i % 9), radiusM: 2 + (i % 4) }))
  const flat = () => 1.5
  const summer = { leaf: 1, tint: 0 }
  it('déterministe : même entrée, même rendu', () => {
    expect(layoutNeighborTrees(trees, summer, flat)).toEqual(layoutNeighborTrees(trees, summer, flat))
  })
  it('plafond de 80 arbres, valeurs invalides écartées', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 0, heightM: 8, radiusM: 3 }))
    const l = layoutNeighborTrees([...big, { x: NaN, y: 0, heightM: 8, radiusM: 3 }], summer, flat)
    expect(l.trees).toBe(MAX_NEIGHBOR_TREES)
    expect(l.trunks.length).toBeLessThanOrEqual(MAX_NEIGHBOR_TREES)
    expect(l.lobes.length).toBeLessThanOrEqual(MAX_NEIGHBOR_TREES * 3)
  })
  it('l’été : plusieurs teintes (≥ 3 couleurs), plusieurs masses par arbre, aucune branche nue', () => {
    const l = layoutNeighborTrees(trees, summer, flat)
    expect(new Set(l.lobes.map((o) => o.color)).size).toBeGreaterThanOrEqual(3)
    expect(l.lobes.length).toBeGreaterThan(l.trunks.length)
    expect(l.bare).toBe(0)
    expect(l.branches).toHaveLength(0)
    expect(l.evergreen).toBeGreaterThan(0) // quelques persistants
  })
  it('l’hiver : les caducs sont nus (tronc haut + branches), les persistants gardent leurs aiguilles', () => {
    const season = deciduousSeason(new Date(2026, 0, 15))
    expect(season.leaf).toBeLessThan(BARE_LEAF)
    const l = layoutNeighborTrees(trees, season, flat)
    expect(l.bare).toBe(trees.length - l.evergreen)
    expect(l.bare).toBeGreaterThan(0)
    expect(l.branches.length).toBe(l.bare * 5)
    expect(l.lobes.length).toBe(l.evergreen * 3)
  })
  it('la saison suit les courbes du moteur : nu en janvier, plein en juin, teinté début novembre', () => {
    expect(deciduousSeason(new Date(2026, 0, 15))).toEqual({ leaf: 0, tint: 0 })
    expect(deciduousSeason(new Date(2026, 5, 21))).toEqual({ leaf: 1, tint: 0 })
    const nov = deciduousSeason(new Date(2026, 10, 8))
    expect(nov.tint).toBeGreaterThan(0.7)
    expect(nov.leaf).toBeLessThan(0.7)
    expect(deciduousSeason(new Date(NaN))).toEqual({ leaf: 1, tint: 0 })
  })
  it('mêmes courbes que le moteur de croissance pour un arbre caduc (tilleul), toute l’année', () => {
    const plant = { id: 'p', gardenId: 'g', speciesId: 'tilleul', position: { x: 0, y: 0 }, plantedAt: '2015-03-01', status: 'en-place', photos: [] } as unknown as Plant
    for (let m = 0; m < 12; m++)
      for (const d of [1, 10, 20, 28]) {
        const at = new Date(2026, m, d)
        const eng = plantStateAt(plant, SPECIES_BY_ID.tilleul, at)
        const mine = deciduousSeason(at)
        expect(mine.leaf).toBeCloseTo(eng.leafCover, 6)
        expect(mine.tint).toBeCloseTo(eng.autumnTint, 6)
      }
  })
  it('les couleurs d’automne diffèrent de celles d’été, les persistants restent verts', () => {
    expect(foliageColor(0, { leaf: 1, tint: 1 }, false)).not.toBe(foliageColor(0, summer, false))
    expect(foliageColor(1, { leaf: 0.5, tint: 1 }, true)).toBe(foliageColor(1, summer, true))
    expect(foliageColor(2, summer, false)).toMatch(/^#[0-9a-f]{6}$/)
  })
  it('les arbres sont posés sur le relief, jamais de NaN', () => {
    const l = layoutNeighborTrees(trees, summer, (x, y) => x * 0.1 + y * 0.05)
    for (const o of [...l.lobes, ...l.trunks]) for (const v of Object.values(o)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
    const t = trees[0]
    const trunk = l.trunks[0]
    expect(trunk.y).toBeCloseTo(t.x * 0.1 + t.y * 0.05, 9)
    expect(trunk.z).toBeCloseTo(-t.y, 9)
    expect(treeShape(t).trunkH).toBeCloseTo(t.heightM * 0.55, 9)
  })
})

describe('ombres de contact', () => {
  const sample = () => 2
  const rect = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
  it('un disque par plante (pas pour les plantes en projet), posé sur le sol', () => {
    const v = { a: visual('a', { base: [1, 3, -2] }), b: visual('b', { ghost: true }) }
    const out = contactShadowInstances({ visuals: v, sample })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ x: 1, z: -2 })
    expect(out[0].y).toBeCloseTo(3 + SHADOW_LIFT_M, 9) // hauteur de la base de la plante
  })
  it('un disque par arbre des environs', () => {
    const out = contactShadowInstances({ visuals: {}, trees: [{ x: 5, y: 6, heightM: 9, radiusM: 3 }], sample })
    expect(out).toHaveLength(1)
    expect(out[0].z).toBe(-6)
    expect(out[0].sx).toBeCloseTo(4.2, 9)
  })
  it('pieds de murs : un disque étiré par arête, côté extérieur, le long de l’arête', () => {
    const b: Building[] = [{ id: 'm', ring: rect(0, 0, 10, 4), heightM: 6 }]
    const out = contactShadowInstances({ visuals: {}, buildings: b, sample })
    expect(out).toHaveLength(4)
    const south = out.find((o) => Math.abs(o.x - 5) < 1e-6 && -o.z < 0)! // arête sud : y = 0, décalée vers le sud (y < 0)
    expect(-south.z).toBeLessThan(0)
    expect(south.sx).toBeGreaterThan(10) // longueur de l'arête + débord
    expect(south.rotY).toBeCloseTo(0, 9)
    // le sens du contour ne change pas le côté
    const cw = contactShadowInstances({ visuals: {}, buildings: [{ id: 'm', ring: rect(0, 0, 10, 4).reverse(), heightM: 6 }], sample })
    const southCw = cw.find((o) => Math.abs(o.x - 5) < 1e-6 && -o.z < 0)
    expect(southCw).toBeTruthy()
  })
  it('bâtiments bas, trop petits ou dégénérés : ignorés', () => {
    const out = contactShadowInstances({ visuals: {}, buildings: [{ id: 'a', ring: rect(0, 0, 3, 3), heightM: 0.1 }, { id: 'b', ring: rect(0, 0, 3, 3).slice(0, 2), heightM: 5 }, { id: 'c', ring: rect(0, 0, 0.3, 0.3), heightM: 5 }], sample })
    expect(out).toHaveLength(0)
  })
  it('plafond respecté et bâtiments proches du jardin servis en premier', () => {
    const b: Building[] = Array.from({ length: 1000 }, (_, i) => ({ id: 'b' + i, ring: rect(i * 3, 0, 2, 2), heightM: 5 }))
    const out = contactShadowInstances({ visuals: {}, buildings: b, sample })
    expect(out.length).toBe(MAX_CONTACT_SHADOWS)
    expect(contactShadowInstances({ visuals: {}, buildings: b, sample, max: 10 })).toHaveLength(10)
    const near = out.reduce((m, o) => Math.min(m, Math.abs(o.x)), Infinity)
    expect(near).toBeLessThan(5)
  })
  it('aucune valeur non finie', () => {
    const out = contactShadowInstances({ visuals: { a: visual('a', { base: [NaN, 0, 0] }) }, trees: [{ x: 1, y: 1, heightM: NaN, radiusM: 2 }], sample })
    expect(out).toHaveLength(0)
    expect(plantShadowDiameter({ shape: 'tree', spreadM: NaN, heightM: 3 })).toBeGreaterThan(0)
  })
})
