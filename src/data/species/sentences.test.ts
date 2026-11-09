import { describe, expect, it } from 'vitest'
import { SPECIES } from './index'
import { MAX_WORDS, sentencesOf, wordCount } from '../../lib/sentences'

// Phrases de 20 mots au plus (même règle et même découpage que src/lib/sentences.test.ts) dans TOUT texte
// de chaque fiche : entretien, howTo et outil des tâches, avertissements, alias, fonctions, parties comestibles…
// La liste suit SPECIES : une fiche ajoutée plus tard est contrôlée sans rien changer ici.

/** Tous les textes d'une valeur, avec leur chemin (ex. « taches[2].howTo »). Les nombres et booléens sont ignorés. */
export function textsOf(value: unknown, path: string): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => textsOf(v, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => textsOf(v, path ? `${path}.${k}` : k))
  return []
}

export function longSentences() {
  const found: string[] = []
  for (const s of SPECIES) {
    for (const { path, text } of textsOf(s, '')) {
      for (const sentence of sentencesOf(text)) {
        const n = wordCount(sentence)
        if (n > MAX_WORDS) found.push(`${s.id} · ${path} · ${n} mots (max ${MAX_WORDS}) : « ${sentence} »`)
      }
    }
  }
  return found
}

describe('fiches espèces : longueur des phrases', () => {
  it('le parcours lit bien entretien, howTo et avertissements', () => {
    const paths = textsOf(SPECIES.find((s) => s.id === 'pommier'), '').map((t) => t.path)
    expect(paths).toContain('entretien')
    expect(paths.some((p) => /^taches\[\d+\]\.howTo$/.test(p))).toBe(true)
    const all = SPECIES.flatMap((s) => textsOf(s, '').map((t) => t.path))
    expect(all.some((p) => /^avertissements\[\d+\]\.texte$/.test(p))).toBe(true)
    expect(all.some((p) => /^alias\[\d+\]$/.test(p))).toBe(true)
  })

  it(`aucune phrase de plus de ${MAX_WORDS} mots dans aucun texte d'aucune fiche`, () => {
    expect(longSentences()).toEqual([])
  })

  it('entretien : de 2 à 5 phrases ; howTo : de 1 à 6 phrases (courtes, donc plus nombreuses qu’avant)', () => {
    const found: string[] = []
    for (const s of SPECIES) {
      const n = sentencesOf(s.entretien).length
      if (n < 2 || n > 5) found.push(`${s.id} · entretien · ${n} phrases (attendu 2 à 5)`)
      s.taches.forEach((t, i) => {
        const m = sentencesOf(t.howTo).length
        if (m < 1 || m > 6) found.push(`${s.id} · taches[${i}].howTo · ${m} phrases (attendu 1 à 6)`)
      })
    }
    expect(found).toEqual([])
  })
})
