import { describe, expect, it } from 'vitest'
import { buildIcs, escapeText, foldLine } from './ics'

const plan = [
  { month: 11, tasks: [{ type: 'taille' as const, speciesId: 'pommier', count: 2 }, { type: 'plantation' as const, speciesId: 'ail', count: 1 }] },
  { month: 12, tasks: [] },
  { month: 3, tasks: [{ type: 'semis' as const, speciesId: 'tomate', count: 1 }] },
]
const base = {
  plan,
  now: new Date(2026, 10, 3, 14, 0), // 3 novembre 2026
  gardenName: 'Mon jardin, côté sud',
  typeLabel: (t: string) => ({ taille: 'Taille', plantation: 'Plantation', semis: 'Semis' })[t] ?? t,
  speciesName: (id: string) => ({ pommier: 'Pommier', ail: 'Ail', tomate: 'Tomate' })[id] ?? id,
}

describe('escapeText', () => {
  it('protège virgule, point-virgule, barre oblique et saut de ligne', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne')
  })
})

describe('foldLine', () => {
  it('laisse intacte une ligne courte', () => {
    expect(foldLine('SUMMARY:court')).toBe('SUMMARY:court')
  })
  it('plie à 75 octets au plus sans couper un accent, et se relit à l’identique', () => {
    const long = 'DESCRIPTION:' + 'é'.repeat(100)
    const folded = foldLine(long)
    const enc = new TextEncoder()
    for (const l of folded.split('\r\n')) expect(enc.encode(l).length).toBeLessThanOrEqual(75)
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long)
  })
})

describe('buildIcs', () => {
  const ics = buildIcs({ ...base, week: [{ title: 'Arroser les tomates', reason: 'Peu de pluie' }] })
  const lines = ics.split('\r\n')

  it('est un calendrier valide : CRLF, début, fin, version', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines).toContain('VERSION:2.0')
    expect(lines[lines.length - 2]).toBe('END:VCALENDAR')
    expect(lines[lines.length - 1]).toBe('')
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('crée un rappel par mois non vide, à 9 h, et aucun pour un mois vide', () => {
    const starts = lines.filter((l) => l.startsWith('DTSTART:'))
    // novembre (aujourd'hui, le 3), mars 2027 (le 1er), plus le rappel quotidien (aujourd'hui)
    expect(starts).toEqual(['DTSTART:20261103T090000', 'DTSTART:20270301T090000', 'DTSTART:20261103T090000'])
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3)
  })

  it('met un rappel (VALARM) à l’heure de début dans chaque événement', () => {
    expect(lines.filter((l) => l === 'BEGIN:VALARM')).toHaveLength(3)
    expect(lines.filter((l) => l === 'TRIGGER:PT0S')).toHaveLength(3)
  })

  it('décrit les tâches par espèce, avec le nombre de plantes', () => {
    expect(ics).toContain('DESCRIPTION:Taille : Pommier (2)\\nPlantation : Ail')
    expect(ics).toContain('SUMMARY:Jardin en novembre : 2 tâches')
  })

  it('le rappel quotidien dure 7 jours et liste les tâches de la semaine', () => {
    expect(ics).toContain('RRULE:FREQ=DAILY;COUNT=7')
    expect(ics).toContain('Arroser les tomates (Peu de pluie)')
  })

  it('protège le nom du jardin et garde des identifiants stables', () => {
    expect(ics).toContain('X-WR-CALNAME:PermaJardin : Mon jardin\\, côté sud')
    const uids = lines.filter((l) => l.startsWith('UID:'))
    expect(buildIcs({ ...base, week: [{ title: 'Arroser les tomates', reason: 'Peu de pluie' }] }).split('\r\n').filter((l) => l.startsWith('UID:'))).toEqual(uids)
    expect(new Set(uids).size).toBe(uids.length)
    for (const u of uids) expect(u).toMatch(/^UID:[a-z0-9-]+@permajardin\.app$/)
  })

  it('sans tâches de la semaine, pas de rappel quotidien', () => {
    expect(buildIcs({ ...base })).not.toContain('RRULE')
  })

  it('passe à l’année suivante après décembre', () => {
    const t = buildIcs({ ...base, now: new Date(2026, 11, 20) })
    expect(t).toContain('DTSTART:20270301T090000')
    expect(t).not.toContain('DTSTART:20261101')
  })
})
