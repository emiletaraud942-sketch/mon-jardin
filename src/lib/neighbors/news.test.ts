import { describe, expect, it } from 'vitest'
import { unreadByThread } from './logic'
import { badgeAria, badgeLabel, computeNews, forgetVisit, newsLines, readVisit, writeVisit, type MiniStorage } from './news'

const post = (kind: string, createdAt: string, mine = false) => ({ kind: kind as 'don', createdAt, mine })
const SINCE = '2026-10-20T10:00:00.000Z'

describe('calcul des nouveautés', () => {
  const posts = [
    post('don', '2026-10-21T08:00:00Z'),
    post('don', '2026-10-22T08:00:00Z'),
    post('echange', '2026-10-23T08:00:00Z'),
    post('pret', '2026-10-19T08:00:00Z'), // avant la dernière visite
    post('cherche', '2026-10-24T08:00:00Z'),
    post('question', '2026-10-24T09:00:00Z'),
    post('don', '2026-10-24T10:00:00Z', true), // la mienne
  ]
  it('compte par type, sans mes annonces ni les anciennes', () => {
    const n = computeNews(posts, SINCE, 0)
    expect(n.posts).toEqual({ don: 2, echange: 1, pret: 0, cherche: 1, question: 1 })
    expect(n.total).toBe(5)
  })
  it('ajoute les messages non lus', () => {
    const n = computeNews(posts, SINCE, 3)
    expect(n.messages).toBe(3)
    expect(n.total).toBe(8)
  })
  it('première visite : aucune annonce n’est « nouvelle »', () => {
    const n = computeNews(posts, null, 2)
    expect(n.since).toBeNull()
    expect(n.total).toBe(2)
  })
  it('date abîmée : traitée comme une première visite', () => {
    expect(computeNews(posts, 'pas une date', 0).total).toBe(0)
  })
  it('l’heure exacte de la visite n’est pas comptée', () => {
    expect(computeNews([post('don', SINCE)], SINCE, 0).total).toBe(0)
  })
  it('ignore les dates et nombres invalides', () => {
    expect(computeNews([post('don', 'oups')], SINCE, Number.NaN).total).toBe(0)
    expect(computeNews([], SINCE, -4).messages).toBe(0)
  })
})

describe('lignes de nouveautés', () => {
  it('seulement ce qui existe, messages d’abord, avec le bon accord', () => {
    const lines = newsLines(computeNews([post('don', '2026-10-21T08:00:00Z'), post('cherche', '2026-10-22T08:00:00Z'), post('cherche', '2026-10-22T09:00:00Z')], SINCE, 1))
    expect(lines.map((l) => `${l.count} ${l.text}`)).toEqual(['1 message à lire', '1 nouveau don', '2 nouvelles demandes'])
  })
  it('chaque ligne mène au bon écran', () => {
    const lines = newsLines(computeNews([post('pret', '2026-10-21T08:00:00Z'), post('question', '2026-10-21T08:00:00Z'), post('echange', '2026-10-21T08:00:00Z')], SINCE, 2))
    expect(lines.map((l) => l.target)).toEqual([{ section: 'messages' }, { section: 'fil', kind: 'echange' }, { section: 'fil', kind: 'pret' }, { section: 'fil', kind: 'question' }])
  })
  it('aucune ligne quand il n’y a rien', () => {
    expect(newsLines(computeNews([], SINCE, 0))).toEqual([])
  })
  it('phrases courtes', () => {
    const all = newsLines(computeNews(['don', 'echange', 'pret', 'cherche', 'question'].flatMap((k) => [post(k, '2026-10-21T08:00:00Z'), post(k, '2026-10-21T09:00:00Z')]), SINCE, 2))
    for (const l of all) expect(l.text.split(' ').length).toBeLessThan(6)
  })
})

describe('pastille', () => {
  it('plafonne à 99+', () => {
    expect(badgeLabel(0)).toBe('0')
    expect(badgeLabel(7)).toBe('7')
    expect(badgeLabel(99)).toBe('99')
    expect(badgeLabel(100)).toBe('99+')
  })
  it('a un libellé accordé pour les lecteurs d’écran', () => {
    expect(badgeAria(1)).toBe('1 nouveauté dans l’entraide')
    expect(badgeAria(4)).toBe('4 nouveautés dans l’entraide')
    expect(badgeAria(150)).toBe('plus de 99 nouveautés dans l’entraide')
  })
})

function memory(initial: Record<string, string> = {}): MiniStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v), removeItem: (k) => void delete data[k] }
}

describe('date de dernière visite', () => {
  const NOW = new Date('2026-10-25T12:00:00Z')
  it('s’écrit et se relit, par compte', () => {
    const m = memory()
    expect(readVisit('u1', m, NOW)).toBeNull()
    writeVisit('u1', m, NOW)
    expect(readVisit('u1', m, NOW)).toBe('2026-10-25T12:00:00.000Z')
    expect(readVisit('u2', m, NOW)).toBeNull()
    expect(Object.keys(m.data)).toEqual(['permajardin:voisins:visite:u1'])
  })
  it('s’oublie', () => {
    const m = memory()
    writeVisit('u1', m, NOW)
    forgetVisit('u1', m)
    expect(readVisit('u1', m, NOW)).toBeNull()
  })
  it('ignore une valeur abîmée ou dans le futur', () => {
    expect(readVisit('u1', memory({ 'permajardin:voisins:visite:u1': 'abc' }), NOW)).toBeNull()
    expect(readVisit('u1', memory({ 'permajardin:voisins:visite:u1': '2030-01-01T00:00:00Z' }), NOW)).toBeNull()
  })
  it('résiste à une mémoire absente ou qui refuse', () => {
    expect(readVisit('u1', null, NOW)).toBeNull()
    expect(() => writeVisit('u1', null, NOW)).not.toThrow()
    const boom: MiniStorage = {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('plein')
      },
      removeItem: () => {
        throw new Error('bloqué')
      },
    }
    expect(readVisit('u1', boom, NOW)).toBeNull()
    expect(() => writeVisit('u1', boom, NOW)).not.toThrow()
    expect(() => forgetVisit('u1', boom)).not.toThrow()
  })
  it('sans identifiant, rien n’est écrit', () => {
    const m = memory()
    writeVisit('', m, NOW)
    expect(m.data).toEqual({})
  })
})

describe('messages non lus', () => {
  const received = [
    { threadId: 't1', createdAt: '2026-10-24T10:00:00Z' },
    { threadId: 't1', createdAt: '2026-10-24T12:00:00Z' },
    { threadId: 't2', createdAt: '2026-10-23T09:00:00Z' },
  ]
  it('compte ce qui est arrivé après la dernière lecture de chaque conversation', () => {
    expect(unreadByThread(received, { t1: '2026-10-24T11:00:00Z', t2: '2026-10-24T00:00:00Z' })).toEqual({ t1: 1 })
  })
  it('sans date de lecture, tout compte', () => {
    expect(unreadByThread(received, {})).toEqual({ t1: 2, t2: 1 })
  })
  it('tout lu : rien', () => {
    expect(unreadByThread(received, { t1: '2026-10-25T00:00:00Z', t2: '2026-10-25T00:00:00Z' })).toEqual({})
  })
  it('ignore les dates invalides', () => {
    expect(unreadByThread([{ threadId: 't1', createdAt: 'x' }], {})).toEqual({})
    expect(unreadByThread(received, { t1: 'x' })).toEqual({ t1: 2, t2: 1 })
  })
})
