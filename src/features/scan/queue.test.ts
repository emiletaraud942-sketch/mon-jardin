import { describe, expect, it } from 'vitest'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import {
  applyResults, BACKOFF_MS, canValidate, chooseSpecies, dueItems, enqueue, finish, forGarden, itemName, markFailed, markIgnored, markNeedsConsent, markUnvalidated, markValidated, MAX_ATTEMPTS, newItem,
  resetRetry, sanitizeQueue, summary, summaryText, waitingText, type Queue,
} from './queue'

const mk = (id: string, g = 'g1') => newItem({ id, gardenId: g, photoId: 'photo:abc' + id, position: { x: 1, y: 2 }, accuracyM: 3, now: new Date('2026-05-01T10:00:00Z') })
const sug = [
  { latin: 'Malus domestica', name: 'Pommier', score: 0.8, speciesId: 'pommier', approx: false },
  { latin: 'Rosa canina', name: 'Églantier', score: 0.1, approx: false },
]

describe('file d’attente du scan', () => {
  it('une photo arrive « en attente », puis « à valider » avec la meilleure suggestion', () => {
    let q: Queue = enqueue([], mk('a'))
    expect(q[0].status).toBe('en-attente')
    q = applyResults(q, 'a', [{ ...sug[0], speciesId: undefined }, sug[1]])
    expect(q[0].status).toBe('a-valider')
    expect(q[0].speciesId).toBe(UNKNOWN_SPECIES_ID)
    expect(q[0].customName).toBe('Pommier')
    expect(canValidate(q[0])).toBe(true)
  })
  it('garde un choix déjà fait par la personne', () => {
    let q = enqueue([], mk('a'))
    q = chooseSpecies(q, 'a', { speciesId: UNKNOWN_SPECIES_ID, customName: 'Rosier de grand-mère' })
    q = applyResults(q, 'a', sug)
    expect(itemName(q[0])).toBe('Rosier de grand-mère')
  })
  it('hors ligne : attend sans compter d’essai', () => {
    let q = enqueue([], mk('a'))
    q = markFailed(q, 'a', { offline: true, now: 1000 })
    expect(q[0]).toMatchObject({ status: 'en-attente', why: 'reseau', attempts: 0 })
    expect(dueItems(q, { now: 1000, online: false, consent: true })).toHaveLength(0)
    expect(dueItems(q, { now: 1000, online: true, consent: true })).toHaveLength(1)
  })
  it('erreur réseau : délai croissant, puis abandon après le plafond', () => {
    let q = enqueue([], mk('a'))
    q = markFailed(q, 'a', { offline: false, now: 0 })
    expect(q[0].nextTryAt).toBe(BACKOFF_MS[0])
    expect(dueItems(q, { now: 5000, online: true, consent: true })).toHaveLength(0)
    expect(dueItems(q, { now: BACKOFF_MS[0], online: true, consent: true })).toHaveLength(1)
    for (let i = 1; i < MAX_ATTEMPTS; i++) q = markFailed(q, 'a', { offline: false, now: 0 })
    expect(dueItems(q, { now: 1e12, online: true, consent: true })).toHaveLength(0)
    expect(waitingText(q[0], 0)).toMatch(/Choisissez la plante/)
    q = resetRetry(q, 'a')
    expect(dueItems(q, { now: 0, online: true, consent: true })).toHaveLength(1)
  })
  it('sans accord : rien n’est envoyé', () => {
    let q = enqueue([], mk('a'))
    q = markNeedsConsent(q, 'a')
    expect(dueItems(q, { now: 0, online: true, consent: false })).toHaveLength(0)
    expect(waitingText(q[0], 0)).toMatch(/accord/)
  })
  it('choisir une plante à la main suffit pour valider, même sans identification', () => {
    let q = enqueue([], mk('a'))
    expect(canValidate(q[0])).toBe(false)
    q = chooseSpecies(q, 'a', { speciesId: 'pommier' })
    expect(q[0].status).toBe('a-valider')
    expect(canValidate(q[0])).toBe(true)
    expect(itemName(q[0])).toBe('Pommier')
  })
  it('une plante sans fiche exige un nom', () => {
    let q = enqueue([], mk('a'))
    q = chooseSpecies(q, 'a', { speciesId: UNKNOWN_SPECIES_ID })
    expect(canValidate(q[0])).toBe(false)
  })
  it('compte validées et à revoir', () => {
    let q: Queue = ['a', 'b', 'c', 'd'].reduce((acc, id) => enqueue(acc, mk(id)), [] as Queue)
    q = applyResults(q, 'a', sug)
    q = applyResults(q, 'b', sug)
    q = markValidated(q, 'a', 'p1')
    q = markIgnored(q, 'b')
    expect(summary(q)).toEqual({ validated: 1, toReview: 2, ignored: 1, waiting: 2 })
    expect(summaryText(summary(q))).toBe('1 plante validée, 2 à revoir')
    expect(summaryText({ validated: 6, toReview: 2, ignored: 0, waiting: 0 })).toBe('6 plantes validées, 2 à revoir')
    expect(summaryText({ validated: 0, toReview: 0, ignored: 0, waiting: 0 })).toMatch(/Aucune/)
  })
  it('annuler une validation remet à valider', () => {
    let q = applyResults(enqueue([], mk('a')), 'a', sug)
    q = markUnvalidated(markValidated(q, 'a', 'p1'), 'a')
    expect(q[0]).toMatchObject({ status: 'a-valider', plantId: undefined })
  })
  it('terminer garde les éléments à revoir et rend les photos ignorées', () => {
    let q: Queue = ['a', 'b', 'c'].reduce((acc, id) => enqueue(acc, mk(id)), [] as Queue)
    q = markIgnored(q, 'a')
    q = markValidated(applyResults(q, 'b', sug), 'b', 'p')
    const f = finish(q)
    expect(f.kept.map((i) => i.id)).toEqual(['c'])
    expect(f.ignoredPhotos).toEqual(['photo:abca'])
  })
  it('sépare les jardins', () => {
    const q = [mk('a', 'g1'), mk('b', 'g2')]
    expect(forGarden(q, 'g2').map((i) => i.id)).toEqual(['b'])
  })
})

describe('lecture depuis IndexedDB', () => {
  it('écarte les éléments abîmés et corrige le reste', () => {
    const good = { ...mk('a'), speciesId: 'espece-inconnue-xyz', status: 'bizarre' }
    const q = sanitizeQueue([good, null, { id: 'x' }, { ...mk('b'), photoId: '../etc' }, { ...mk('c'), position: { x: NaN, y: 0 } }, { ...mk('a') }, 'texte'])
    expect(q.map((i) => i.id)).toEqual(['a'])
    expect(q[0].speciesId).toBeUndefined()
    expect(q[0].status).toBe('en-attente')
  })
  it('accepte autre chose qu’un tableau sans planter', () => {
    expect(sanitizeQueue(undefined)).toEqual([])
    expect(sanitizeQueue({})).toEqual([])
  })
})
