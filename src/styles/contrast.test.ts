import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Paires de couleurs : texte lisible (4,5:1) dans les deux thèmes, et variables interdites pour du texte.
const dir = __dirname
const css = ['app.css', 'leafora.css', 'mobile-nav.css', 'novice-pages.css', 'panorama.css'].map((f) => readFileSync(join(dir, f), 'utf8'))
const app = css[0]

function block(selector: string): Record<string, string> {
  const i = app.indexOf(selector + ' {')
  const out: Record<string, string> = {}
  const body = app.slice(i, app.indexOf('\n}', i))
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2]
  return out
}
const light = block(':root')
const dark = { ...light, ...block(":root[data-theme='dark']") }

function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** [texte, fond] : paires où du texte est réellement posé. */
const TEXT_PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface-2'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted-2', 'surface-2'],
  ['muted-2', 'track'],
  ['warn-text', 'warn-soft'],
  ['warn', 'warn-soft'],
  ['danger', 'danger-soft'],
  ['title', 'bg'],
  ['accent', 'bg'],
  ['on-btn-green', 'btn-green'],
  ['cal-abri', 'surface'],
  ['cal-abri', 'surface-2'],
  ['cal-harvest', 'surface'],
  ['cal-harvest', 'surface-2'],
  ['dry-text', 'dry-bg'],
  ['frost-text', 'frost-bg'],
  ['water-text', 'water-bg'],
  ['give-text', 'give-bg'],
]

describe('contrastes des paires de texte', () => {
  for (const [name, theme] of [['clair', light], ['sombre', dark]] as const) {
    for (const [fg, bg] of TEXT_PAIRS) {
      it(`${fg} sur ${bg} (${name}) : au moins 4,5:1`, () => {
        expect(theme[fg], `--${fg} absente`).toBeTruthy()
        expect(theme[bg], `--${bg} absente`).toBeTruthy()
        expect(ratio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('--muted (gris de la maquette) n’est jamais posé sur --surface-2 ni --track : on y utilise --muted-2', () => {
    // 4,21:1 et 3,89:1 en thème clair : sous le seuil.
    expect(ratio(light.muted, light['surface-2'])).toBeLessThan(4.5)
    expect(ratio(light.muted, light.track)).toBeLessThan(4.5)
    expect(ratio(light['muted-2'], light.track)).toBeGreaterThanOrEqual(4.5)
  })

  it('--sun (2,1:1 sur blanc) ne sert jamais de couleur de texte', () => {
    for (const c of css) expect(c).not.toMatch(/[^-]color:\s*var\(--sun\)/)
  })
})
