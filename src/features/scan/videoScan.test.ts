import { describe, expect, it } from 'vitest'
import { dedupeQueue, speciesKey } from './dedupe'
import { judgeFrame, laplacianVariance, toGray, vegetationRatio } from './frameQuality'
import { newItem, type Queue, type ScanItem } from './queue'
import { addUsed, consume, dayKey, DAILY_LIMIT, normalizeQuota, quotaText, remaining } from './quota'
import { cameraHeading, frameTimes, interpolateHeading, interpolateTrack, positionForFrame } from './videoLog'

// ---------- images ----------
function rgba(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const a = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y)
      a.set([r, g, b, 255], (y * w + x) * 4)
    }
  return a
}
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const W = 64
const noisy = rgba(W, W, () => [30 + rnd() * 60, 100 + rnd() * 120, 30 + rnd() * 40])
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number) {
  return rgba(w, h, (x, y) => {
    let R = 0, G = 0, B = 0, n = 0
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.min(w - 1, Math.max(0, x + dx))
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        const p = (yy * w + xx) * 4
        R += src[p]; G += src[p + 1]; B += src[p + 2]; n++
      }
    return [R / n, G / n, B / n]
  })
}

describe('tri des images', () => {
  it('une image nette a une grande variance, la même floutée une petite', () => {
    const sharp = laplacianVariance(toGray(noisy, W, W), W, W)
    const blurred = laplacianVariance(toGray(boxBlur(noisy, W, W, 3), W, W), W, W)
    expect(sharp).toBeGreaterThan(blurred * 10)
    expect(judgeFrame(noisy, W, W).ok).toBe(true)
    const v = judgeFrame(boxBlur(noisy, W, W, 3), W, W)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('floue')
  })
  it('une image unie est floue', () => {
    expect(laplacianVariance(toGray(rgba(W, W, () => [10, 200, 10]), W, W), W, W)).toBe(0)
  })
  it('compte les pixels verts et bruns', () => {
    expect(vegetationRatio(rgba(8, 8, () => [40, 160, 50]))).toBe(1)
    expect(vegetationRatio(rgba(8, 8, () => [140, 100, 60]))).toBe(1)
    expect(vegetationRatio(rgba(8, 8, () => [120, 120, 125]))).toBe(0)
    expect(vegetationRatio(rgba(8, 8, (x) => (x < 4 ? [40, 160, 50] : [200, 200, 255])))).toBeCloseTo(0.5)
    expect(vegetationRatio(new Uint8ClampedArray(0))).toBe(0)
  })
  it('écarte une image nette sans végétation (ciel, mur)', () => {
    const wall = rgba(W, W, () => { const v = 100 + rnd() * 120; return [v, v, v + 10] })
    const v = judgeFrame(wall, W, W)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('sans-plante')
  })
})

// ---------- journal ----------
const track = [
  { t: 1000, x: 0, y: 0, accuracy: 4 },
  { t: 3000, x: 10, y: 0, accuracy: 6 },
  { t: 5000, x: 10, y: 10, accuracy: 4 },
]
describe('journal de marche', () => {
  it('interpole la position', () => {
    expect(interpolateTrack(track, 2000)).toEqual({ x: 5, y: 0, accuracy: 6 })
    expect(interpolateTrack(track, 4000)?.y).toBe(5)
    expect(interpolateTrack(track, 3000)?.x).toBe(10)
  })
  it('refuse de deviner loin du journal', () => {
    expect(interpolateTrack(track, 500)).toBeDefined()
    expect(interpolateTrack(track, 20000)).toBeUndefined()
    expect(interpolateTrack([], 1000)).toBeUndefined()
  })
  it('accepte un journal en désordre et ignore les valeurs fausses', () => {
    expect(interpolateTrack([track[2], { t: NaN, x: 0, y: 0, accuracy: 1 }, track[0], track[1]], 2000)?.x).toBe(5)
  })
  it('interpole le cap par le plus court chemin', () => {
    const heads = [{ t: 0, deg: 350 }, { t: 1000, deg: 10 }]
    expect(interpolateHeading(heads, 500)).toBeCloseTo(0, 5)
    expect(interpolateHeading([{ t: 0, deg: 90 }, { t: 1000, deg: 180 }], 500)).toBeCloseTo(135)
    expect(interpolateHeading([], 0)).toBeUndefined()
  })
  it('calcule le cap de la caméra d’un téléphone droit', () => {
    // Téléphone droit (beta 90), alpha 0 : la caméra regarde le nord.
    expect(cameraHeading(0, 90, 0)).toBeCloseTo(0, 3)
    // Tourné de 90° vers la gauche (alpha 90) : la caméra regarde l’ouest.
    expect(cameraHeading(90, 90, 0)).toBeCloseTo(270, 3)
    expect(cameraHeading(NaN, 90, 0)).toBeUndefined()
  })
  it('place l’image devant la personne, recalage compris', () => {
    const heads = [{ t: 0, deg: 90 }, { t: 6000, deg: 90 }]
    const p = positionForFrame(2000, track, heads, undefined, 3)
    expect(p?.position.x).toBeCloseTo(8)
    expect(p?.position.y).toBeCloseTo(0)
    expect(p?.aimed).toBe(true)
    const c = { a: 1, b: 0, tx: 1, ty: 0, rmsM: 0.5, n: 2 }
    expect(positionForFrame(2000, track, heads, c, 3)?.position.x).toBeCloseTo(9)
  })
  it('sans cap : la position de la personne, sans décalage', () => {
    const p = positionForFrame(2000, track, [], undefined, 3)
    expect(p).toMatchObject({ position: { x: 5, y: 0 }, aimed: false })
  })
  it('sans journal à cet instant : pas de position', () => {
    expect(positionForFrame(99999, track, [], undefined)).toBeUndefined()
  })
  it('choisit un instant toutes les 2 s, au plus 30', () => {
    expect(frameTimes(10)).toEqual([1, 3, 5, 7, 9])
    expect(frameTimes(300).length).toBe(30)
    expect(frameTimes(0)).toEqual([])
    expect(frameTimes(NaN)).toEqual([])
    expect(frameTimes(1.5)[0]).toBeCloseTo(0.75)
  })
})

// ---------- doublons ----------
const it_ = (id: string, speciesId: string, x: number, score: number, over: Partial<ScanItem> = {}): ScanItem => ({
  ...newItem({ id, gardenId: 'g', photoId: 'photo:' + id, position: { x, y: 0 }, accuracyM: 3, from: 'video' }),
  status: 'a-valider',
  speciesId,
  suggestions: [{ latin: 'x', name: 'x', score, approx: false }],
  ...over,
})
describe('regroupement des doublons', () => {
  it('garde la mieux notée parmi la même espèce à moins de 2 m', () => {
    const q: Queue = [it_('a', 'pommier', 0, 0.5), it_('b', 'pommier', 1, 0.9), it_('c', 'pommier', 1.5, 0.7)]
    const out = dedupeQueue(q)
    expect(out.find((i) => i.id === 'b')?.status).toBe('a-valider')
    expect(out.find((i) => i.id === 'a')).toMatchObject({ status: 'ignoree', mergedInto: 'b' })
    expect(out.find((i) => i.id === 'c')).toMatchObject({ status: 'ignoree', mergedInto: 'b' })
  })
  it('garde deux pieds éloignés ou deux espèces différentes', () => {
    const q: Queue = [it_('a', 'pommier', 0, 0.5), it_('b', 'pommier', 5, 0.9), it_('c', 'poirier', 0.5, 0.7)]
    expect(dedupeQueue(q)).toBe(q)
  })
  it('ne touche ni aux photos prises à la main ni aux éléments déjà validés', () => {
    const q: Queue = [it_('a', 'pommier', 0, 0.5, { from: 'photo' }), it_('b', 'pommier', 0.5, 0.9), it_('c', 'pommier', 0.6, 0.4, { status: 'validee' })]
    expect(dedupeQueue(q)).toBe(q)
  })
  it('ne regroupe pas des images sans position connue', () => {
    const q: Queue = [it_('a', 'pommier', 0, 0.5, { accuracyM: 99 }), it_('b', 'pommier', 0.5, 0.9, { accuracyM: 99 })]
    expect(dedupeQueue(q)).toBe(q)
  })
  it('compare les noms libres sans tenir compte de la casse', () => {
    expect(speciesKey(it_('a', 'inconnue', 0, 1, { customName: ' Rosier ' }))).toBe('nom:rosier')
    expect(speciesKey(it_('a', 'inconnue', 0, 1))).toBeUndefined()
    const q: Queue = [it_('a', 'inconnue', 0, 0.5, { customName: 'Rosier' }), it_('b', 'inconnue', 1, 0.6, { customName: 'rosier' })]
    expect(dedupeQueue(q).filter((i) => i.status === 'ignoree')).toHaveLength(1)
  })
})

// ---------- quota ----------
describe('quota journalier', () => {
  it('repart de zéro un nouveau jour ou une valeur abîmée', () => {
    expect(normalizeQuota({ day: '2026-05-01', used: 12 }, '2026-05-01')).toEqual({ day: '2026-05-01', used: 12 })
    expect(normalizeQuota({ day: '2026-04-30', used: 12 }, '2026-05-01').used).toBe(0)
    expect(normalizeQuota({ day: '2026-05-01', used: -3 }, '2026-05-01').used).toBe(0)
    expect(normalizeQuota('x', '2026-05-01').used).toBe(0)
  })
  it('compte ce qui reste, jamais en dessous de zéro', () => {
    let q = normalizeQuota(null, '2026-05-01')
    expect(remaining(q)).toBe(DAILY_LIMIT)
    q = consume(q, 25)
    expect(remaining(q)).toBe(5)
    q = consume(q, 99)
    expect(remaining(q)).toBe(0)
    expect(consume(q, -4).used).toBe(q.used)
  })
  it('écrit le compteur en clair', () => {
    expect(quotaText({ day: 'x', used: 12 })).toBe('12 images sur 30 aujourd’hui')
    expect(quotaText({ day: 'x', used: 1 })).toBe('1 image sur 30 aujourd’hui')
  })
  it('dayKey suit le jour local', () => {
    expect(dayKey(new Date(2026, 4, 3, 23, 59))).toBe('2026-05-03')
  })
  it('sans localStorage, ne plante pas', () => {
    expect(addUsed(3).used).toBeGreaterThanOrEqual(3)
  })
})
