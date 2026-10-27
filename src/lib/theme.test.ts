import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTheme, setTheme } from './theme'

function installBrowserStubs() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  const attrs = new Map<string, string>()
  const root = { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) }
  const head = { querySelector: () => null, prepend: () => undefined }
  vi.stubGlobal('document', { documentElement: root, head, createElement: () => ({ setAttribute: () => undefined }) })
  return attrs
}

describe('thème', () => {
  let attrs: Map<string, string>
  beforeEach(() => {
    attrs = installBrowserStubs()
  })

  it('est clair par défaut, même si le téléphone est en mode sombre', () => {
    expect(getTheme()).toBe('light')
  })

  it('mémorise Sombre et Automatique', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    expect(attrs.get('data-theme')).toBe('dark')
    setTheme('auto')
    expect(getTheme()).toBe('auto')
    expect(attrs.get('data-theme')).toBe('auto')
  })
})
