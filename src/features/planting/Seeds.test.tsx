import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FEATURES, searchFeatures } from '../../lib/features'
import { SeedsCard } from './Seeds'

const html = renderToStaticMarkup(createElement(SeedsCard))
const words = (t: string) => t.split(/\s+/).filter(Boolean).length

describe('Mes graines : lire le sachet en photo', () => {
  it('le bouton est là, avec son mot, et une entrée de galerie', () => {
    expect(html).toContain('Lire le sachet en photo')
    expect(html).toContain('Choisir une photo')
    expect(html).toContain('capture="environment"')
    expect(html.match(/type="file"/g)).toHaveLength(2)
  })
  it('dit que la photo n’est pas gardée et ne quitte pas l’appareil', () => {
    expect(html).toContain('La photo n’est pas gardée et ne quitte pas l’appareil.')
  })
  it('rien n’est ajouté tout seul : « Ajouter ce sachet » reste désactivé tant qu’il n’y a pas de nom', () => {
    expect(html).toMatch(/<button type="submit" class="btn primary" disabled=""[^>]*>[\s\S]*Ajouter ce sachet/)
    expect(html).toContain('Aucun sachet pour l’instant.')
  })
  it('les phrases de l’écran font 20 mots au plus', () => {
    const texts = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    expect(texts.length).toBeGreaterThan(1)
    for (const t of texts) for (const sentence of t.split(/(?<=[.!?])\s+/)) expect(words(sentence), sentence).toBeLessThanOrEqual(20)
  })
  it('le registre : phrase courte et mots-clés photo, sachet, lire', () => {
    const f = FEATURES.find((x) => x.id === 'mes-graines')!
    expect(words(f.phrase)).toBeLessThanOrEqual(20)
    expect(f.motsCles).toEqual(expect.arrayContaining(['photo', 'sachet', 'lire']))
    expect(searchFeatures('lire sachet photo').map((x) => x.id)).toContain('mes-graines')
  })
})
