import { describe, expect, it } from 'vitest'
import { fixesToLocal, gpsMessage, gpsSupport, problemFromCode, summarizeFixes } from './gps'

const C = { lon: 2.35, lat: 48.85 }

describe('problèmes de position', () => {
  it('traduit les codes du navigateur', () => {
    expect(problemFromCode(1)).toBe('refuse')
    expect(problemFromCode(2)).toBe('indisponible')
    expect(problemFromCode(3)).toBe('delai')
    expect(problemFromCode(undefined)).toBe('indisponible')
  })
  it('refuse une page non sécurisée ou sans GPS', () => {
    expect(gpsSupport({ secure: false, hasGeolocation: true })).toBe('non-securise')
    expect(gpsSupport({ secure: true, hasGeolocation: false })).toBe('absent')
    expect(gpsSupport({ secure: true, hasGeolocation: true })).toBeUndefined()
  })
  it('écrit des messages courts, avec un détail à part', () => {
    for (const p of ['refuse', 'indisponible', 'delai', 'non-securise', 'absent'] as const) {
      const m = gpsMessage(p)
      for (const phrase of `${m.message} ${m.help ?? ''}`.split(/[.!?]\s*/).filter(Boolean)) expect(phrase.split(/\s+/).length).toBeLessThanOrEqual(20)
      expect(m.detail.length).toBeGreaterThan(10)
    }
  })
})

describe('relevé GPS', () => {
  it('passe en repère local (est, nord)', () => {
    const [p] = fixesToLocal(C, [{ lat: C.lat + 0.0001, lon: C.lon, accuracy: 4 }])
    expect(p.x).toBeCloseTo(0, 3)
    expect(p.y).toBeGreaterThan(10)
  })
  it('écarte les mesures trop vagues', () => {
    expect(fixesToLocal(C, [{ lat: C.lat, lon: C.lon, accuracy: 500 }])).toHaveLength(0)
    expect(summarizeFixes(C, [{ lat: C.lat, lon: C.lon, accuracy: 500 }])).toBeUndefined()
  })
  it('résume plusieurs relevés avec leur qualité', () => {
    const s = summarizeFixes(C, [
      { lat: C.lat, lon: C.lon, accuracy: 3 },
      { lat: C.lat, lon: C.lon, accuracy: 5 },
    ])
    expect(s?.n).toBe(2)
    expect(s?.accuracyM).toBe(4)
    expect(s?.quality).toBe('bonne')
  })
})
