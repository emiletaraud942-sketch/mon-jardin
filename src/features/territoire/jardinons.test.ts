import { describe, expect, it } from 'vitest'
import { AGENDA_PATH, jardinonsUrl, MAX_EVENTS, nextSlot, parseJardinons, safeEventUrl } from './jardinons'

const now = new Date('2026-11-16T10:00:00Z')
const rec = (over: Record<string, unknown> = {}) => ({
  uid: '1',
  title_fr: 'Jardinons ! Un apéro sain',
  canonicalurl: 'https://openagenda.com/rouen-normandie-metropole/events/x',
  daterange_fr: 'Mercredi 18 novembre, 18h00',
  timings: JSON.stringify([{ begin: '2026-11-18T18:00:00+01:00', end: '2026-11-18T21:00:00+01:00' }]),
  location_city: 'Rouen',
  location_name: 'Métropole Rouen Normandie',
  description_fr: 'Atelier cuisine',
  conditions_fr: 'Sur inscription',
  ...over,
})

describe('événements Jardinons !', () => {
  it('lit une réponse de l’agenda', () => {
    const [e] = parseJardinons({ results: [rec()] }, now)
    expect(e.title).toBe('Un apéro sain')
    expect(e.when).toBe('Mercredi 18 novembre, 18h00')
    expect(e.place).toBe('Métropole Rouen Normandie, Rouen')
    expect(e.startsAt).toBe('2026-11-18T17:00:00.000Z')
    expect(e.url).toBe('https://openagenda.com/rouen-normandie-metropole/events/x')
  })
  it('garde la prochaine séance et saute celles qui sont finies', () => {
    const timings = JSON.stringify([
      { begin: '2026-11-10T18:00:00+01:00', end: '2026-11-10T20:00:00+01:00' },
      { begin: '2026-11-25T18:00:00+01:00', end: '2026-11-25T20:00:00+01:00' },
      { begin: '2026-11-20T18:00:00+01:00', end: '2026-11-20T20:00:00+01:00' },
    ])
    expect(nextSlot(timings, null, null, now)?.begin).toBe('2026-11-20T18:00:00+01:00')
    expect(parseJardinons({ results: [rec({ timings })] }, now)[0].startsAt).toBe('2026-11-20T17:00:00.000Z')
  })
  it('retombe sur les dates globales sans séances lisibles', () => {
    const e = parseJardinons({ results: [rec({ timings: 'pas du json', lastdate_begin: '2026-12-01T17:00:00+00:00', lastdate_end: '2026-12-01T19:00:00+00:00' })] }, now)
    expect(e[0].startsAt).toBe('2026-12-01T17:00:00.000Z')
  })
  it('écarte les événements finis, sans « Jardinons », sans identifiant, et trie par date', () => {
    const fini = rec({ uid: '2', timings: JSON.stringify([{ begin: '2026-11-01T18:00:00+01:00', end: '2026-11-01T20:00:00+01:00' }]) })
    const autre = rec({ uid: '3', title_fr: 'Concert', description_fr: 'musique' })
    const sansId = rec({ uid: '' })
    const tard = rec({ uid: '4', timings: JSON.stringify([{ begin: '2026-12-20T18:00:00+01:00', end: '2026-12-20T20:00:00+01:00' }]) })
    const tot = rec({ uid: '5' })
    expect(parseJardinons({ results: [fini, autre, sansId, tard, tot] }, now).map((e) => e.id)).toEqual(['5', '4'])
  })
  it('nettoie les textes : pas de balise, pas de caractère de contrôle', () => {
    const [e] = parseJardinons({ results: [rec({ description_fr: '<b>Atelier</b>&nbsp;cuisine<script>x</script>\u0007', conditions_fr: 'a‮b' })] }, now)
    expect(e.description).not.toMatch(/[<>\u0007]/)
    expect(e.description).toContain('Atelier cuisine')
    expect(e.conditions).not.toContain('‮')
  })
  it('n’accepte qu’un lien https vers openagenda.com', () => {
    expect(safeEventUrl('https://openagenda.com/a')).toBeDefined()
    expect(safeEventUrl('http://openagenda.com/a')).toBeUndefined()
    expect(safeEventUrl('https://openagenda.com.evil.fr/a')).toBeUndefined()
    expect(safeEventUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeEventUrl(42)).toBeUndefined()
  })
  it('supporte une réponse vide ou inattendue', () => {
    for (const j of [null, {}, { results: 'x' }, { results: [null, 3, 'a'] }]) expect(parseJardinons(j, now)).toEqual([])
  })
  it('plafonne la liste', () => {
    const many = Array.from({ length: 40 }, (_, i) => rec({ uid: String(i + 1) }))
    expect(parseJardinons({ results: many }, now)).toHaveLength(MAX_EVENTS)
  })
  it('la demande passe par notre proxy et ne contient rien de personnel', () => {
    const u = jardinonsUrl()
    expect(u.startsWith(AGENDA_PATH + '?')).toBe(true)
    expect(u).toContain('jardinons')
    expect(u).not.toMatch(/lat|lon|adresse/i)
  })
})
