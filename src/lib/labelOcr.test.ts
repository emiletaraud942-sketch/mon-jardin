import { describe, expect, it } from 'vitest'
import { estimateSkewDeg, OcrUnavailableError, stretchGray } from './labelOcr'

describe('stretchGray : contraste de la photo avant lecture', () => {
  it('étire une photo terne (gris 100 à 140) sur toute l’échelle', () => {
    const gray = new Uint8ClampedArray(1000)
    for (let i = 0; i < gray.length; i++) gray[i] = i % 2 ? 100 : 140
    const out = stretchGray(gray)
    expect(Math.min(...out)).toBe(0)
    expect(Math.max(...out)).toBe(255)
  })
  it('garde l’ordre des gris (clair reste plus clair)', () => {
    const gray = new Uint8ClampedArray(1000).map((_, i) => 50 + (i % 100))
    const out = stretchGray(gray)
    for (let i = 1; i < gray.length; i++) if (gray[i] > gray[i - 1]) expect(out[i]).toBeGreaterThanOrEqual(out[i - 1])
  })
  it('image quasi uniforme : inchangée, sans division par zéro', () => {
    const gray = new Uint8ClampedArray(500).fill(128)
    expect([...stretchGray(gray)]).toEqual([...gray])
    expect(stretchGray(new Uint8ClampedArray(0))).toHaveLength(0)
  })
})

describe('OcrUnavailableError', () => {
  it('dit en français que la première lecture demande internet', () => {
    const e = new OcrUnavailableError()
    expect(e.name).toBe('OcrUnavailableError')
    expect(e.message).toMatch(/connexion internet la première fois/)
    for (const s of e.message.split(/(?<=[.!?])\s+/)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(20)
  })
})

describe('estimateSkewDeg', () => {
  const lines = (deg: number) => {
    const w = 600
    const h = 500
    const g = new Uint8ClampedArray(w * h).fill(240)
    const t = Math.tan((deg * Math.PI) / 180)
    for (let k = 0; k < 8; k++) for (let x = 40; x < w - 40; x++) {
      const y = Math.round(70 + k * 50 + (x - w / 2) * t)
      for (let dy = 0; dy < 6; dy++) if (y + dy >= 0 && y + dy < h) g[(y + dy) * w + x] = 20
    }
    return { g, w, h }
  }
  it('trouve l’inclinaison des lignes et rend 0 sur un texte droit', () => {
    for (const deg of [-5, 4, 7]) {
      const { g, w, h } = lines(deg)
      expect(Math.abs(estimateSkewDeg(g, w, h) - deg)).toBeLessThanOrEqual(1)
    }
    const { g, w, h } = lines(0)
    expect(estimateSkewDeg(g, w, h)).toBe(0)
  })
  it('ne bouge pas sur une image sans texte', () => {
    expect(estimateSkewDeg(new Uint8ClampedArray(600 * 500).fill(200), 600, 500)).toBe(0)
  })
})
