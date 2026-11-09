import { describe, expect, it } from 'vitest'
import { viewHint } from './viewHint'

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/)

describe('aide de la vue 3D', () => {
  it('à la souris : glisser, clic droit ou Maj, molette (les gestes réels des contrôles)', () => {
    const t = viewHint(false)
    expect(t).toMatch(/glisser pour tourner/i)
    expect(t).toMatch(/clic droit ou Maj/i)
    expect(t).toMatch(/molette/i)
    expect(t).not.toMatch(/doigts/)
  })
  it('au doigt : le texte d’origine', () => {
    expect(viewHint(true)).toMatch(/^Tournez la vue à deux doigts\./)
  })
  it('les deux gardent l’aide de déplacement d’une plante, en phrases de 20 mots au plus', () => {
    for (const touch of [true, false]) {
      const t = viewHint(touch)
      expect(t).toContain('Déplacer cette plante')
      for (const s of sentences(t)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(20)
    }
  })
})
