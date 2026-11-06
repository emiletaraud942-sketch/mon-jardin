import { describe, expect, it } from 'vitest'
import { CONTENT_REGIONS, inertRegions, type InertNode } from './inert'

const node = (inert = false): InertNode & { attrs: Set<string> } => {
  const attrs = new Set<string>(inert ? ['inert'] : [])
  return { attrs, hasAttribute: (a) => attrs.has(a), setAttribute: (a) => void attrs.add(a), removeAttribute: (a) => void attrs.delete(a) }
}

describe('inertRegions', () => {
  it('rend inertes les zones de contenu et rétablit l’état d’avant', () => {
    const regions = [node(), node()]
    const asked: string[] = []
    const off = inertRegions({ querySelectorAll: (s) => (asked.push(s), regions) })
    expect(asked).toEqual([CONTENT_REGIONS])
    expect(regions.every((r) => r.attrs.has('inert'))).toBe(true)
    off()
    expect(regions.some((r) => r.attrs.has('inert'))).toBe(false)
  })

  it('ne retire pas un inert posé par ailleurs', () => {
    const other = node(true)
    inertRegions({ querySelectorAll: () => [other] })()
    expect(other.attrs.has('inert')).toBe(true)
  })

  it('ne vise jamais les messages ni les boîtes de dialogue', () => {
    expect(CONTENT_REGIONS).not.toMatch(/toast|overlay-stack|dialog|modal/)
    expect(CONTENT_REGIONS).toContain('.app > .main')
  })
})
