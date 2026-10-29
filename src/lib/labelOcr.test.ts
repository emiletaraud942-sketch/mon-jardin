import { describe, expect, it } from 'vitest'
import { OcrUnavailableError, stretchGray } from './labelOcr'

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
