import { describe, expect, it } from 'vitest'
import { centerRect, CENTER_FRACTION } from './crop'
import { CLOSE_UPS, isLeafOffSeason } from './winter'

describe('centerRect', () => {
  it('garde le centre : 70 % de chaque côté', () => {
    expect(centerRect(1000, 800)).toEqual({ sx: 150, sy: 120, sw: 700, sh: 560 })
    expect(CENTER_FRACTION).toBe(0.7)
  })
  it('reste dans l’image, même pour une très petite ou une fraction absurde', () => {
    for (const [w, h, f] of [[10, 10, 0.7], [1, 1, 0.7], [640, 480, 5], [640, 480, -1]] as const) {
      const r = centerRect(w, h, f)
      expect(r.sx).toBeGreaterThanOrEqual(0)
      expect(r.sy).toBeGreaterThanOrEqual(0)
      expect(r.sx + r.sw).toBeLessThanOrEqual(w)
      expect(r.sy + r.sh).toBeLessThanOrEqual(h)
      expect(r.sw).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('saison sans feuilles', () => {
  it('de novembre à mars seulement', () => {
    const m = (n: number) => isLeafOffSeason(new Date(2026, n - 1, 15))
    expect([1, 2, 3, 11, 12].map(m)).toEqual([true, true, true, true, true])
    expect([4, 5, 6, 7, 8, 9, 10].map(m)).toEqual([false, false, false, false, false, false, false])
  })
  it('deux gros plans : l’écorce d’abord, avec des organes que Pl@ntNet accepte', () => {
    expect(CLOSE_UPS.map((c) => c.organ)).toEqual(['bark', 'auto'])
  })
})
