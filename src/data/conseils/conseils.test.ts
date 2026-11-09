import { describe, expect, it } from 'vitest'
import { MAX_WORDS, sentencesOf, wordCount } from '../../lib/sentences'
import { SPECIES_BY_ID } from '../species'
import { CONSEILS, CONSEILS_BY_ID, CONSEIL_THEMES, getConseil } from './index'
import type { Conseil } from './types'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const THEMES = ['compost', 'eau']
// Produits chimiques : aucun, nulle part.
const CHIMIE = /herbicide|d[ée]sherbant chimique|pesticide|engrais chimique|roundup|insecticide/i
// Dose chiffrée : « 5 ml », « 10 g », « 2 litres », « 3 % », « g/l », « cuillère ».
const DOSE = /\b\d+(?:[.,]\d+)?\s?(?:ml|cl|dl|g|gr|kg|l|litres?)\b|%|\bg\/l\b|\bml\/l\b|cuill[eè]res?|c\. ?à ?[sc]\b/i
const INTERDIT = /mellif[eè]re|strate|vivace|canop[ée]e|tuile|recalage|diagnostic|ravageur|\bC\/N\b|lixiviat|\bBRF\b|ad?ventices?\b/i
const textsOf = (c: Conseil) => [c.titre, c.resume, ...c.etapes, ...(c.astuces ?? []), c.attention ?? '', c.source].filter(Boolean)
const corps = (c: Conseil) => [c.resume, ...c.etapes, ...(c.astuces ?? []), c.attention ?? ''].join(' ')

describe('conseils compost et eau : données', () => {
  it('au moins 14 fiches dont 6 par thème, ids uniques en kebab-case, index cohérents', () => {
    expect(CONSEILS.length).toBeGreaterThanOrEqual(14)
    for (const t of THEMES) expect(CONSEILS.filter((c) => c.theme === t).length, t).toBeGreaterThanOrEqual(6)
    const ids = CONSEILS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(KEBAB)
    expect(Object.keys(CONSEILS_BY_ID).sort()).toEqual([...ids].sort())
    expect(CONSEILS_BY_ID['constructor']).toBeUndefined()
    expect(getConseil('compost-demarrer')?.theme).toBe('compost')
    expect(getConseil('nimporte-quoi')).toBeUndefined()
    expect(getConseil('constructor')).toBeUndefined()
  })

  it('thèmes valides et libellés', () => {
    expect(CONSEIL_THEMES.map((t) => t.id)).toEqual(THEMES)
    expect(CONSEIL_THEMES.map((t) => t.libelle)).toEqual(['Compost', 'Économiser l’eau'])
    for (const c of CONSEILS) expect(THEMES, c.id).toContain(c.theme)
  })

  it('chaque champ est rempli', () => {
    for (const c of CONSEILS) {
      expect(c.titre.trim(), c.id).not.toBe('')
      expect(c.resume.trim(), c.id).not.toBe('')
      expect(c.source.trim(), c.id).not.toBe('')
      expect(c.source, c.id).not.toMatch(/https?:|www\./i)
      expect(c.etapes.length, `${c.id}.etapes`).toBeGreaterThanOrEqual(3)
      expect(c.motsCles.length, `${c.id}.motsCles`).toBeGreaterThanOrEqual(3)
      for (const t of [...c.etapes, ...c.motsCles, ...(c.astuces ?? [])]) expect(t.trim(), c.id).not.toBe('')
      if (c.astuces !== undefined) expect(c.astuces.length, c.id).toBeGreaterThan(0)
      if (c.attention !== undefined) expect(c.attention.trim(), c.id).not.toBe('')
    }
  })

  it('résumé : une seule phrase', () => {
    for (const c of CONSEILS) expect(sentencesOf(c.resume).length, c.id).toBe(1)
  })

  it('phrases de 20 mots au plus partout', () => {
    const trop: string[] = []
    for (const c of CONSEILS) for (const t of textsOf(c)) for (const s of sentencesOf(t)) if (wordCount(s) > MAX_WORDS) trop.push(`${c.id} (${wordCount(s)} mots) : ${s}`)
    expect(trop).toEqual([])
  })

  it('mois : entiers de 1 à 12, sans doublon, non vides si présents', () => {
    for (const c of CONSEILS) {
      if (c.mois === undefined) continue
      expect(c.mois.length, c.id).toBeGreaterThan(0)
      expect(new Set(c.mois).size, c.id).toBe(c.mois.length)
      for (const m of c.mois) expect(Number.isInteger(m) && m >= 1 && m <= 12, `${c.id} : mois ${m}`).toBe(true)
    }
  })

  it('aucun produit chimique cité', () => {
    for (const c of CONSEILS) for (const t of [...textsOf(c), ...c.motsCles]) expect(t, c.id).not.toMatch(CHIMIE)
    expect('un désherbant chimique').toMatch(CHIMIE)
    expect('du Roundup').toMatch(CHIMIE)
  })

  it('aucune dose chiffrée de produit ni mot de jargon', () => {
    for (const c of CONSEILS) {
      for (const t of textsOf(c)) {
        expect(t, `${c.id} : dose`).not.toMatch(DOSE)
        expect(t, `${c.id} : vocabulaire`).not.toMatch(INTERDIT)
      }
    }
    expect('Mélangez 5 ml par litre').toMatch(DOSE)
    expect('10 g de sucre').toMatch(DOSE)
    expect('sur quelques centimètres').not.toMatch(DOSE)
  })

  it('matières vertes et brunes : expliquées à leur premier emploi dans chaque fiche', () => {
    let vues = 0
    for (const c of CONSEILS) {
      const texte = corps(c)
      for (const mot of ['matières vertes', 'matières brunes']) {
        const i = texte.indexOf(mot)
        if (i < 0) continue
        vues++
        expect(texte.slice(i + mot.length, i + mot.length + 3), `${c.id} : « ${mot} » sans explication`).toMatch(/^ \(/)
      }
    }
    expect(vues).toBeGreaterThan(6)
  })

  it('eau de pluie : renvoi à la mairie, sans règle légale précise', () => {
    const pluie = CONSEILS_BY_ID['eau-pluie']!
    expect(pluie.attention ?? '').toMatch(/mairie/)
    expect(pluie.attention ?? '').toMatch(/pas potable/)
    expect(corps(pluie)).not.toMatch(/arr[êe]t[ée]\s+du|article\s+\d|décret|loi\b/i)
  })

  it('plantes citées : ids existants, et chaque id apparaît par son nom dans la fiche', () => {
    for (const c of CONSEILS) {
      for (const id of c.planteIds ?? []) expect(SPECIES_BY_ID[id], `${c.id} : plante inconnue « ${id} »`).toBeDefined()
      expect(new Set(c.planteIds ?? []).size, c.id).toBe((c.planteIds ?? []).length)
    }
    const plantes = CONSEILS_BY_ID['eau-plantes-seches']!
    const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    for (const id of plantes.planteIds ?? []) expect(norm(corps(plantes)), id).toContain(norm(SPECIES_BY_ID[id]!.nomCommun).split(' ')[0])
  })

  it('mots-clés de recherche attendus', () => {
    const tous = CONSEILS.flatMap((c) => c.motsCles.map((m) => m.toLowerCase())).join(' | ')
    for (const m of ['épluchures', 'tonte', 'paillage', 'pluie', 'arrosage matin', 'canicule']) expect(tous, m).toContain(m)
  })
})
