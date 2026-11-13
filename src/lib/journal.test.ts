import { describe, expect, it } from 'vitest'
import type { PhotoMeta } from '../types'
import { agoText, cleanNote, defaultPair, durationText, isDay, journalEntries, JOURNAL_NOTE_MAX, pruneMeta, sanitizePhotoMeta, spanText, withPhotoMeta } from './journal'
import { cleanLine } from './security/sanitize'
import { migrateState, serializeState, STATE_VERSION } from './migrate'
import { FEATURES } from './features'

const A = 'photo:aaa'
const B = 'photo:bbb'
const C = 'photo:ccc'

describe('jours', () => {
  it('accepte un vrai jour et refuse le reste', () => {
    expect(isDay('2026-02-28')).toBe(true)
    expect(isDay('2024-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '26-01-01', '2026-02-28T10:00:00', '', 5, null, undefined, '1800-01-01']) expect(isDay(bad), String(bad)).toBe(false)
  })
})

describe('notes', () => {
  it('une ligne, sans caractères de commande ni de sens d’écriture, 140 au plus', () => {
    expect(cleanNote('  Première\nfleur\t!  ')).toBe('Première fleur !')
    expect(cleanNote('a\u0000b‮c⁦d​e')).toBe('abcde')
    expect(cleanNote('x'.repeat(300))).toHaveLength(JOURNAL_NOTE_MAX)
    expect(cleanNote('   \n ')).toBe('')
  })
  it('ne coupe pas un émoji en deux', () => {
    const t = 'a'.repeat(JOURNAL_NOTE_MAX - 1) + '🌸'
    const out = cleanNote(t)
    expect(out).toBe('a'.repeat(JOURNAL_NOTE_MAX - 1))
  })
  it('cleanLine garde l’espace et l’émoji composé (liaison U+200D)', () => {
    expect(cleanLine('👩‍🌾 au travail', 50)).toBe('👩‍🌾 au travail')
  })
})

describe('sanitizePhotoMeta', () => {
  it('garde une date et une note valides', () => {
    const r = sanitizePhotoMeta({ [A]: { at: '2026-03-04', note: 'Taille faite' } }, [A])
    expect(r.meta).toEqual({ [A]: { at: '2026-03-04', note: 'Taille faite' } })
    expect(r.dropped).toBe(0)
  })
  it('retire une date invalide mais garde la note ; sans date ni note, l’entrée disparaît', () => {
    const r = sanitizePhotoMeta({ [A]: { at: '2026-02-30', note: 'ok' }, [B]: { at: 'hier' }, [C]: {} }, [A, B, C])
    expect(r.meta).toEqual({ [A]: { note: 'ok' } })
    expect(r.dropped).toBeGreaterThanOrEqual(2)
  })
  it('ramène une date-heure au jour', () => {
    expect(sanitizePhotoMeta({ [A]: { at: '2026-03-04T10:20:00.000Z' } }, [A]).meta).toEqual({ [A]: { at: '2026-03-04' } })
  })
  it('coupe les notes trop longues et nettoie les caractères de commande', () => {
    const r = sanitizePhotoMeta({ [A]: { at: '2026-03-04', note: 'x'.repeat(500) }, [B]: { note: 'a\u0000‮b\nc' } }, [A, B])
    expect(r.meta![A].note).toHaveLength(JOURNAL_NOTE_MAX)
    expect(r.meta![B].note).toBe('ab c')
    expect(r.dropped).toBeGreaterThan(0)
  })
  it('supprime les clés orphelines (photo absente de la plante) et les clés qui ne sont pas des photos', () => {
    const r = sanitizePhotoMeta({ [A]: { at: '2026-03-04' }, 'photo:orpheline': { at: '2026-03-05' }, __proto__x: { at: '2026-03-05' }, 'autre-cle': { at: '2026-03-05' } }, [A])
    expect(Object.keys(r.meta!)).toEqual([A])
    expect(r.dropped).toBe(3)
  })
  it('refuse tout ce qui n’est pas un objet, sans lever d’erreur', () => {
    for (const bad of ['x', 5, [], [A], true]) {
      const r = sanitizePhotoMeta(bad, [A])
      expect(r.meta, JSON.stringify(bad)).toBeUndefined()
      expect(r.dropped).toBe(1)
    }
    expect(sanitizePhotoMeta(undefined, [A])).toEqual({ dropped: 0 })
    expect(sanitizePhotoMeta(null, [A])).toEqual({ dropped: 0 })
  })
  it('écarte les entrées non conformes (nombre, tableau, mauvais types)', () => {
    const r = sanitizePhotoMeta({ [A]: 5, [B]: ['2026-03-04'], [C]: { at: 20260304, note: 12 } }, [A, B, C])
    expect(r.meta).toBeUndefined()
    expect(r.dropped).toBeGreaterThanOrEqual(3)
  })
  it('la taille est bornée par les photos de la plante', () => {
    const photos = Array.from({ length: 20 }, (_, i) => `photo:p${i}`)
    const raw = Object.fromEntries([...photos, ...Array.from({ length: 500 }, (_, i) => `photo:x${i}`)].map((id) => [id, { at: '2026-03-04' }]))
    expect(Object.keys(sanitizePhotoMeta(raw, photos).meta!)).toHaveLength(20)
  })
  it('un prototype pollué ne passe pas', () => {
    const raw = JSON.parse('{"__proto__":{"at":"2026-03-04"},"photo:aaa":{"at":"2026-03-04","__proto__":{"x":1}}}')
    const r = sanitizePhotoMeta(raw, [A])
    expect(Object.keys(r.meta!)).toEqual([A])
    expect(({} as Record<string, unknown>).x).toBeUndefined()
    expect(Object.keys(r.meta![A])).toEqual(['at'])
  })
})

describe('migrateState et le journal', () => {
  const garden = { id: 'g1', name: 'Jardin', address: 'Lyon', center: { lon: 4.83, lat: 45.76 }, createdAt: '2025-01-01T00:00:00.000Z' }
  const plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2024-03-10', status: 'en-place', photos: [A, B] }
  const load = (p: unknown) => {
    const r = migrateState({ gardens: [garden], plants: [p] })
    if (!r.ok) throw new Error(r.error)
    return r
  }

  it('un ancien état sans journal se charge sans erreur ni message, et la version ne change pas', () => {
    const r = load(plant)
    expect(r.warnings).toEqual([])
    expect(r.data.plants[0].photoMeta).toBeUndefined()
    expect('photoMeta' in r.data.plants[0]).toBe(false)
    expect(STATE_VERSION).toBe(2)
  })
  it('garde le journal valide et le dit si on a dû corriger', () => {
    const r = load({ ...plant, photoMeta: { [A]: { at: '2026-03-04', note: 'Bien' }, 'photo:zzz': { at: '2026-03-04' }, [B]: { at: '2026-99-99' } } })
    expect(r.data.plants[0].photoMeta).toEqual({ [A]: { at: '2026-03-04', note: 'Bien' } })
    expect(r.warnings.join(' ')).toMatch(/dates ou notes de photos/)
  })
  it('une photo à l’identifiant invalide emporte son entrée', () => {
    const r = load({ ...plant, photos: [A, 'pas-une-photo'], photoMeta: { [A]: { at: '2026-03-04' }, 'pas-une-photo': { at: '2026-03-04' } } })
    expect(Object.keys(r.data.plants[0].photoMeta!)).toEqual([A])
  })
  it('un journal qui n’est pas un objet est retiré sans casser la plante', () => {
    const r = load({ ...plant, photoMeta: 'oops' })
    expect(r.data.plants).toHaveLength(1)
    expect(r.data.plants[0].photoMeta).toBeUndefined()
  })
  it('l’export garde dates et notes (jamais d’image) et se relit à l’identique', () => {
    const meta = { [A]: { at: '2026-03-04', note: 'Bien' } }
    const first = load({ ...plant, photoMeta: meta })
    const out = serializeState(first.data)
    expect(JSON.stringify(out)).toContain('"note":"Bien"')
    const again = migrateState(JSON.parse(JSON.stringify(out)))
    expect(again.ok && again.data.plants[0].photoMeta).toEqual(meta)
    expect(again.ok && again.warnings).toEqual([])
  })
})

describe('tri de la frise', () => {
  const meta: Record<string, PhotoMeta> = { [A]: { at: '2026-03-01' }, [B]: { at: '2026-06-01', note: 'Fleurs' }, [C]: { at: '2026-03-01' } }

  it('les plus récentes d’abord, à date égale l’ordre d’origine', () => {
    expect(journalEntries([A, B, C], meta).map((e) => e.id)).toEqual([B, A, C])
    expect(journalEntries([C, B, A], meta).map((e) => e.id)).toEqual([B, C, A])
  })
  it('les photos sans date sont à la fin, dans leur ordre', () => {
    const e = journalEntries(['photo:x', A, 'photo:y', B], meta)
    expect(e.map((x) => x.id)).toEqual([B, A, 'photo:x', 'photo:y'])
    expect(e[2].at).toBeUndefined()
  })
  it('une note sans date reste « date inconnue » : jamais de date inventée', () => {
    const e = journalEntries([A, B], { [A]: { note: 'vieille photo' }, [B]: { at: '2026-01-01' } })
    expect(e[1]).toEqual({ id: A, note: 'vieille photo' })
  })
  it('sans journal du tout, tout est « date inconnue » dans l’ordre', () => {
    expect(journalEntries([A, B])).toEqual([{ id: A }, { id: B }])
    expect(journalEntries([])).toEqual([])
  })
  it('le tri ne modifie pas les données reçues', () => {
    const photos = [A, B, C]
    journalEntries(photos, meta)
    expect(photos).toEqual([A, B, C])
  })
})

describe('photos à comparer par défaut', () => {
  it('la plus ancienne et la plus récente datées', () => {
    const e = journalEntries([A, B, C], { [A]: { at: '2026-03-01' }, [B]: { at: '2026-06-01' }, [C]: { at: '2025-12-01' } })
    expect(defaultPair(e)).toEqual({ before: C, after: B })
  })
  it('moins de deux dates : la dernière de la liste (souvent la plus vieille) et la première', () => {
    const e = journalEntries([A, B], { [B]: { at: '2026-06-01' } })
    expect(defaultPair(e)).toEqual({ before: A, after: B })
  })
  it('rien à comparer avec une seule photo', () => {
    expect(defaultPair(journalEntries([A]))).toBeUndefined()
    expect(defaultPair([])).toBeUndefined()
  })
})

describe('durées en français', () => {
  const ago = (d: string, today: string) => agoText(d, today)
  it('aujourd’hui, hier, jours, semaines', () => {
    expect(ago('2026-11-09', '2026-11-09')).toBe('aujourd’hui')
    expect(ago('2026-11-08', '2026-11-09')).toBe('hier')
    expect(ago('2026-11-07', '2026-11-09')).toBe('il y a 2 jours')
    expect(ago('2026-10-26', '2026-11-09')).toBe('il y a 2 semaines')
    expect(ago('2026-10-13', '2026-11-09')).toBe('il y a 3 semaines')
  })
  it('mois civils', () => {
    expect(ago('2026-10-09', '2026-11-09')).toBe('il y a 1 mois')
    expect(ago('2026-10-10', '2026-11-09')).toBe('il y a 4 semaines')
    expect(ago('2026-03-09', '2026-11-09')).toBe('il y a 8 mois')
    expect(ago('2025-11-10', '2026-11-09')).toBe('il y a 11 mois')
  })
  it('années, avec les mois qui restent', () => {
    expect(ago('2025-11-09', '2026-11-09')).toBe('il y a 1 an')
    expect(ago('2025-09-09', '2026-11-09')).toBe('il y a 1 an et 2 mois')
    expect(ago('2023-11-09', '2026-11-09')).toBe('il y a 3 ans')
  })
  it('fins de mois : du 31 janvier au 28 février, pas encore un mois', () => {
    expect(durationText('2026-01-31', '2026-02-28')).toBe('4 semaines')
    expect(durationText('2026-01-31', '2026-03-01')).toBe('1 mois')
  })
  it('ne dit rien d’une date inconnue, invalide ou à venir', () => {
    expect(agoText(undefined, '2026-11-09')).toBe('')
    expect(agoText('2026-02-30', '2026-11-09')).toBe('')
    expect(agoText('2027-01-01', '2026-11-09')).toBe('')
  })
  it('l’écart entre deux photos, dans les deux sens', () => {
    expect(spanText('2026-03-09', '2026-11-09')).toBe('8 mois entre les deux photos.')
    expect(spanText('2026-11-09', '2026-03-09')).toBe('8 mois entre les deux photos.')
    expect(spanText('2026-03-09', '2026-03-09')).toBe('Les deux photos datent du même jour.')
    expect(spanText(undefined, '2026-03-09')).toBe('')
  })
})

describe('modifier le journal', () => {
  it('pose une date et une note, nettoie la note', () => {
    expect(withPhotoMeta(undefined, A, { at: '2026-03-04', note: ' Bien\n' })).toEqual({ [A]: { at: '2026-03-04', note: 'Bien' } })
  })
  it('ne touche pas ce qui n’est pas demandé ; null efface', () => {
    const m = { [A]: { at: '2026-03-04', note: 'Bien' } }
    expect(withPhotoMeta(m, A, { note: 'Autre' })).toEqual({ [A]: { at: '2026-03-04', note: 'Autre' } })
    expect(withPhotoMeta(m, A, { at: null })).toEqual({ [A]: { note: 'Bien' } })
    expect(withPhotoMeta(m, A, { note: '' })).toEqual({ [A]: { at: '2026-03-04' } })
    expect(m).toEqual({ [A]: { at: '2026-03-04', note: 'Bien' } })
  })
  it('refuse une date impossible et rend undefined quand le journal est vide', () => {
    expect(withPhotoMeta(undefined, A, { at: '2026-02-30' })).toBeUndefined()
    expect(withPhotoMeta({ [A]: { at: '2026-03-04' } }, A, { at: null })).toBeUndefined()
  })
  it('pruneMeta retire les entrées sans photo', () => {
    const m = { [A]: { at: '2026-03-04' }, [B]: { at: '2026-03-05' } }
    expect(pruneMeta(m, [A])).toEqual({ [A]: { at: '2026-03-04' } })
    expect(pruneMeta(m, [])).toBeUndefined()
    expect(pruneMeta(undefined, [A])).toBeUndefined()
  })
})

describe('registre', () => {
  it('journal-jardin existe et le registre compte 85 fonctions', () => {
    const f = FEATURES.find((x) => x.id === 'journal-jardin')!
    expect(f).toBeTruthy()
    expect(f.cible).toBe('journal')
    expect(f.rubrique).toBe('plantes')
    expect(f.motsCles).toEqual(expect.arrayContaining(['journal', 'photo', 'avant', 'après', 'croissance', 'évolution']))
    expect(FEATURES).toHaveLength(85)
  })
})
