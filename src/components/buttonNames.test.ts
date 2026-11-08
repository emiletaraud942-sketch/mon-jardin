import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Aucun <button> ni <a> sans nom : un mot visible, ou un aria-label. Une icône seule ne dit rien à qui ne la connaît pas.
const SRC = join(__dirname, '..')
function sources(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) out.push(p)
  }
  return out
}

/** Les éléments <button …>…</button> et <a …>…</a> d'un fichier (sans imbrication de même nom). */
function elements(src: string, tag: 'button' | 'a'): { open: string; inner: string; line: number }[] {
  const out: { open: string; inner: string; line: number }[] = []
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(?<!/)>([\\s\\S]*?)</${tag}>`, 'g')
  // Les attributs peuvent contenir « => » : on cherche la fin de la balise ouvrante à la main.
  let from = 0
  for (;;) {
    const i = src.indexOf(`<${tag}`, from)
    if (i < 0) break
    const next = src[i + tag.length + 1]
    if (next !== ' ' && next !== '\n' && next !== '>') {
      from = i + 1
      continue
    }
    let depth = 0
    let j = i
    let quote = ''
    for (; j < src.length; j++) {
      const c = src[j]
      if (quote) {
        if (c === quote && src[j - 1] !== '\\') quote = ''
      } else if (c === '"' || c === "'" || c === '`') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0 && src[j - 1] !== '=') break
    }
    const open = src.slice(i, j + 1)
    const end = src.indexOf(`</${tag}>`, j)
    from = j + 1
    if (open.endsWith('/>') || end < 0) continue
    out.push({ open, inner: src.slice(j + 1, end), line: src.slice(0, i).split('\n').length })
  }
  void re
  return out
}

/** Le bouton a-t-il un nom ? aria-label, ou texte (lettre), ou expression {…} qui peut en produire un. */
function named(open: string, inner: string): boolean {
  if (/aria-label(ledby)?=/.test(open)) return true
  const text = inner.replace(/<Icon\b[^>]*\/>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ')
  if (/[A-Za-zÀ-ÿ]/.test(text.replace(/\{[^}]*\}/g, ''))) return true
  // Une expression {…} qui n'est pas une icône : on la croit (texte calculé).
  return /\{(?!\s*\/\*)[^}]*\}/.test(text) && !/^\s*\{[^}]*(Icon|<)/.test(text)
}

describe('boutons et liens avec un nom', () => {
  it('aucun <button> ni <a> sans texte visible ni aria-label', () => {
    const bad: string[] = []
    for (const f of sources(SRC)) {
      const src = readFileSync(f, 'utf8')
      for (const tag of ['button', 'a'] as const)
        for (const e of elements(src, tag)) if (!named(e.open, e.inner)) bad.push(`${f.slice(SRC.length + 1)}:${e.line} ${e.open.slice(0, 80).replace(/\s+/g, ' ')}`)
    }
    expect(bad).toEqual([])
  })

  it('le contrôle sait repérer un bouton sans nom', () => {
    expect(named('<button onClick={x}>', '<Icon name="x" />')).toBe(false)
    expect(named('<button aria-label="Fermer">', '<Icon name="x" />')).toBe(true)
    expect(named('<button>', ' Fermer ')).toBe(true)
    expect(named('<button>', '<Icon name="x" /> {label}')).toBe(true)
  })
})
