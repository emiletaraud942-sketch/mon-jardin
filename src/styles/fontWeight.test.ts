import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Écriture légère : texte 400, mise en valeur 500, chiffre clé 600. Jamais au-delà.
const SRC = join(__dirname, '..')

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(css|tsx)$/.test(name)) out.push(p)
  }
  return out
}

// Retire les commentaires CSS et les blocs @font-face (plage de la police variable).
const clean = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/g, '')

type Hit = { file: string; text: string }
function bad(): Hit[] {
  const hits: Hit[] = []
  for (const f of files(SRC)) {
    const src = clean(readFileSync(f, 'utf8'))
    const rel = f.slice(SRC.length + 1)
    const decl = /font-?weight['"]?\s*[:=]\s*['"]?([^;,}'"\n]+)/gi
    for (const m of src.matchAll(decl)) {
      const v = m[1].trim()
      const nums = v.match(/\d+/g)?.map(Number) ?? []
      if (/bold|bolder/i.test(v) || nums.some((n) => n > 600)) hits.push({ file: rel, text: m[0] })
    }
    // Raccourci `font: 700 1rem/1.3 …` et chaînes canvas `700 12px …`
    for (const m of src.matchAll(/\bfont\s*[:=]\s*[`'"]?\s*(?:italic\s+)?(\d{3})\b/g)) {
      if (Number(m[1]) > 600) hits.push({ file: rel, text: m[0] })
    }
    for (const m of src.matchAll(/\bfont:\s*[^;]*\bbold(er)?\b/gi)) hits.push({ file: rel, text: m[0] })
  }
  return hits
}

describe('graisses de police', () => {
  it('aucun font-weight au-delà de 600 ni bold/bolder dans src/', () => {
    expect(bad()).toEqual([])
  })

  it('le détecteur voit bien les css et tsx', () => {
    const all = files(SRC)
    expect(all.some((f) => f.endsWith('app.css'))).toBe(true)
    expect(all.some((f) => f.endsWith('App.tsx'))).toBe(true)
  })

  it(':root définit --fw-text, --fw-strong et --fw-key (≤ 600)', () => {
    const css = readFileSync(join(SRC, 'styles/app.css'), 'utf8')
    const get = (n: string) => Number(css.match(new RegExp(`--${n}:\\s*(\\d+)\\s*;`))?.[1])
    expect(get('fw-text')).toBe(400)
    expect(get('fw-strong')).toBe(500)
    expect(get('fw-key')).toBe(600)
  })

  it('b et strong reprennent --fw-strong', () => {
    const css = readFileSync(join(SRC, 'styles/app.css'), 'utf8')
    expect(css).toMatch(/b,\s*strong,[^{]*\{\s*font-weight:\s*var\(--fw-strong\)/)
  })

  it('la police DM Sans variable couvre 400 à 600 sans gras synthétique', () => {
    const css = readFileSync(join(SRC, 'styles/app.css'), 'utf8')
    expect(css).toMatch(/font-family:\s*'DM Sans';[^}]*font-weight:\s*400 600/)
  })
})
