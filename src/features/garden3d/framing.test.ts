import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { fitOrtho, fitPerspective, gardenFrame, orthoPixels, ringBounds, sceneHalfSizeFor, viewResetToken } from './framing'

const square = (h: number, cx = 0, cy = 0) => [
  { x: cx - h, y: cy - h },
  { x: cx + h, y: cy - h },
  { x: cx + h, y: cy + h },
  { x: cx - h, y: cy + h },
]

describe('emprise', () => {
  it('prend la parcelle quand elle existe', () => {
    const f = gardenFrame(square(14))
    expect(f.source).toBe('parcelle')
    expect(f.bounds).toEqual({ minX: -14, maxX: 14, minY: -14, maxY: 14 })
    expect(f.halfSizeM).toBe(39) // 14 + 25 de voisinage
  })
  it('se replie sur les plantes + marge, arrondie à 5 m', () => {
    const f = gardenFrame(undefined, [{ position: { x: -3, y: 2 } }, { position: { x: 6, y: 8 } }])
    expect(f.source).toBe('plantes')
    expect(f.bounds).toEqual({ minX: -10, maxX: 10, minY: -5, maxY: 15 })
  })
  it('clé stable quand une plante bouge un peu', () => {
    const a = gardenFrame(undefined, [{ position: { x: -3, y: 2 } }, { position: { x: 5, y: 8 } }])
    const b = gardenFrame(undefined, [{ position: { x: -3.5, y: 2.5 } }, { position: { x: 5.4, y: 8.3 } }])
    expect(a.key).toBe(b.key)
  })
  it('sans parcelle ni plante : ±15 m', () => {
    const f = gardenFrame(undefined, [])
    expect(f.source).toBe('defaut')
    expect(f.bounds.maxX).toBe(15)
    expect(f.bounds.minY).toBe(-15)
  })
  it('ring à moins de 3 points : ignoré', () => {
    expect(gardenFrame([{ x: 0, y: 0 }, { x: 1, y: 1 }]).source).toBe('defaut')
    expect(ringBounds([])).toBeNull()
  })
  it('demi-côté de scène borné et couvrant une parcelle décentrée', () => {
    expect(sceneHalfSizeFor({ minX: -2, maxX: 2, minY: -2, maxY: 2 })).toBe(30)
    expect(sceneHalfSizeFor({ minX: -10, maxX: 30, minY: -5, maxY: 5 })).toBe(55)
    expect(sceneHalfSizeFor({ minX: -500, maxX: 500, minY: -5, maxY: 5 })).toBe(100)
  })
  it('texture : entre 1024 et 2048 px', () => {
    expect(orthoPixels(39)).toBe(1024)
    expect(orthoPixels(100)).toBeLessThanOrEqual(2048)
    expect(orthoPixels(100)).toBeGreaterThanOrEqual(1024)
  })
})

describe('cadrage orthographique', () => {
  const b = { minX: -14, maxX: 14, minY: -14, maxY: 14 }
  it('remplit la dimension limitante avec 15 % de marge', () => {
    const f = fitOrtho(b, 1000, 600)
    expect(f.zoom).toBeCloseTo(600 / (28 * 1.15), 5)
    expect(f.target).toEqual([0, 0, -0])
  })
  it('portrait : limité par la largeur', () => {
    const f = fitOrtho(b, 390, 844)
    expect(f.zoom).toBeCloseTo(390 / (28 * 1.15), 5)
  })
  it('tient compte des bandeaux et décale la cible', () => {
    const f = fitOrtho(b, 1000, 800, { top: 60, bottom: 140, left: 0, right: 0 })
    expect(f.zoom).toBeCloseTo(600 / (28 * 1.15), 5)
    // zone utile plus haute que le milieu du canvas : la cible descend vers le sud (+Z)
    expect(f.target[2]).toBeGreaterThan(0)
    // le centre de l'emprise apparaît bien au centre de la zone utile
    const screenY = 400 + f.zoom * (0 - f.target[2])
    expect(screenY).toBeCloseTo(60 + 300, 5)
  })
  it('un bandeau de coin ne réduit la zone que si l’emprise passe dessous', () => {
    const chip = { x0: 0, y0: 0, x1: 120, y1: 70 }
    // portrait : l'emprise est limitée par la largeur et ne touche pas le coin → zoom sans bandeau du haut
    const free = fitOrtho(b, 390, 450, { top: 80, bottom: 100, left: 0, right: 0, corners: [chip] })
    const blocked = fitOrtho(b, 390, 450, { top: 80, bottom: 100, left: 0, right: 0 })
    expect(free.zoom).toBeGreaterThanOrEqual(blocked.zoom)
    const chipBig = { x0: 0, y0: 0, x1: 390, y1: 70 } // bandeau pleine largeur : toujours dessous
    const full = fitOrtho(b, 390, 450, { top: 80, bottom: 100, left: 0, right: 0, corners: [chipBig] })
    expect(full.zoom).toBeCloseTo(blocked.zoom, 5)
  })
  it('parcelle décentrée', () => {
    const f = fitOrtho({ minX: 10, maxX: 30, minY: 0, maxY: 20 }, 800, 800)
    expect(f.target[0]).toBeCloseTo(20)
    expect(f.target[2]).toBeCloseTo(-10)
  })
})

describe('cadrage en perspective', () => {
  const b = { minX: -14, maxX: 14, minY: -14, maxY: 14 }
  function corners(fit: ReturnType<typeof fitPerspective>, w: number, h: number) {
    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)
    cam.position.set(...fit.position)
    cam.lookAt(...fit.target)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
    return [
      [-14, 14],
      [14, 14],
      [-14, -14],
      [14, -14],
    ].map(([x, y]) => new THREE.Vector3(x, 0, -y).project(cam))
  }
  it('tous les coins de la parcelle sont visibles', () => {
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ]) {
      const fit = fitPerspective(b, w, h)
      for (const c of corners(fit, w, h)) {
        expect(Math.abs(c.x)).toBeLessThanOrEqual(1)
        expect(Math.abs(c.y)).toBeLessThanOrEqual(1)
      }
    }
  })
  it('une petite parcelle donne une caméra proche, bornes de distance cohérentes', () => {
    const small = fitPerspective(b, 1280, 800)
    const big = fitPerspective({ minX: -60, maxX: 60, minY: -60, maxY: 60 }, 1280, 800)
    expect(small.distance).toBeLessThan(big.distance)
    expect(small.distance).toBeLessThan(60)
    expect(small.minDistance).toBeLessThanOrEqual(2)
    expect(small.maxDistance).toBeGreaterThan(small.distance)
  })
})

describe('jetons de recadrage (pas de téléportation)', () => {
  const plant = (x: number, y: number) => ({ position: { x, y } })
  it('sans parcelle, une plante qui sort des bornes change frame.key mais pas les jetons', () => {
    const before = gardenFrame(undefined, [plant(0, 0), plant(3, 3)])
    const after = gardenFrame(undefined, [plant(0, 0), plant(3, 3), plant(40, 3)])
    expect(after.key).not.toBe(before.key)
    for (const mode of ['dessus', 'perspective'] as const) {
      expect(viewResetToken({ mode, gardenId: 'g1', nonce: 0 })).toBe(viewResetToken({ mode, gardenId: 'g1', nonce: 0 }))
    }
  })
  it('« Recentrer », autre jardin, autre mode : le jeton change', () => {
    const base = viewResetToken({ mode: 'perspective', gardenId: 'g1', nonce: 0 })
    expect(viewResetToken({ mode: 'perspective', gardenId: 'g1', nonce: 1 })).not.toBe(base)
    expect(viewResetToken({ mode: 'perspective', gardenId: 'g2', nonce: 0 })).not.toBe(base)
    expect(viewResetToken({ mode: 'dessus', gardenId: 'g1', nonce: 0 })).not.toBe(base)
  })
})
