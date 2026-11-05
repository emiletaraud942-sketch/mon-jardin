import { describe, expect, it } from 'vitest'
import type { Panorama } from '../../types'
import { metaBytes } from './panoData'

const p = (id: string, bytes?: number): Panorama => ({ id, x: 0, y: 0, takenAt: '2026-05-03T10:00:00.000Z', kind: 'guide', shots: [{ photoId: 'photo:' + id, headingDeg: 0, fovDeg: 60 }], ...(bytes === undefined ? {} : { bytes }) })

describe('metaBytes', () => {
  it('additionne le poids noté sans lire aucune photo', () => {
    expect(metaBytes([p('a', 3_000_000), p('b', 2_000_000)])).toEqual({ total: 5_000_000, missing: [] })
  })
  it('signale les points anciens sans poids', () => {
    const r = metaBytes([p('a', 1000), p('b')])
    expect(r.total).toBe(1000)
    expect(r.missing.map((x) => x.id)).toEqual(['b'])
  })
})
