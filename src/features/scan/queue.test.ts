import { describe, expect, it } from 'vitest'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import {
  applyGroupResults, applyResults, BACKOFF_MS, groupCompanions, groupPlan, GROUP_MAX, GROUP_RADIUS_M, MERGE_RADIUS_M, canValidate, chooseSpecies, dueItems, enqueue, finish, forGarden, itemName, markFailed, markIgnored, markNeedsConsent, markUnvalidated, markValidated, MAX_ATTEMPTS, newItem,
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

describe('plante incertaine (A)', () => {
  it('incertain : « à valider » sans nom choisi d’office, avec la phrase de genre', () => {
    let q: Queue = enqueue([], mk('a'))
    q = applyResults(q, 'a', sug, { uncertain: true, hint: 'Probablement du genre Acer' })
    expect(q[0].status).toBe('a-valider')
    expect(q[0].speciesId).toBeUndefined()
    expect(q[0].uncertain).toBe(true)
    expect(q[0].hint).toBe('Probablement du genre Acer')
    expect(canValidate(q[0])).toBe(false)
    expect(itemName(q[0])).toBe('Plante à nommer')
    expect(q[0].suggestions).toHaveLength(2)
  })
  it('un choix fait à la main reste, même incertain', () => {
    let q = enqueue([], mk('a'))
    q = chooseSpecies(q, 'a', { speciesId: UNKNOWN_SPECIES_ID, customName: 'Mon cerisier' })
    q = applyResults(q, 'a', sug, { uncertain: true })
    expect(itemName(q[0])).toBe('Mon cerisier')
    expect(canValidate(q[0])).toBe(true)
  })
  it('une nouvelle lecture sûre efface l’incertitude et choisit le meilleur nom', () => {
    let q = enqueue([], mk('a'))
    q = applyResults(q, 'a', sug, { uncertain: true, hint: 'x' })
    q = applyResults(q, 'a', sug)
    expect(q[0].uncertain).toBeUndefined()
    expect(q[0].hint).toBeUndefined()
    expect(q[0].speciesId).toBe('pommier')
  })
  it('lecture sûre depuis IndexedDB : incertain et phrase gardés, valeurs douteuses écartées', () => {
    const raw = [{ ...mk('a'), uncertain: true, hint: 'Probablement du genre Acer' }, { ...mk('b'), uncertain: 'oui', hint: 42 }]
    const q = sanitizeQueue(raw)
    expect(q[0]).toMatchObject({ uncertain: true, hint: 'Probablement du genre Acer' })
    expect(q[1].uncertain).toBeUndefined()
    expect(q[1].hint).toBeUndefined()
  })
})

describe('images regroupées pour une plante (B)', () => {
  const at = (id: string, x: number, y: number, extra: Partial<ReturnType<typeof mk>> = {}) => ({ ...mk(id), position: { x, y }, accuracyM: 3, from: 'video' as const, ...extra })
  const q0: Queue = [at('a', 0, 0), at('b', 1, 0), at('c', 0, 2), at('d', 10, 10), at('e', 0.5, 0.5, { gardenId: 'g2' }), at('f', 1, 1, { status: 'a-valider' })]
  it('prend les images proches, du même jardin, en attente, les plus proches d’abord', () => {
    const c = groupCompanions(q0, q0[0], { now: 0 })
    expect(c.map((i) => i.id)).toEqual(['b', 'c'])
  })
  it('jamais plus de 5 images au total', () => {
    const many: Queue = [at('p', 0, 0), ...Array.from({ length: 9 }, (_, k) => at('n' + k, 0.1 * k, 0))]
    expect(groupCompanions(many, many[0], { now: 0 })).toHaveLength(GROUP_MAX - 1)
  })
  it('respecte le rayon', () => {
    const q: Queue = [at('p', 0, 0), at('in', GROUP_RADIUS_M, 0), at('out', GROUP_RADIUS_M + 0.1, 0)]
    expect(groupCompanions(q, q[0], { now: 0 }).map((i) => i.id)).toEqual(['in'])
  })
  it('sans position connue ou pas issue d’une vidéo : jamais regroupé', () => {
    const q: Queue = [at('p', 0, 0, { accuracyM: 99 }), at('n', 0, 0)]
    expect(groupCompanions(q, q[0], { now: 0 })).toEqual([])
    const photo: Queue = [{ ...at('p', 0, 0), from: undefined }, at('n', 0, 0)]
    expect(groupCompanions(photo, photo[0], { now: 0 })).toEqual([])
    const unknownNeighbour: Queue = [at('p', 0, 0), at('n', 0, 0, { accuracyM: 99 })]
    expect(groupCompanions(unknownNeighbour, unknownNeighbour[0], { now: 0 })).toEqual([])
  })
  it('laisse de côté les images pas encore prêtes (délai, accord manquant, trop d’essais)', () => {
    const q: Queue = [at('p', 0, 0), at('wait', 1, 0, { nextTryAt: 5000 }), at('consent', 1, 0, { why: 'consentement' }), at('tired', 1, 0, { attempts: MAX_ATTEMPTS }), at('ok', 1, 0)]
    expect(groupCompanions(q, q[0], { now: 1000 }).map((i) => i.id)).toEqual(['ok'])
  })
  it('après l’envoi : la première reçoit les noms, les autres sont ignorées et renvoient vers elle', () => {
    const q = applyGroupResults(q0, 'a', ['b', 'c'], sug)
    expect(q.find((i) => i.id === 'a')).toMatchObject({ status: 'a-valider', speciesId: 'pommier' })
    expect(q.find((i) => i.id === 'b')).toMatchObject({ status: 'ignoree', mergedInto: 'a' })
    expect(q.find((i) => i.id === 'c')).toMatchObject({ status: 'ignoree', mergedInto: 'a' })
    expect(q.find((i) => i.id === 'd')?.status).toBe('en-attente')
  })
})

describe('meilleures images d’une même plante (netteté)', () => {
  const at = (id: string, x: number, y: number, sharp?: number) => ({ ...mk(id), position: { x, y }, accuracyM: 3, from: 'video' as const, sharp })
  it('envoie les 4 plus nettes avec la première, pas les 4 premières', () => {
    const q: Queue = [at('p', 0, 0, 100), at('a', 0.1, 0, 500), at('b', 0.2, 0, 90), at('c', 0.3, 0, 400), at('d', 0.4, 0, 80), at('e', 0.5, 0, 300), at('f', 0.6, 0, 200)]
    const { send } = groupPlan(q, q[0], { now: 0 })
    expect(send.map((i) => i.id)).toEqual(['a', 'c', 'e', 'f'])
    expect(send).toHaveLength(GROUP_MAX - 1)
  })
  it('les images en trop très proches sont fusionnées sans partir ; les plus éloignées restent pour leur propre envoi', () => {
    const q: Queue = [at('p', 0, 0, 100), at('a', 0.1, 0, 500), at('b', 0.2, 0, 400), at('c', 0.3, 0, 300), at('d', 0.4, 0, 200), at('close', 0.5, 0, 50), at('far', GROUP_RADIUS_M - 0.1, 0, 40)]
    const { send, merge } = groupPlan(q, q[0], { now: 0 })
    expect(send.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(merge.map((i) => i.id)).toEqual(['close'])
    expect(MERGE_RADIUS_M).toBeLessThan(GROUP_RADIUS_M)
  })
  it('netteté inconnue : passe après les images dont on connaît la netteté', () => {
    const q: Queue = [at('p', 0, 0), at('u', 0.1, 0), at('k', 0.2, 0, 70)]
    expect(groupPlan(q, q[0], { now: 0 }).send.map((i) => i.id)).toEqual(['k', 'u'])
  })
  it('la netteté est gardée par newItem et validée à la lecture', () => {
    expect(newItem({ id: 'x', gardenId: 'g', photoId: 'photo:abcx', position: { x: 0, y: 0 }, accuracyM: 3, sharp: 123.7 }).sharp).toBe(124)
    expect(newItem({ id: 'x', gardenId: 'g', photoId: 'photo:abcx', position: { x: 0, y: 0 }, accuracyM: 3, sharp: Number.NaN }).sharp).toBeUndefined()
    const q = sanitizeQueue([{ ...mk('a'), sharp: 88 }, { ...mk('b'), sharp: 'x' }, { ...mk('c'), sharp: -5 }])
    expect(q.map((i) => i.sharp)).toEqual([88, undefined, undefined])
  })
})
