import { describe, expect, it } from 'vitest'
import type { Panorama } from '../../types'
import { LEAVE_MS, MIN_SWEEP_DEG, SETTLE_MS, STILL_DWELL_MS, TURN_DEG_PER_S, arrivalYaw, jumpTo, northKnown, pointDurationMs, startTour, stepLabel, sweepDeg, tickTour, tourOrder } from './tour'

const shot = (h: number) => ({ photoId: `photo:${h}`, headingDeg: h, fovDeg: 60 })
const pt = (id: string, x: number, y: number, extra: Partial<Panorama> = {}): Panorama => ({ id, x, y, takenAt: '2026-11-01T10:00:00Z', shots: [shot(30), shot(90)], kind: 'guide', ...extra })

describe('ordre de la visite', () => {
  it('part du premier point, puis va toujours au plus proche non visité', () => {
    const pts = [pt('a', 0, 0), pt('b', 30, 0), pt('c', 10, 0), pt('d', 12, 5)]
    expect(tourOrder(pts)).toEqual(['a', 'c', 'd', 'b'])
  })
  it('un point sans photo n’est pas visité ; un seul point ne fait pas une visite', () => {
    expect(tourOrder([pt('a', 0, 0), pt('b', 5, 0, { shots: [] }), pt('c', 9, 0)])).toEqual(['a', 'c'])
    expect(tourOrder([pt('a', 0, 0, { shots: [] })])).toEqual([])
    expect(tourOrder([])).toEqual([])
    expect(tourOrder([pt('a', 0, 0)])).toEqual(['a'])
  })
  it('l’ordre ne dépend que de la place des points (rien n’est stocké) et il est stable', () => {
    const pts = [pt('a', 0, 0), pt('b', 10, 0), pt('c', 20, 0)]
    expect(tourOrder(pts)).toEqual(tourOrder([...pts]))
    // Deux points à égale distance : le premier de la liste d'abord.
    expect(tourOrder([pt('a', 0, 0), pt('b', 5, 0), pt('c', -5, 0)])).toEqual(['a', 'b', 'c'])
  })
})

describe('caps : arrivée et balayage', () => {
  it('on arrive en regardant dans le sens du déplacement (nord = 0, est = 90)', () => {
    expect(arrivalYaw(pt('a', 0, 0), pt('b', 10, 0))).toBeCloseTo(90, 5)
    expect(arrivalYaw(pt('a', 0, 0), pt('b', 0, -10))).toBeCloseTo(180, 5)
  })
  it('premier point, ou nord inconnu d’un des deux : la première photo du point', () => {
    expect(arrivalYaw(undefined, pt('a', 0, 0))).toBe(30)
    expect(arrivalYaw(pt('a', 0, 0), pt('b', 10, 0, { northOk: false }))).toBe(30)
    expect(arrivalYaw(pt('a', 0, 0, { northOk: false }), pt('b', 10, 0))).toBe(30)
    expect(arrivalYaw(undefined, pt('a', 0, 0, { shots: [] }))).toBe(0)
  })
  it('le balayage minimal est de 120°', () => {
    expect(MIN_SWEEP_DEG).toBe(120)
  })
  it('exemples chiffrés', () => {
    const cur = pt('a', 0, 0)
    expect(sweepDeg(0, cur, pt('b', 10, 0))).toBeCloseTo(450, 5) // 90° seulement : on ajoute un tour
    expect(sweepDeg(0, cur, pt('b', 0, -10))).toBeCloseTo(180, 5)
    expect(sweepDeg(350, cur, pt('b', 0, 10))).toBeCloseTo(370, 5) // 10° seulement : un tour de plus
    expect(sweepDeg(200, cur, pt('b', 10, 0))).toBeCloseTo(250, 5)
  })
  it('dernier point, ou nord inconnu sur le point : un tour complet', () => {
    expect(sweepDeg(40, pt('a', 0, 0), undefined)).toBe(360)
    expect(sweepDeg(40, pt('a', 0, 0, { northOk: false }), pt('b', 10, 0))).toBe(360)
    expect(northKnown(pt('a', 0, 0))).toBe(true)
    expect(northKnown(pt('a', 0, 0, { northOk: false }))).toBe(false)
  })
})

describe('déroulé de la visite', () => {
  const sweeps = [180, 360, 360]
  const next = (i: number) => sweeps[i]
  const run = (s: ReturnType<typeof startTour>, totalMs: number, still = false, step = 100) => {
    let state = s
    let yaw = 0
    const moves: number[] = []
    let t = 0
    for (; t < totalMs; t += step) {
      const r = tickTour(state, step, still, next)
      state = r.state
      yaw += r.yawDelta
      if (r.moved) moves.push(state.i)
      if (r.finished) break
    }
    return { state, yaw, moves, t }
  }
  it('arrivée, rotation à vitesse constante, pause, puis point suivant', () => {
    const s0 = startTour(['a', 'b', 'c'], sweeps[0])
    const r = run(s0, SETTLE_MS + (180 / TURN_DEG_PER_S) * 1000 + LEAVE_MS + 200)
    expect(r.moves).toEqual([1])
    expect(r.yaw).toBeCloseTo(180, 3)
    expect(r.state.i).toBe(1)
    expect(r.state.phase).toBe('arrive')
    expect(r.state.sweep).toBe(360)
  })
  it('la rotation ne dépasse jamais le balayage prévu', () => {
    const r = run(startTour(['a', 'b'], 90), 60_000)
    expect(r.yaw).toBeCloseTo(90 + 360, 3) // 90 au premier point, puis 360 (balayage du second)
  })
  it('la visite se termine après le dernier point', () => {
    const r = run(startTour(['a', 'b', 'c'], sweeps[0]), 10 * 60_000)
    expect(r.state.phase).toBe('done')
    expect(r.moves).toEqual([1, 2])
  })
  it('un grand saut de temps (onglet en arrière-plan) ne fait pas sauter de points', () => {
    const r = tickTour(startTour(['a', 'b', 'c'], 360), 60_000, false, next)
    expect(r.state.i).toBe(0)
    expect(r.yawDelta).toBeLessThanOrEqual((500 / 1000) * TURN_DEG_PER_S + 1e-9)
  })
  it('« Mouvement réduit » : aucune rotation, chaque point reste STILL_DWELL_MS puis la visite avance', () => {
    const r = run(startTour(['a', 'b'], 360), 3 * STILL_DWELL_MS + LEAVE_MS * 3, true)
    expect(r.yaw).toBe(0)
    expect(r.moves).toEqual([1])
    expect(r.state.phase).toBe('done')
  })
  it('précédent / suivant : on repart de l’arrivée du point choisi, dans les bornes', () => {
    const s = startTour(['a', 'b', 'c'], 360)
    expect(jumpTo(s, 2, 90)).toMatchObject({ i: 2, phase: 'arrive', turned: 0, sweep: 90, waited: 0 })
    expect(jumpTo(s, 9, 90).i).toBe(2)
    expect(jumpTo(s, -3, 90).i).toBe(0)
  })
  it('durée annoncée et libellé de l’étape', () => {
    expect(pointDurationMs(320, false)).toBeCloseTo(SETTLE_MS + 20_000 + LEAVE_MS, 3)
    expect(pointDurationMs(320, true)).toBe(STILL_DWELL_MS)
    expect(stepLabel(1, 4)).toBe('Visite : étape 2 sur 4')
  })
})

// Câblage dans l'écran (rendu serveur impossible : canvas) : on vérifie le code source des commandes demandées par le propriétaire.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
describe('visionneuse : commandes de la visite et légendes', () => {
  const viewer = readFileSync(join(__dirname, 'Viewer.tsx'), 'utf8')
  const home = readFileSync(join(__dirname, 'Home.tsx'), 'utf8')
  const css = readFileSync(join(__dirname, '../../styles/panorama.css'), 'utf8')
  it('barre de visite : étape annoncée à voix haute, Précédent, Pause / Reprendre, Suivant, Arrêter', () => {
    expect(viewer).toMatch(/role="status" aria-live="polite">\s*<strong>\{stepLabel\(tourUi\.i, order\.length\)\}/)
    for (const mot of ['Précédent', 'Reprendre', 'Pause', 'Suivant', 'Arrêter']) expect(viewer).toContain(mot)
  })
  it('toucher la vue met la visite en pause ; choisir un point soi-même l’arrête ; la rangée de points se cache pendant la visite', () => {
    expect(viewer).toMatch(/if \(tourRef\.current && !tourPaused\.current\) pauseTour\(\)/)
    expect(viewer).toMatch(/const go = \(id: string\) => \{\s*if \(id === currentId\) return\s*stopTour\(\)/)
    expect(viewer).toMatch(/neighbors\.length > 0 && !tourUi\.active/)
  })
  it('« Mouvement réduit » du téléphone : aucune rotation (matchMedia prefers-reduced-motion)', () => {
    expect(viewer).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')")
  })
  it('un point dont les photos manquent est sauté pendant la visite', () => {
    expect(viewer).toMatch(/function skipBroken\(\)/)
    expect((viewer.match(/skipBroken\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })
  it('légendes : le bouton s’appelle « Légendes », reste visible (grisé, avec la raison) quand le nord est inconnu, et dit nom + distance', () => {
    expect(viewer).toContain('<Icon name="leaf" size={18} /> Légendes')
    expect(viewer).toMatch(/disabled=\{!northOk\}/)
    expect(viewer).toContain('Le nord n’est pas connu pour ce point')
    expect(viewer).toMatch(/\{it\.name\} · \{frMeters\(it\.distM\)\}/)
  })
  it('départ depuis la liste (« Lancer la visite », au moins 2 points avec photos) et fondu entre deux points', () => {
    expect(home).toMatch(/tourOrder\(points\)\.length >= 2 && \(\s*<button className="btn primary big" data-feat="pano-visite"/)
    expect(home).toContain("tour: true")
    expect(css).toMatch(/\.pano-stage\[data-loading='true'\] \.pano-canvas \{\s*opacity: 0\.12;/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.pano-canvas \{\s*transition: none;/)
  })
})
