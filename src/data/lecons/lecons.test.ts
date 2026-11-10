import { describe, expect, it } from 'vitest'
import { MAX_WORDS, sentencesOf, wordCount } from '../../lib/sentences'
import { FEATURES } from '../../lib/features'
import { SPECIES_BY_ID } from '../species'
import { LECONS, LECONS_BY_ID, NIVEAUX, getLecon, leconsDuNiveau } from './index'
import type { Lecon } from './types'

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NIVEAUX_IDS = ['comprendre', 'preparer', 'cultiver', 'vivant']
// Produits chimiques : aucun, nulle part.
const CHIMIE = /herbicide|d[ée]sherbant|pesticide|engrais chimique|roundup|insecticide|fongicide|produit chimique/i
// Dose chiffrée : « 5 ml », « 10 g », « 2 litres », « 3 % », « g/l », « cuillère ».
const DOSE = /\b\d+(?:[.,]\d+)?\s?(?:ml|cl|dl|g|gr|kg|l|litres?)\b|%|\bg\/l\b|\bml\/l\b|cuill[eè]res?|c\. ?à ?[sc]\b/i
// Jargon à ne pas employer (le mot « mellifère » s'écrit « utile aux abeilles »).
const INTERDIT = /ravageur|fongique|ad?ventices?\b|vivace|strate|canop[ée]e|tuile|mell?if[eè]re|diagnostic/i
const URL = /https?:|www\.|\.(?:fr|com|org|net)\b/i
// Règle légale précise ou montant d'aide : renvoyer à la mairie.
const LEGAL = /arr[êe]t[ée]\s+(?:du|pr[ée]fectoral)|article\s+\d|d[ée]cret|\bloi\b|\d\s?(?:€|euros?)/i
const FAUX = /\bfaux\b|\bfausse\b|\bperdu\b|\bperdez\b/i
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Textes affichés d'une leçon, dans l'ordre de lecture (hors titre et source). */
const corps = (l: Lecon) => [l.objectif, ...l.points, ...l.quiz.flatMap((q) => [q.question, ...q.choix, q.explication]), l.attention ?? '']
const textsOf = (l: Lecon) => [l.titre, ...corps(l)]
const featureIds = new Set(FEATURES.map((f) => f.id))

describe('leçons « Apprendre à jardiner » : données', () => {
  it('au moins 12 leçons, ids uniques en kebab-case, index cohérents', () => {
    expect(LECONS.length).toBeGreaterThanOrEqual(12)
    const ids = LECONS.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(KEBAB)
    expect(Object.keys(LECONS_BY_ID).sort()).toEqual([...ids].sort())
    expect(LECONS_BY_ID['constructor']).toBeUndefined()
    expect(getLecon('observer-jardin')?.ordre).toBe(1)
    expect(getLecon('nimporte-quoi')).toBeUndefined()
    expect(getLecon('constructor')).toBeUndefined()
  })

  it('ordre continu de 1 à N, LECONS triées', () => {
    expect(LECONS.map((l) => l.ordre)).toEqual(LECONS.map((_, i) => i + 1))
    for (const l of LECONS) expect(Number.isInteger(l.ordre), l.id).toBe(true)
  })

  it('quatre niveaux, tous représentés, dans l’ordre du parcours', () => {
    expect(NIVEAUX.map((n) => n.id)).toEqual(NIVEAUX_IDS)
    expect(NIVEAUX.map((n) => n.libelle)).toEqual(['Comprendre', 'Préparer', 'Cultiver', 'Un jardin vivant'])
    for (const n of NIVEAUX) {
      expect(n.resume.trim(), n.id).not.toBe('')
      for (const s of sentencesOf(n.resume)) expect(wordCount(s), n.id).toBeLessThanOrEqual(MAX_WORDS)
      expect(leconsDuNiveau(n.id).length, n.id).toBeGreaterThan(0)
    }
    for (const l of LECONS) expect(NIVEAUX_IDS, l.id).toContain(l.niveau)
    // Les niveaux se suivent sans se mélanger.
    const suite = LECONS.map((l) => NIVEAUX_IDS.indexOf(l.niveau))
    expect(suite).toEqual([...suite].sort((a, b) => a - b))
  })

  it('durée de 3 à 5 minutes, champs remplis', () => {
    for (const l of LECONS) {
      expect(Number.isInteger(l.minutes) && l.minutes >= 3 && l.minutes <= 5, `${l.id} : ${l.minutes} min`).toBe(true)
      expect(l.titre.trim(), l.id).not.toBe('')
      expect(l.objectif.trim(), l.id).not.toBe('')
      expect(l.source.trim(), l.id).not.toBe('')
      expect(l.points.length, `${l.id}.points`).toBeGreaterThanOrEqual(4)
      expect(l.points.length, `${l.id}.points`).toBeLessThanOrEqual(7)
      for (const p of l.points) expect(p.trim(), l.id).not.toBe('')
      if (l.attention !== undefined) expect(l.attention.trim(), l.id).not.toBe('')
    }
  })

  it('objectif : une seule phrase ; phrases de 20 mots au plus partout', () => {
    const trop: string[] = []
    for (const l of LECONS) {
      expect(sentencesOf(l.objectif).length, `${l.id} : objectif`).toBe(1)
      for (const t of textsOf(l)) for (const s of sentencesOf(t)) if (wordCount(s) > MAX_WORDS) trop.push(`${l.id} (${wordCount(s)} mots) : ${s}`)
    }
    expect(trop).toEqual([])
  })

  it('quiz : exactement 3 questions, 2 à 4 choix, une bonne réponse dans les bornes, explication courte', () => {
    for (const l of LECONS) {
      expect(l.quiz.length, `${l.id}.quiz`).toBe(3)
      for (const q of l.quiz) {
        expect(q.question.trim(), l.id).not.toBe('')
        expect(q.choix.length, `${l.id} : ${q.question}`).toBeGreaterThanOrEqual(2)
        expect(q.choix.length, `${l.id} : ${q.question}`).toBeLessThanOrEqual(4)
        expect(new Set(q.choix).size, `${l.id} : choix en double`).toBe(q.choix.length)
        for (const c of q.choix) expect(c.trim(), l.id).not.toBe('')
        expect(Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < q.choix.length, `${l.id} : bonne ${q.bonne}`).toBe(true)
        expect(q.explication.trim(), l.id).not.toBe('')
        expect(sentencesOf(q.explication).some((s) => wordCount(s) > MAX_WORDS), `${l.id} : explication trop longue`).toBe(false)
        expect(q.explication, `${l.id} : ton`).not.toMatch(FAUX)
      }
    }
  })

  it('essayer : la fonction existe dans le registre de l’appli', () => {
    let vues = 0
    for (const l of LECONS) {
      if (l.essayer === undefined) continue
      vues++
      expect(featureIds.has(l.essayer.fonction), `${l.id} : fonction inconnue « ${l.essayer.fonction} »`).toBe(true)
      expect(l.essayer.libelle.trim(), l.id).not.toBe('')
    }
    expect(vues).toBeGreaterThanOrEqual(10)
    // Les renvois demandés par le plan.
    const par = (id: string) => getLecon(id)?.essayer?.fonction
    expect(par('connaitre-sol')).toBe('test-sol')
    expect(par('nourrir-sol')).toBe('conseils-compost-eau')
    expect(par('rotation-associations')).toBe('rotation-potager')
    expect(par('sante-jardin')).toBe('guide-ravageurs')
  })

  it('plusLoin : des leçons existantes, jamais la leçon elle-même, sans doublon', () => {
    for (const l of LECONS) {
      for (const id of l.plusLoin ?? []) {
        expect(LECONS_BY_ID[id], `${l.id} : leçon inconnue « ${id} »`).toBeDefined()
        expect(id, l.id).not.toBe(l.id)
      }
      expect(new Set(l.plusLoin ?? []).size, l.id).toBe((l.plusLoin ?? []).length)
    }
  })

  it('mois : entiers de 1 à 12, sans doublon, non vides si présents', () => {
    for (const l of LECONS) {
      if (l.mois === undefined) continue
      expect(l.mois.length, l.id).toBeGreaterThan(0)
      expect(new Set(l.mois).size, l.id).toBe(l.mois.length)
      for (const m of l.mois) expect(Number.isInteger(m) && m >= 1 && m <= 12, `${l.id} : mois ${m}`).toBe(true)
    }
  })

  it('plantes citées : ids du catalogue, et chaque plante apparaît par son nom dans la leçon', () => {
    for (const l of LECONS) {
      expect(new Set(l.planteIds ?? []).size, l.id).toBe((l.planteIds ?? []).length)
      const texte = norm(corps(l).join(' '))
      for (const id of l.planteIds ?? []) {
        const espece = SPECIES_BY_ID[id]
        expect(espece, `${l.id} : plante inconnue « ${id} »`).toBeDefined()
        expect(texte, `${l.id} : « ${id} » n’est pas nommée`).toContain(norm(espece!.nomCommun).split(' ')[0])
      }
    }
  })

  it('aucun produit chimique cité', () => {
    for (const l of LECONS) for (const t of textsOf(l)) expect(t, l.id).not.toMatch(CHIMIE)
    expect('un désherbant chimique').toMatch(CHIMIE)
    expect('du Roundup').toMatch(CHIMIE)
  })

  it('aucune dose chiffrée, aucun jargon, aucun lien, aucune règle légale précise', () => {
    for (const l of LECONS) {
      for (const t of [...textsOf(l), l.essayer?.libelle ?? '']) {
        expect(t, `${l.id} : dose`).not.toMatch(DOSE)
        expect(t, `${l.id} : vocabulaire`).not.toMatch(INTERDIT)
        expect(t, `${l.id} : lien`).not.toMatch(URL)
        expect(t, `${l.id} : règle légale ou montant`).not.toMatch(LEGAL)
      }
      expect(l.source, l.id).not.toMatch(URL)
      expect(l.source, l.id).not.toMatch(/https?:|www\./i)
    }
    expect('Mélangez 5 ml par litre').toMatch(DOSE)
    expect('10 g de sucre').toMatch(DOSE)
    expect('sur quelques centimètres').not.toMatch(DOSE)
    expect('le mellifère').toMatch(INTERDIT)
  })

  it('source générique, sans nom de structure', () => {
    for (const l of LECONS) expect(l.source).toBe('Savoirs de jardinage courants ; principes de jardinage écologique')
  })

  it('« permaculture » et « matières vertes / brunes » : expliquées à leur premier emploi dans la leçon', () => {
    let vues = 0
    for (const l of LECONS) {
      const texte = corps(l).join(' ')
      for (const mot of ['permaculture', 'matières vertes', 'matières brunes']) {
        const i = texte.indexOf(mot)
        if (i < 0) continue
        vues++
        expect(texte.slice(i + mot.length, i + mot.length + 3), `${l.id} : « ${mot} » sans explication`).toMatch(/^ \(/)
      }
    }
    expect(vues).toBeGreaterThanOrEqual(4)
  })

  it('taille : fruits à noyau en été, jamais en hiver ; eau de pluie et aides : renvoi à la mairie', () => {
    const taille = LECONS_BY_ID['tailler-debuter']!
    const t = taille.points.join(' ')
    expect(t).toMatch(/cerisiers.*abricotiers.*(?:après la récolte|en été)/i)
    expect(t).toMatch(/jamais en hiver/)
    expect(taille.mois).toEqual(expect.arrayContaining([7, 8]))
    const eau = LECONS_BY_ID['eau-jardin']!
    expect(eau.attention ?? '').toMatch(/mairie/)
    expect(corps(eau).join(' ')).toMatch(/pas potable/)
    expect(LECONS_BY_ID['nourrir-sol']!.attention ?? '').toMatch(/renseignez-vous auprès de votre commune/)
    expect(LECONS_BY_ID['organiser-jardin']!.attention ?? '').toMatch(/mairie/)
  })

  it('hôtel à insectes : aucune promesse de résultat', () => {
    const vivant = LECONS_BY_ID['biodiversite']!
    const texte = corps(vivant).join(' ')
    expect(texte).toMatch(/hôtel à insectes/)
    expect(texte).toMatch(/n’est pas (?:garanti|indispensable)|sans garantie|jamais garanti/)
    expect(texte).not.toMatch(/\b(?:garantit|garantie? que|assure(?:z)? la|attirera à coup sûr|toujours des)\b/)
  })
})
