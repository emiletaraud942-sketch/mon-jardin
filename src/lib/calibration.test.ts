import { describe, expect, it } from 'vitest'
import { applyCalibration, averageFixes, fitCalibration, gpsQuality, headingToOffset, type CalibrationPoint } from './calibration'
import { migrateState } from './migrate'

const base = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 15 },
  { x: -10, y: 12 },
  { x: 5, y: -18 },
]
const make = (f: (p: { x: number; y: number }) => { x: number; y: number }): CalibrationPoint[] => base.map((m) => ({ measured: m, truth: f(m) }))

// Générateur pseudo-aléatoire déterministe + Box-Muller.
function rng(seed: number) {
  let s = seed
  const u = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return (s + 1) / 4294967297
  }
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u())
}

describe('fitCalibration', () => {
  it('identité', () => {
    const c = fitCalibration(make((p) => p))!
    expect(c.a).toBeCloseTo(1, 9)
    expect(c.b).toBeCloseTo(0, 9)
    expect(c.tx).toBeCloseTo(0, 9)
    expect(c.rmsM).toBeCloseTo(0, 9)
    expect(c.n).toBe(5)
  })
  it('translation pure', () => {
    const c = fitCalibration(make((p) => ({ x: p.x + 3, y: p.y - 2 })))!
    expect(c.tx).toBeCloseTo(3, 9)
    expect(c.ty).toBeCloseTo(-2, 9)
    expect(applyCalibration(c, { x: 1, y: 1 })).toEqual({ x: expect.closeTo(4, 9), y: expect.closeTo(-1, 9) })
  })
  it('rotation 30°', () => {
    const t = (30 * Math.PI) / 180
    const c = fitCalibration(make((p) => ({ x: Math.cos(t) * p.x - Math.sin(t) * p.y, y: Math.sin(t) * p.x + Math.cos(t) * p.y })))!
    expect(c.a).toBeCloseTo(Math.cos(t), 9)
    expect(c.b).toBeCloseTo(Math.sin(t), 9)
    expect(c.rmsM).toBeLessThan(1e-9)
  })
  it('échelle 1,1', () => {
    const c = fitCalibration(make((p) => ({ x: p.x * 1.1 + 1, y: p.y * 1.1 })))!
    expect(c.a).toBeCloseTo(1.1, 9)
    expect(c.b).toBeCloseTo(0, 9)
  })
  it('1 point = translation seule', () => {
    const c = fitCalibration([{ measured: { x: 1, y: 2 }, truth: { x: 4, y: 6 } }])!
    expect(c).toMatchObject({ a: 1, b: 0, tx: 3, ty: 4, n: 1 })
  })
  it('2 points = similitude exacte', () => {
    const c = fitCalibration([
      { measured: { x: 0, y: 0 }, truth: { x: 5, y: 5 } },
      { measured: { x: 10, y: 0 }, truth: { x: 5, y: 15 } },
    ])!
    expect(c.a).toBeCloseTo(0, 9)
    expect(c.b).toBeCloseTo(1, 9)
    expect(c.rmsM).toBeLessThan(1e-9)
  })
  it('aucun point = null', () => expect(fitCalibration([])).toBeNull())
  it('bruit gaussien : RMS inférieur au bruit', () => {
    const g = rng(42)
    const sigma = 2
    const pts: CalibrationPoint[] = []
    for (let i = 0; i < 12; i++) {
      const m = { x: (g() * 30) | 0, y: (g() * 30) | 0 }
      pts.push({ measured: m, truth: { x: m.x + 4 + sigma * g(), y: m.y - 3 + sigma * g() } })
    }
    const c = fitCalibration(pts)!
    expect(c.rmsM).toBeLessThan(sigma * 1.5)
    // L'ajustement aux moindres carrés n'est pas pire que la translation seule.
    const rawRms = Math.sqrt(pts.reduce((s, p) => s + (p.measured.x + 4 - p.truth.x) ** 2 + (p.measured.y - 3 - p.truth.y) ** 2, 0) / pts.length)
    expect(c.rmsM).toBeLessThanOrEqual(rawRms + 1e-9)
  })
  it('points dégénérés refusés', () => {
    const pts: CalibrationPoint[] = [
      { measured: { x: 0, y: 0 }, truth: { x: 1, y: 1 } },
      { measured: { x: 0.5, y: 0.5 }, truth: { x: 9, y: 9 } },
      { measured: { x: 1, y: 0 }, truth: { x: 3, y: 3 } },
    ]
    expect(fitCalibration(pts)).toBeNull()
  })
  it('échelle hors bornes refusée', () => {
    expect(fitCalibration(make((p) => ({ x: p.x * 2, y: p.y * 2 })))).toBeNull()
    expect(fitCalibration(make((p) => ({ x: p.x * 0.5, y: p.y * 0.5 })))).toBeNull()
  })
})

describe('applyCalibration', () => {
  it('identité si absent', () => {
    expect(applyCalibration(null, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
    expect(applyCalibration(undefined, { x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })
})

describe('averageFixes', () => {
  it('pondère par 1/accuracy²', () => {
    const r = averageFixes([
      { x: 0, y: 0, accuracy: 2 },
      { x: 10, y: 0, accuracy: 20 },
    ])
    expect(r.x).toBeLessThan(0.2)
  })
  it('rejette les valeurs aberrantes', () => {
    const fixes = Array.from({ length: 10 }, (_, i) => ({ x: 0.1 * (i % 3), y: 0.1 * (i % 2), accuracy: 3 }))
    fixes.push({ x: 60, y: 60, accuracy: 3 })
    const r = averageFixes(fixes)
    expect(Math.hypot(r.x, r.y)).toBeLessThan(0.5)
    expect(r.spreadM).toBeLessThan(0.5)
  })
  it('dispersion et cas vide', () => {
    expect(averageFixes([{ x: 1, y: 1 }]).spreadM).toBe(0)
    expect(averageFixes([]).spreadM).toBe(Infinity)
  })
})

describe('gpsQuality', () => {
  it('seuils', () => {
    expect(gpsQuality(5)).toBe('bonne')
    expect(gpsQuality(12)).toBe('moyenne')
    expect(gpsQuality(12.1)).toBe('faible')
  })
})

describe('headingToOffset', () => {
  it('points cardinaux', () => {
    const near = (h: number, x: number, y: number) => {
      const o = headingToOffset(h, 5)
      expect(o.x).toBeCloseTo(x, 9)
      expect(o.y).toBeCloseTo(y, 9)
    }
    near(0, 0, 5)
    near(90, 5, 0)
    near(180, 0, -5)
    near(270, -5, 0)
  })
})

describe('calibration dans migrateState', () => {
  const garden = { id: 'g1', name: 'J', address: '', center: { lon: 4.8, lat: 45.7 }, createdAt: '2025-01-01T00:00:00.000Z' }
  const run = (calibration: unknown) => {
    const r = migrateState({ version: 2, gardens: [{ ...garden, calibration }], plants: [], tasksDone: [] })
    if (!r.ok) throw new Error(r.error)
    return r
  }
  it('garde une calibration valide, et les anciens jardins sans champ', () => {
    const cal = { a: 1, b: 0.1, tx: 2, ty: -1, rmsM: 0.5, n: 3 }
    expect(run(cal).data.gardens[0].calibration).toEqual(cal)
    const old = migrateState({ version: 2, gardens: [garden], plants: [], tasksDone: [] })
    expect(old.ok && old.data.gardens[0].calibration).toBeUndefined()
    expect(old.ok && old.warnings).toEqual([])
  })
  it('écarte une calibration invalide avec avertissement', () => {
    for (const bad of [{ a: 3, b: 0, tx: 0, ty: 0, rmsM: 0, n: 2 }, { a: 1, b: 0, tx: NaN, ty: 0, rmsM: 0, n: 2 }, { a: '1' }, 'x']) {
      const r = run(bad)
      expect(r.data.gardens[0].calibration).toBeUndefined()
      expect(r.warnings.some((w) => w.includes('recalage'))).toBe(true)
    }
  })
})
