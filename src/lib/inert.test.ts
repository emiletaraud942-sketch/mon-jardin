import { describe, expect, it } from 'vitest'
import { inertAround, type InertNode } from './inert'

function el(tagName: string, className = '', kids: InertNode[] = []): InertNode & { attrs: Set<string> } {
  const attrs = new Set<string>()
  const n: InertNode & { attrs: Set<string> } = {
    tagName,
    className,
    attrs,
    parentElement: null,
    children: kids,
    hasAttribute: (a) => attrs.has(a),
    setAttribute: (a) => void attrs.add(a),
    removeAttribute: (a) => void attrs.delete(a),
  }
  for (const k of kids) k.parentElement = n
  return n
}

describe('inertAround', () => {
  it('rend inertes les frères de l’écran et ceux de ses ancêtres, pas lui-même ni les messages', () => {
    const header = el('HEADER')
    const main = el('MAIN')
    const overlay = el('DIV', 'pano-overlay')
    const toasts = el('DIV', 'toast-host')
    const app = el('DIV', 'app', [header, main, toasts, overlay])
    const script = el('SCRIPT')
    const body = el('BODY', '', [app, script])
    const off = inertAround(overlay, body)
    expect(header.attrs.has('inert')).toBe(true)
    expect(main.attrs.has('inert')).toBe(true)
    expect(toasts.attrs.has('inert')).toBe(false)
    expect(overlay.attrs.has('inert')).toBe(false)
    expect(app.attrs.has('inert')).toBe(false)
    expect(script.attrs.has('inert')).toBe(false)
    off()
    expect(header.attrs.has('inert')).toBe(false)
    expect(main.attrs.has('inert')).toBe(false)
  })

  it('ne retire pas un inert posé par ailleurs', () => {
    const other = el('DIV')
    other.attrs.add('inert')
    const overlay = el('DIV')
    const body = el('BODY', '', [other, overlay])
    inertAround(overlay, body)()
    expect(other.attrs.has('inert')).toBe(true)
  })

  it('fonctionne pour un écran monté dans body (fiche plante en portail)', () => {
    const app = el('DIV', 'app')
    const fiche = el('DIV', 'fiche-overlay')
    const body = el('BODY', '', [app, fiche])
    inertAround(fiche, body)
    expect(app.attrs.has('inert')).toBe(true)
  })
})
