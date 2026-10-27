import { describe, expect, it } from 'vitest'
import { BANNER_ORDER, pickBanner } from './bannerQueue'

describe('file d’attente des bandeaux', () => {
  it('un seul bandeau à la fois : le plus prioritaire passe', () => {
    expect(pickBanner(['exemple', 'miseajour', 'donnees'])).toBe('miseajour')
    expect(pickBanner(['exemple', 'donnees'])).toBe('donnees')
    expect(pickBanner(['exemple'])).toBe('exemple')
  })

  it('un problème de stockage passe avant tout', () => {
    expect(pickBanner(['exemple', 'miseajour', 'stockage'])).toBe('stockage')
  })

  it('aucun bandeau quand rien n’est demandé', () => {
    expect(pickBanner([])).toBeUndefined()
  })

  it('aucun bandeau pendant le placement d’une plante', () => {
    expect(pickBanner(['stockage', 'miseajour', 'exemple'], true)).toBeUndefined()
  })

  it('quand le premier s’efface, le suivant passe', () => {
    const queue = new Set(['miseajour', 'donnees', 'exemple'] as const)
    expect(pickBanner(queue)).toBe('miseajour')
    queue.delete('miseajour')
    expect(pickBanner(queue)).toBe('donnees')
    queue.delete('donnees')
    expect(pickBanner(queue)).toBe('exemple')
  })

  it('l’ordre couvre tous les bandeaux, sans doublon', () => {
    expect(new Set(BANNER_ORDER).size).toBe(BANNER_ORDER.length)
    expect(BANNER_ORDER).toEqual(['stockage', 'miseajour', 'donnees', 'carte', 'exemple'])
  })
})
