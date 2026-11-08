import { describe, expect, it } from 'vitest'
import { FEATURES } from './features'
import { GUIDE_TITLE, GUIDE_TREE, guideLeaves } from './guideTree'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('mode guidé « Que voulez-vous faire ? »', () => {
  it('quatre grandes questions, trois ou quatre réponses chacune', () => {
    expect(GUIDE_TREE).toHaveLength(4)
    for (const b of GUIDE_TREE) {
      expect(b.answers.length, b.id).toBeGreaterThanOrEqual(3)
      expect(b.answers.length, b.id).toBeLessThanOrEqual(4)
    }
    expect(new Set(GUIDE_TREE.map((b) => b.id)).size).toBe(GUIDE_TREE.length)
  })

  it('chaque feuille de l’arbre pointe sur une fonction du registre', () => {
    const ids = new Set(FEATURES.map((f) => f.id))
    for (const leaf of guideLeaves()) expect(ids.has(leaf.feature), `${leaf.mot} → ${leaf.feature}`).toBe(true)
  })

  it('les réponses demandées par le propriétaire y sont', () => {
    const ids = guideLeaves().map((l) => l.feature)
    for (const id of ['carte', 'promenade', 'photos-jardin', 'ajouter-plante', 'photo-plante', 'a-faire', 'ou-planter', 'sauvegarde', 'taille-texte', 'compte']) expect(ids, id).toContain(id)
    expect(GUIDE_TREE.map((b) => b.mot)).toEqual(['Je veux voir mon jardin', 'Je veux ajouter quelque chose', 'Je veux savoir quoi faire', 'Je veux sauvegarder ou changer un réglage'])
  })

  it('phrases de 20 mots au plus, aucun texte vide', () => {
    const texts = [GUIDE_TITLE, ...GUIDE_TREE.flatMap((b) => [b.mot, b.question]), ...guideLeaves().flatMap((l) => [l.mot, l.phrase])]
    for (const t of texts) {
      expect(t.trim().length).toBeGreaterThan(3)
      expect(words(t), t).toBeLessThanOrEqual(20)
    }
  })

  it('une même fonction n’est pas proposée deux fois', () => {
    const ids = guideLeaves().map((l) => l.feature)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
