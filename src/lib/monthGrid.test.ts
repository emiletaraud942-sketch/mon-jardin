import { describe, expect, it } from 'vitest'
import { findColumns, readMonthGrid, type OcrWord, type RgbaImage } from './monthGrid'

// Grille fabriquée à la main : colonnes de 52 px à partir de x = 330, rangées de 50 px.
const X0 = 330
const CW = 52
const w = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord => ({ text, x0, y0, x1, y1 })
function image(rows: { y: number; months: number[]; color?: [number, number, number]; mark?: boolean }[]): RgbaImage {
  const W = 1000
  const H = 700
  const data = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const r of rows)
    for (const m of r.months) {
      const cx = X0 + (m - 1) * CW
      for (let y = r.y; y < r.y + 50; y++)
        for (let x = cx + 2; x < cx + CW - 2; x++) {
          if (r.mark && !(Math.abs(x - (cx + CW / 2)) < 7 && Math.abs(y - (r.y + 25)) < 7)) continue
          const i = (y * W + x) * 4
          const c = r.color ?? [60, 130, 60]
          data[i] = c[0]
          data[i + 1] = c[1]
          data[i + 2] = c[2]
        }
    }
  return { width: W, height: H, data }
}
// Ce que Tesseract rend sur « J F M A M J J A S O N D » : des lettres collées, mais avec leurs boîtes.
const headerGlued = [w('J', 342, 277, 354, 309), w('FMAMJ', 399, 277, 614, 309), w('J', 654, 277, 666, 309), w('ASOND', 708, 277, 943, 302)]
const labels = (y: number, a: string, b: string) => [w(a, 63, y + 8, 179, y + 40), w(b, 64, y + 88, 207, y + 120)]

describe('calendrier en grille', () => {
  it('repère 12 colonnes même quand les lettres sont collées', () => {
    const c = findColumns(headerGlued)!
    expect(c.pitch).toBeGreaterThan(48)
    expect(c.pitch).toBeLessThan(56)
    expect(Math.abs(c.xOf(1) - (X0 + CW / 2))).toBeLessThan(12)
    expect(Math.abs(c.xOf(12) - (X0 + 11 * CW + CW / 2))).toBeLessThan(14)
  })
  it('lit les cases pleines des rangées Semis et Récolte', () => {
    const img = image([
      { y: 340, months: [2, 3, 4] },
      { y: 420, months: [7, 8, 9, 10] },
    ])
    expect(readMonthGrid([...headerGlued, ...labels(340, 'Semis', 'Récolte')], img)).toEqual({ semis: [2, 3, 4], recolte: [7, 8, 9, 10] })
  })
  it('lit des petites croix et des couleurs claires, et les mots anglais', () => {
    const img = image([
      { y: 340, months: [3, 4, 5], mark: true, color: [20, 20, 20] },
      { y: 420, months: [6, 7, 8], color: [250, 215, 120] },
    ])
    expect(readMonthGrid([...headerGlued, ...labels(340, 'Sow', 'Harvest')], img)).toEqual({ semis: [3, 4, 5], recolte: [6, 7, 8] })
  })
  it('lit une rangée de mois écrits JAN FÉV MAR…', () => {
    const names = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']
    const head = names.map((n, i) => w(n, X0 + i * CW + 6, 277, X0 + i * CW + 46, 309))
    const img = image([{ y: 340, months: [4, 5, 6] }])
    expect(readMonthGrid([...head, w('Semis', 63, 348, 179, 380)], img)).toEqual({ semis: [4, 5, 6], recolte: [] })
  })
  it('ne rend rien sans rangée de mois ni sans rangée étiquetée', () => {
    const img = image([{ y: 340, months: [2, 3] }])
    expect(readMonthGrid([w('Semis', 63, 348, 179, 380)], img)).toBeUndefined()
    expect(readMonthGrid(headerGlued, img)).toBeUndefined()
    expect(readMonthGrid([...headerGlued, w('Variété', 63, 348, 179, 380)], img)).toBeUndefined()
  })
})

describe('étiquettes de rangée mal lues', () => {
  it('accepte « Récoite » et « Kécoue » pour Récolte, mais pas « Floraison »', () => {
    const img = image([
      { y: 340, months: [2, 3] },
      { y: 420, months: [8, 9] },
      { y: 500, months: [6, 7] },
    ])
    const r = readMonthGrid([...headerGlued, w('Semis', 63, 348, 179, 380), w('Kécoue', 64, 428, 207, 460), w('Floraison', 64, 508, 207, 540)], img)
    expect(r).toEqual({ semis: [2, 3], recolte: [8, 9] })
  })
})
