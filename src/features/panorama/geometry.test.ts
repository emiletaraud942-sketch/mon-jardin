import { describe, expect, it } from 'vitest'
import type { Panorama } from '../../types'
import {
  angleDelta,
  bearingDeg,
  cameraHeadingDeg,
  cameraPitchDeg,
  canAddPoint,
  defaultSpan,
  fovFromSize,
  inView,
  layoutRows,
  MAX_BYTES,
  MAX_POINTS,
  maxPitch,
  neighborsOf,
  nextTarget,
  normDeg,
  photoDateLabel,
  planShots,
  plantsSeenFrom,
  readyToShoot,
  refusalMessage,
  screenX,
  screenY,
  sizeLabel,
  smoothAngle,
  sortedShots,
  targetHeadings,
  turnHint,
  viewFov,
} from './geometry'

describe('caps', () => {
  it('normDeg ramène dans [0, 360[', () => {
    expect(normDeg(-90)).toBe(270)
    expect(normDeg(725)).toBe(5)
    expect(normDeg(360)).toBe(0)
  })

  it('angleDelta prend le chemin le plus court, positif vers la droite', () => {
    expect(angleDelta(350, 10)).toBe(20)
    expect(angleDelta(10, 350)).toBe(-20)
    expect(angleDelta(0, 180)).toBe(180)
    expect(angleDelta(90, 90)).toBe(0)
  })

  it('smoothAngle passe par la couture du nord sans faire le tour', () => {
    expect(smoothAngle(undefined, 40, 0.5)).toBe(40)
    expect(smoothAngle(350, 10, 0.5)).toBeCloseTo(0, 6)
    expect(smoothAngle(10, 350, 0.5)).toBeCloseTo(0, 6)
  })

  it('bearingDeg : 0 = nord, 90 = est, repère x est / y nord', () => {
    expect(bearingDeg({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(0)
    expect(bearingDeg({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(90)
    expect(bearingDeg({ x: 0, y: 0 }, { x: 0, y: -5 })).toBeCloseTo(180)
    expect(bearingDeg({ x: 0, y: 0 }, { x: -5, y: 0 })).toBeCloseTo(270)
    expect(bearingDeg({ x: 1, y: 1 }, { x: 2, y: 2 })).toBeCloseTo(45)
  })
})

describe('boussole du téléphone', () => {
  it('téléphone droit (beta 90) : le cap est 360 - alpha', () => {
    expect(cameraHeadingDeg(0, 90, 0)).toBeCloseTo(0)
    expect(cameraHeadingDeg(270, 90, 0)).toBeCloseTo(90)
    expect(cameraHeadingDeg(180, 90, 0)).toBeCloseTo(180)
    expect(cameraHeadingDeg(90, 90, 0)).toBeCloseTo(270)
  })

  it('téléphone à plat, écran vers le ciel : pas de direction exploitable pour la caméra', () => {
    expect(cameraHeadingDeg(0, 0, 0)).toBeUndefined()
    expect(cameraHeadingDeg(NaN, 90, 0)).toBeUndefined()
  })

  it('inclinaison : 0 à l’horizon, positive vers le ciel', () => {
    expect(cameraPitchDeg(90, 0)).toBeCloseTo(0)
    expect(cameraPitchDeg(120, 0)).toBeCloseTo(30)
    expect(cameraPitchDeg(60, 0)).toBeCloseTo(-30)
    expect(cameraPitchDeg(NaN, 0)).toBeUndefined()
  })
})

describe('répartition des photos', () => {
  it('toujours 8 à 12 photos, pas de 30 à 45°', () => {
    for (const fov of [20, 40, 50, 60, 70, 90, NaN, 0]) {
      const p = planShots(fov)
      expect(p.count).toBeGreaterThanOrEqual(8)
      expect(p.count).toBeLessThanOrEqual(12)
      expect(p.stepDeg).toBeGreaterThanOrEqual(30)
      expect(p.stepDeg).toBeLessThanOrEqual(45)
      expect(p.count * p.stepDeg).toBeCloseTo(360)
    }
  })

  it('un champ large demande moins de photos, un champ étroit davantage', () => {
    expect(planShots(70).count).toBe(8)
    expect(planShots(60).count).toBe(8)
    expect(planShots(45).count).toBe(11)
    expect(planShots(38).count).toBe(12)
  })

  it('les photos se recouvrent : le pas reste sous la largeur du champ', () => {
    for (const fov of [40, 50, 60, 70]) expect(planShots(fov).stepDeg).toBeLessThan(fov)
  })

  it('targetHeadings fait le tour complet vers la droite, sans doublon', () => {
    const t = targetHeadings(350, 8)
    expect(t).toHaveLength(8)
    expect(t[0]).toBe(350)
    expect(t[1]).toBe(35)
    expect(new Set(t).size).toBe(8)
    expect(nextTarget(350, 8, 3)).toBe(t[3])
    expect(nextTarget(350, 8, 8)).toBeUndefined()
  })

  it('fovFromSize : portrait plus étroit que paysage, valeurs plausibles', () => {
    const land = fovFromSize(1280, 960)
    const port = fovFromSize(720, 1280)
    expect(land).toBeGreaterThan(55)
    expect(land).toBeLessThan(70)
    expect(port).toBeLessThan(land)
    expect(port).toBeGreaterThan(30)
    expect(fovFromSize(0, 0)).toBe(60)
  })

  it('readyToShoot demande un cap proche ET un téléphone presque immobile', () => {
    expect(readyToShoot(100, 102, 5)).toBe(true)
    expect(readyToShoot(100, 110, 5)).toBe(false)
    expect(readyToShoot(100, 102, 40)).toBe(false)
    expect(readyToShoot(359, 2, 3)).toBe(true)
  })

  it('turnHint donne le sens et l’angle', () => {
    expect(turnHint(0, 30)).toEqual({ dir: 'droite', deg: 30 })
    expect(turnHint(30, 0)).toEqual({ dir: 'gauche', deg: 30 })
    expect(turnHint(350, 10)).toEqual({ dir: 'droite', deg: 20 })
    expect(turnHint(10, 12).dir).toBe('ici')
  })

  it('sortedShots trie par cap', () => {
    const s = sortedShots([
      { photoId: 'photo:b', headingDeg: 200, fovDeg: 60 },
      { photoId: 'photo:a', headingDeg: 20, fovDeg: 60 },
    ])
    expect(s.map((x) => x.photoId)).toEqual(['photo:a', 'photo:b'])
  })
})

describe('projection sur le cylindre', () => {
  it('le cap regardé est au centre, les autres à droite ou à gauche', () => {
    expect(screenX(90, 90, 60, 360)).toBe(180)
    expect(screenX(120, 90, 60, 360)).toBe(360)
    expect(screenX(60, 90, 60, 360)).toBe(0)
    expect(screenX(10, 350, 60, 360)).toBe(180 + (20 / 60) * 360)
  })

  it('un objet derrière soi est hors du champ', () => {
    expect(inView(270, 90, 60, 360)).toBe(false)
    expect(inView(100, 90, 60, 360)).toBe(true)
    expect(inView(125, 90, 60, 360, 60)).toBe(true)
  })

  it('hauteur : l’horizon est au milieu, le ciel au-dessus', () => {
    expect(screenY(0, 0, 60, 360, 600)).toBe(300)
    expect(screenY(10, 0, 60, 360, 600)).toBeLessThan(300)
    expect(screenY(0, 10, 60, 360, 600)).toBeGreaterThan(300)
  })

  it('champ affiché borné, zoom limité à 2,5', () => {
    expect(viewFov(390, 1)).toBe(60)
    expect(viewFov(800, 1)).toBeCloseTo(800 / 11)
    expect(viewFov(1280, 1)).toBe(100)
    expect(viewFov(3000, 1)).toBe(100)
    expect(viewFov(390, 10)).toBe(60 / 2.5)
    expect(viewFov(390, 0.1)).toBe(60)
  })

  it('maxPitch ne devient jamais négatif', () => {
    expect(maxPitch(60, 40)).toBe(10)
    expect(maxPitch(30, 60)).toBe(0)
  })
})

describe('plantes vues depuis un point', () => {
  const plants = [
    { id: 'n', name: 'Nord', pos: { x: 0, y: 10 }, heightM: 3 },
    { id: 'e', name: 'Est', pos: { x: 4, y: 0 }, heightM: 0.5 },
    { id: 'loin', name: 'Loin', pos: { x: 0, y: 200 }, heightM: 10 },
    { id: 'pieds', name: 'Pieds', pos: { x: 0.1, y: 0.1 }, heightM: 1 },
  ]

  it('garde les plantes proches, de la plus proche à la plus lointaine, avec leur cap', () => {
    const seen = plantsSeenFrom({ x: 0, y: 0 }, plants)
    expect(seen.map((s) => s.id)).toEqual(['e', 'n'])
    expect(seen[0].bearing).toBeCloseTo(90)
    expect(seen[1].bearing).toBeCloseTo(0)
    expect(seen[1].distM).toBeCloseTo(10)
  })

  it('un grand arbre dépasse l’horizon, une petite plante est sous les yeux', () => {
    const seen = plantsSeenFrom({ x: 0, y: 0 }, plants)
    expect(seen.find((s) => s.id === 'n')!.elevDeg).toBeGreaterThan(0)
    expect(seen.find((s) => s.id === 'e')!.elevDeg).toBeLessThan(0)
    expect(seen.find((s) => s.id === 'e')!.elevDeg).toBeGreaterThanOrEqual(-5)
  })

  it('plafonne le nombre de noms', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'p' + i, pos: { x: i * 0.5 + 1, y: 0 }, heightM: 1 }))
    expect(plantsSeenFrom({ x: 0, y: 0 }, many, 40, 14)).toHaveLength(14)
  })

  it('les noms ne se chevauchent pas : rangées successives, masqué sinon', () => {
    const rows = layoutRows(
      [
        { x: 100, w: 80 },
        { x: 120, w: 80 },
        { x: 130, w: 80 },
        { x: 300, w: 80 },
      ],
      2,
    )
    expect(rows).toEqual([0, 1, -1, 0])
  })

  it('points voisins : cap et distance depuis le point courant', () => {
    const mk = (id: string, x: number, y: number): Panorama => ({ id, x, y, takenAt: '2026-05-03', shots: [{ photoId: 'photo:a' + id, headingDeg: 0, fovDeg: 60 }], kind: 'guide' })
    const a = mk('a', 0, 0)
    const n = neighborsOf(a, [a, mk('b', 0, 10), mk('c', -3, 0)])
    expect(n.map((x) => x.id)).toEqual(['c', 'b'])
    expect(n[0].bearing).toBeCloseTo(270)
    expect(n[1].distM).toBeCloseTo(10)
  })
})

describe('limites et libellés', () => {
  it('6 points par jardin, message clair au-delà', () => {
    expect(MAX_POINTS).toBe(6)
    expect(canAddPoint(5, 0)).toEqual({ ok: true })
    const r = canAddPoint(6, 0)
    expect(r).toEqual({ ok: false, reason: 'points' })
    expect(refusalMessage('points')).toMatch(/6 points/)
  })

  it('refuse un nouveau point quand il reste moins de 4 Mo sur les 25 Mo', () => {
    expect(MAX_BYTES).toBe(25 * 1024 * 1024)
    expect(canAddPoint(2, 20 * 1024 * 1024)).toEqual({ ok: true })
    expect(canAddPoint(2, 22 * 1024 * 1024)).toEqual({ ok: false, reason: 'place' })
    expect(refusalMessage('place')).toMatch(/place/)
  })

  it('les messages tiennent en 20 mots', () => {
    for (const r of ['points', 'place'] as const) expect(refusalMessage(r).split(/\s+/).length).toBeLessThanOrEqual(20)
  })

  it('largeur couverte par défaut d’une photo importée', () => {
    expect(defaultSpan(8192, 4096)).toBe(360)
    expect(defaultSpan(8000, 1500)).toBe(360)
    expect(defaultSpan(6000, 1500)).toBe(180)
    expect(defaultSpan(4000, 1500)).toBe(120)
    expect(defaultSpan(2400, 1500)).toBe(120)
    expect(defaultSpan(0, 0)).toBe(180)
  })

  it('photoDateLabel : « Photo du 3 mai », avec l’année si ce n’est pas la même', () => {
    const now = new Date(2026, 9, 27)
    expect(photoDateLabel(new Date(2026, 4, 3).toISOString(), now)).toBe('Photo du 3 mai')
    expect(photoDateLabel(new Date(2026, 4, 1).toISOString(), now)).toBe('Photo du 1er mai')
    expect(photoDateLabel(new Date(2025, 11, 25).toISOString(), now)).toBe('Photo du 25 décembre 2025')
    expect(photoDateLabel('pas une date', now)).toBe('Photo')
  })

  it('sizeLabel', () => {
    expect(sizeLabel(300 * 1024)).toBe('300\u00a0Ko')
    expect(sizeLabel(2.4 * 1024 * 1024)).toBe('2,4\u00a0Mo')
    expect(sizeLabel(25 * 1024 * 1024)).toBe('25\u00a0Mo')
  })
})
