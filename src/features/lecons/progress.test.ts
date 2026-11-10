import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LECONS } from '../../data/lecons'
import { LECON_OUTLINE } from './outline'
import {
  LESSONS_KEY,
  countDone,
  doneSentence,
  isDone,
  markDone,
  nextLesson,
  parseDone,
  percentDone,
  readDone,
  resetProgress,
  sanitizeDone,
  subscribeDone,
  totalLessons,
  unmarkDone,
} from './progress'

function fakeStorage(initial?: Record<string, string>) {
  const m = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
  resetProgress()
})
afterEach(() => {
  resetProgress()
  vi.unstubAllGlobals()
})

describe('plan léger des leçons', () => {
  it('suit exactement les leçons (id, rang, titre, même ordre)', () => {
    expect(LECON_OUTLINE.map((l) => ({ id: l.id, ordre: l.ordre, titre: l.titre }))).toEqual(LECONS.map((l) => ({ id: l.id, ordre: l.ordre, titre: l.titre })))
    expect(totalLessons()).toBe(LECONS.length)
  })
})

describe('lecture validée', () => {
  it('ne garde que les identifiants connus, sans doublon, dans l’ordre du parcours', () => {
    expect(sanitizeDone(['eau-jardin', 'inconnue', 'observer-jardin', 'eau-jardin', 42, null, '__proto__'])).toEqual(['observer-jardin', 'eau-jardin'])
  })
  it('un tableau trop long est borné, une autre forme est ignorée', () => {
    const long = Array.from({ length: 5000 }, (_, i) => `x${i}`)
    expect(sanitizeDone([...long, 'observer-jardin'])).toEqual([])
    expect(sanitizeDone('observer-jardin')).toEqual([])
    expect(sanitizeDone({ 0: 'observer-jardin' })).toEqual([])
    expect(sanitizeDone(null)).toEqual([])
  })
  it('JSON corrompu, vide ou énorme : aucune leçon terminée', () => {
    expect(parseDone('{pas du json')).toEqual([])
    expect(parseDone('')).toEqual([])
    expect(parseDone(null)).toEqual([])
    expect(parseDone('"x"'.repeat(3000))).toEqual([])
    expect(parseDone('["connaitre-sol","zzz"]')).toEqual(['connaitre-sol'])
  })
  it('readDone lit la clé pj.lessons et corrige ce qui n’est pas valide', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [LESSONS_KEY]: '["climat-gelees","faux-id","observer-jardin"]' }))
    expect(readDone()).toEqual(['observer-jardin', 'climat-gelees'])
    vi.stubGlobal('localStorage', fakeStorage({ [LESSONS_KEY]: 'n’importe quoi' }))
    expect(readDone()).toEqual([])
  })
  it('renvoie le même tableau tant que rien ne change', () => {
    markDone('observer-jardin')
    expect(readDone()).toBe(readDone())
  })
})

describe('marquer, rouvrir, effacer', () => {
  it('markDone écrit une liste d’identifiants dans pj.lessons, rien d’autre', () => {
    expect(markDone('connaitre-sol')).toEqual(['connaitre-sol'])
    markDone('observer-jardin')
    markDone('observer-jardin')
    const raw = (localStorage as unknown as ReturnType<typeof fakeStorage>).map
    expect([...raw.keys()]).toEqual([LESSONS_KEY])
    expect(JSON.parse(raw.get(LESSONS_KEY)!)).toEqual(['observer-jardin', 'connaitre-sol'])
  })
  it('un identifiant inconnu n’écrit rien', () => {
    markDone('nimporte-quoi')
    expect(readDone()).toEqual([])
    expect((localStorage as unknown as ReturnType<typeof fakeStorage>).map.size).toBe(0)
  })
  it('unmarkDone (« Rouvrir ») retire la coche ; la dernière retire la clé', () => {
    markDone('observer-jardin')
    markDone('connaitre-sol')
    expect(unmarkDone('observer-jardin')).toEqual(['connaitre-sol'])
    unmarkDone('connaitre-sol')
    expect((localStorage as unknown as ReturnType<typeof fakeStorage>).map.has(LESSONS_KEY)).toBe(false)
  })
  it('resetProgress efface tout le suivi', () => {
    markDone('observer-jardin')
    resetProgress()
    expect(readDone()).toEqual([])
    expect(isDone(readDone(), 'observer-jardin')).toBe(false)
  })
  it('les abonnés sont prévenus à chaque changement, puis plus après désabonnement', () => {
    const l = vi.fn()
    const off = subscribeDone(l)
    markDone('observer-jardin')
    unmarkDone('observer-jardin')
    expect(l).toHaveBeenCalledTimes(2)
    off()
    markDone('observer-jardin')
    expect(l).toHaveBeenCalledTimes(2)
  })
})

describe('comptes, pourcentage, prochaine leçon', () => {
  const ids = LECON_OUTLINE.map((l) => l.id)
  it('countDone ignore les identifiants inconnus', () => {
    expect(countDone([])).toBe(0)
    expect(countDone(['observer-jardin', 'zzz'])).toBe(1)
  })
  it('percentDone : 0, une part, 100', () => {
    expect(percentDone([])).toBe(0)
    expect(percentDone(ids.slice(0, 7))).toBe(50)
    expect(percentDone(ids.slice(0, 5))).toBe(36)
    expect(percentDone(ids)).toBe(100)
  })
  it('nextLesson : la première non terminée, dans l’ordre (même si les suivantes sont faites)', () => {
    expect(nextLesson([])?.id).toBe(ids[0])
    expect(nextLesson([ids[0], ids[1]])?.id).toBe(ids[2])
    expect(nextLesson([ids[1], ids[2]])?.id).toBe(ids[0])
    expect(nextLesson(ids)).toBeUndefined()
  })
  it('doneSentence : des mots simples, singulier et pluriel', () => {
    expect(doneSentence([])).toBe(`Aucune leçon terminée sur ${ids.length}`)
    expect(doneSentence(ids.slice(0, 1))).toBe(`1 leçon sur ${ids.length}`)
    expect(doneSentence(ids.slice(0, 5))).toBe(`5 leçons sur ${ids.length}`)
  })
})

describe('sans localStorage', () => {
  it('lecture et écriture ne lèvent rien ; le suivi vaut pour la session', () => {
    const boom = () => {
      throw new Error('SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom })
    expect(readDone()).toEqual([])
    expect(markDone('observer-jardin')).toEqual(['observer-jardin'])
    expect(readDone()).toEqual(['observer-jardin'])
    expect(unmarkDone('observer-jardin')).toEqual([])
    expect(() => resetProgress()).not.toThrow()
  })
  it('localStorage absent (undefined) : même résultat', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readDone()).toEqual([])
    expect(markDone('connaitre-sol')).toEqual(['connaitre-sol'])
    expect(readDone()).toEqual(['connaitre-sol'])
  })
  it('écriture refusée (stockage plein) : la lecture reste juste', () => {
    const s = fakeStorage()
    s.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    vi.stubGlobal('localStorage', s)
    markDone('observer-jardin')
    expect(readDone()).toEqual(['observer-jardin'])
  })
})
