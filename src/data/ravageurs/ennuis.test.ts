import { describe, expect, it } from 'vitest'
import { SPECIES, SPECIES_BY_ID } from '../species'
import { ENNUIS, ENNUIS_BY_ID } from './index'
import type { Ennui } from './types'

// Même règle que src/lib/sentences.test.ts : phrases de 20 mots au plus (coupe sur . ! ? suivis d'une espace et d'une majuscule).
const MAX_WORDS = 20
const sentencesOf = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/)
    .map((x) => x.trim())
    .filter(Boolean)
const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

const TYPES = ['insecte', 'champignon', 'mollusque', 'animal', 'autre']
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// Dose chiffrée : « 5 ml », « 10 g », « 2 litres », « 3 % », « g/l », « cuillère ».
const DOSE = /\b\d+(?:[.,]\d+)?\s?(?:ml|cl|dl|g|gr|kg|l|litres?)\b|%|\bg\/l\b|\bml\/l\b|cuill[eè]res?|c\. ?à ?[sc]\b/i
// Traitement du commerce cité : l'étiquette doit être rappelée.
const TRAITEMENT = /cuivre|bouillie|soufre|savon(?!neuse)|huile de colza|bacillus|phosphate|engrais|granul/i
const INTERDIT = /ravageur|fongique|pesticide|insecticide chimique/i
const textsOf = (e: Ennui) => [e.nom, ...e.alias, ...e.signes, ...e.signesMots, ...e.prevenir, ...e.agir, e.inquietude, e.avertissement ?? '', e.source].filter(Boolean)

describe('guide des bestioles et maladies : données', () => {
  it('au moins 18 fiches, ids uniques en kebab-case, index cohérents', () => {
    expect(ENNUIS.length).toBeGreaterThanOrEqual(18)
    const ids = ENNUIS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(KEBAB)
    expect(Object.keys(ENNUIS_BY_ID).sort()).toEqual([...ids].sort())
    expect(ENNUIS_BY_ID['constructor']).toBeUndefined()
  })

  it('chaque champ est rempli et le type est connu', () => {
    for (const e of ENNUIS) {
      expect(e.nom.trim(), e.id).not.toBe('')
      expect(TYPES, e.id).toContain(e.type)
      for (const [champ, liste] of Object.entries({ alias: e.alias, planteIds: e.planteIds, signes: e.signes, signesMots: e.signesMots, mois: e.mois, prevenir: e.prevenir, agir: e.agir })) {
        expect(liste.length, `${e.id}.${champ}`).toBeGreaterThan(0)
      }
      for (const t of [...e.alias, ...e.signes, ...e.signesMots, ...e.prevenir, ...e.agir, e.inquietude, e.source]) expect(t.trim(), e.id).not.toBe('')
      if (e.avertissement !== undefined) expect(e.avertissement.trim(), e.id).not.toBe('')
    }
  })

  it('planteIds : des ids de fiches espèces existants, sans doublon', () => {
    for (const e of ENNUIS) {
      expect(new Set(e.planteIds).size, e.id).toBe(e.planteIds.length)
      for (const id of e.planteIds) expect(SPECIES_BY_ID[id], `${e.id} : plante inconnue « ${id} »`).toBeDefined()
    }
  })

  it('familles : valeurs de Species.famille existantes', () => {
    const familles = new Set(SPECIES.map((s) => s.famille))
    for (const e of ENNUIS) for (const f of e.familles ?? []) expect(familles.has(f), `${e.id} : famille inconnue « ${f} »`).toBe(true)
  })

  it('mois : entiers de 1 à 12, sans doublon', () => {
    for (const e of ENNUIS) {
      expect(new Set(e.mois).size, e.id).toBe(e.mois.length)
      for (const m of e.mois) expect(Number.isInteger(m) && m >= 1 && m <= 12, `${e.id} : mois ${m}`).toBe(true)
    }
  })

  it('alias : aucun doublon entre fiches (ni avec un nom), accents et casse ignorés', () => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
    const vus = new Map<string, string>()
    for (const e of ENNUIS) {
      const propres = new Set<string>()
      for (const a of e.alias) {
        const k = norm(a)
        expect(propres.has(k), `${e.id} : alias répété « ${a} »`).toBe(false)
        propres.add(k)
        expect(vus.has(k), `« ${a} » est dans ${vus.get(k)} et ${e.id}`).toBe(false)
        vus.set(k, e.id)
      }
    }
  })

  it('phrases de 20 mots au plus partout', () => {
    const trop: string[] = []
    for (const e of ENNUIS) for (const t of textsOf(e)) for (const s of sentencesOf(t)) if (wordCount(s) > MAX_WORDS) trop.push(`${e.id} (${wordCount(s)} mots) : ${s}`)
    expect(trop).toEqual([])
  })

  it('aucune dose chiffrée ni mot de jargon', () => {
    for (const e of ENNUIS) {
      for (const t of [...e.prevenir, ...e.agir, e.avertissement ?? '']) expect(t, `${e.id} : dose`).not.toMatch(DOSE)
      for (const t of textsOf(e)) expect(t, `${e.id} : vocabulaire`).not.toMatch(INTERDIT)
    }
    expect('Mélangez 5 ml par litre').toMatch(DOSE)
    expect('2 g/l').toMatch(DOSE)
    expect('selon l’étiquette du produit').not.toMatch(DOSE)
  })

  it('un traitement du commerce cité : « étiquette » et rappel pour les abeilles dans la fiche', () => {
    let avecTraitement = 0
    for (const e of ENNUIS) {
      const corps = [...e.agir, e.avertissement ?? ''].join(' ')
      if (!TRAITEMENT.test(corps)) continue
      avecTraitement++
      expect(`${e.agir.join(' ')} ${e.avertissement ?? ''}`, `${e.id} : étiquette`).toMatch(/étiquette/)
      expect(e.avertissement ?? '', `${e.id} : abeilles`).toMatch(/abeilles|pollinisateurs|hérissons|racines/)
    }
    expect(avecTraitement).toBeGreaterThan(5)
  })

  it('un traitement posé sur une plante : pas en pleine floraison ni en plein soleil (savon, huile, soufre, cuivre, Bacillus)', () => {
    for (const e of ENNUIS) {
      const corps = [...e.agir].join(' ')
      if (/cuivre|soufre|savon(?!neuse)|huile de colza|bacillus/i.test(corps)) expect(e.avertissement ?? '', e.id).toMatch(/fleur|floraison/)
    }
  })

  it('les ids des fiches de l’exemple de recherche existent', () => {
    for (const id of ['puceron', 'limace-escargot', 'mildiou', 'carpocapse', 'feuilles-jaunes']) expect(ENNUIS_BY_ID[id]).toBeDefined()
  })
})
