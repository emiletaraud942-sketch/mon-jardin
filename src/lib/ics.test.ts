import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import type { Plant } from '../types'
import { buildIcs, icsEscape, icsFold } from './ics'

const plant = (id: string, speciesId: string, status: Plant['status'] = 'en-place'): Plant => ({
  id, gardenId: 'g1', speciesId, position: { x: 0, y: 0 }, plantedAt: '2024-03-01', status, photos: [],
})
const NOW = new Date(Date.UTC(2026, 9, 27, 12, 0, 0))

describe('icsEscape / icsFold', () => {
  it('échappe virgule, point-virgule, antislash et retour à la ligne', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
  })
  it('coupe à 75 octets, sans couper un caractère multi-octets', () => {
    const long = 'é'.repeat(100)
    const folded = icsFold(`SUMMARY:${long}`)
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${long}`)
  })
  it('laisse une ligne courte intacte', () => {
    expect(icsFold('SUMMARY:court')).toBe('SUMMARY:court')
  })
})

describe('buildIcs', () => {
  const ics = buildIcs([plant('p1', 'pommier'), plant('p2', 'pommier'), plant('p3', 'tomate', 'projet')], SPECIES_BY_ID, { gardenName: 'Mon jardin; test', year: 2026, now: NOW })
  const events = ics.split('BEGIN:VEVENT').slice(1)

  it('est un calendrier valide, en CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toMatch(/[^\r]\n/)
    expect(ics).toContain('X-WR-CALNAME:Jardin : Mon jardin\; test')
  })
  it('crée des événements « journée entière » répétés chaque année', () => {
    expect(events.length).toBeGreaterThan(3)
    for (const e of events) {
      expect(e).toMatch(/DTSTART;VALUE=DATE:2026\d{4}/)
      expect(e).toMatch(/DTEND;VALUE=DATE:\d{8}/)
      expect(e).toContain('RRULE:FREQ=YEARLY')
      expect(e).toMatch(/UID:[a-z]+-[a-z-]+-m\d+@permajardin\.local/)
    }
  })
  it('nomme la tâche et la plante, avec le nombre de plantes', () => {
    expect(ics).toMatch(/SUMMARY:Taille : Pommier \(2\)/)
  })
  it('une fenêtre qui chevauche l’année finit l’année suivante (décembre à mars)', () => {
    const taille = events.find((e) => /SUMMARY:Taille : Pommier/.test(e) && /m12@/.test(e))
    expect(taille).toBeDefined()
    expect(taille).toContain('DTSTART;VALUE=DATE:20261201')
    expect(taille).toMatch(/DTEND;VALUE=DATE:20270401/)
  })
  it('ignore les plantes mortes et les espèces inconnues, et reste valide sans plante', () => {
    const vide = buildIcs([plant('p9', 'pommier', 'mort'), plant('p8', 'inconnue')], SPECIES_BY_ID, { gardenName: 'Vide', year: 2026, now: NOW })
    expect(vide).not.toContain('BEGIN:VEVENT')
    expect(vide).toContain('END:VCALENDAR')
  })
  it('ne contient aucune adresse, coordonnée ni identifiant de plante', () => {
    expect(ics).not.toMatch(/\bp1\b|\bg1\b|GEO:|LOCATION:/)
  })
})
