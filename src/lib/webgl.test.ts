import { beforeEach, describe, expect, it } from 'vitest'
import { resetWebgl2Cache, webgl2Supported } from './webgl'

beforeEach(() => resetWebgl2Cache())

describe('webgl2Supported', () => {
  it('vrai quand le navigateur donne un contexte WebGL 2', () => {
    expect(webgl2Supported(() => ({ getContext: (id) => (id === 'webgl2' ? {} : null) }))).toBe(true)
  })
  it('faux quand il refuse (iOS 14, GPU bloqué)', () => {
    expect(webgl2Supported(() => ({ getContext: () => null }))).toBe(false)
  })
  it('faux, sans planter, quand la création du canvas ou du contexte lève une erreur, ou sans document', () => {
    expect(webgl2Supported(() => { throw new Error('canvas indisponible') })).toBe(false)
    resetWebgl2Cache()
    expect(webgl2Supported(() => ({ getContext: () => { throw new Error('contexte refusé') } }))).toBe(false)
    resetWebgl2Cache()
    expect(webgl2Supported(() => null)).toBe(false)
  })
  it('mémorise la première réponse', () => {
    expect(webgl2Supported(() => ({ getContext: () => ({}) }))).toBe(true)
    expect(webgl2Supported(() => ({ getContext: () => null }))).toBe(true)
  })
})
