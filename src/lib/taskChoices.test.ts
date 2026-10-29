import { describe, expect, it } from 'vitest'
import { activeChoices, choiceEntry, choiceSentence, snoozeUntil } from './taskChoices'

const NOW = new Date(2026, 9, 28, 15, 30) // 28 octobre 2026, 15 h 30

describe('snoozeUntil', () => {
  it('demain, dans une semaine, dans un mois : minuit local du jour choisi', () => {
    expect(new Date(snoozeUntil('demain', NOW)).getTime()).toBe(new Date(2026, 9, 29).getTime())
    expect(new Date(snoozeUntil('semaine', NOW)).getTime()).toBe(new Date(2026, 10, 4).getTime())
    expect(new Date(snoozeUntil('mois', NOW)).getTime()).toBe(new Date(2026, 10, 28).getTime())
  })
  it('passe le mois et l’année correctement', () => {
    const dec = new Date(2026, 11, 20, 9, 0)
    expect(new Date(snoozeUntil('mois', dec)).getTime()).toBe(new Date(2027, 0, 20).getTime())
    expect(new Date(snoozeUntil('semaine', dec)).getTime()).toBe(new Date(2026, 11, 27).getTime())
  })
})

describe('choiceEntry', () => {
  it('« fait » : une entrée ordinaire, sans statut', () => {
    const e = choiceEntry('g1', 'k', 'fait', NOW)
    expect(e).toMatchObject({ gardenId: 'g1', taskKey: 'k' })
    expect(e.status).toBeUndefined()
    expect(e.until).toBeUndefined()
  })
  it('« reporte » : statut et date de retour ; semaine par défaut', () => {
    const e = choiceEntry('g1', 'k', 'reporte', NOW, 'demain')
    expect(e.status).toBe('reporte')
    expect(new Date(e.until!).getTime()).toBe(new Date(2026, 9, 29).getTime())
    expect(new Date(choiceEntry('g1', 'k', 'reporte', NOW).until!).getTime()).toBe(new Date(2026, 10, 4).getTime())
  })
  it('« refuse » : statut sans date', () => {
    const e = choiceEntry('g1', 'k', 'refuse', NOW)
    expect(e.status).toBe('refuse')
    expect(e.until).toBeUndefined()
  })
})

describe('choiceSentence et activeChoices', () => {
  it('phrases courtes', () => {
    expect(choiceSentence({ status: 'refuse' })).toBe('Ne sera plus proposée.')
    expect(choiceSentence({ status: 'reporte', until: new Date(2026, 10, 5).toISOString() }, NOW)).toBe('Revient le 5 novembre.')
    expect(choiceSentence({ status: 'reporte', until: 'n’importe quoi' }, NOW)).toBe('Reportée.')
    expect(choiceSentence({ status: 'reporte', until: new Date(2027, 0, 5).toISOString() }, NOW)).toBe('Revient le 5 janvier 2027.')
  })
  it('liste les refus et les reports encore actifs, du plus récent au plus ancien, pour ce jardin', () => {
    const mk = (id: string, extra: object) => ({ id, gardenId: 'g1', taskKey: id, doneAt: `2026-10-${id.padStart(2, '0')}T10:00:00.000Z`, ...extra })
    const list = [
      mk('10', { status: 'refuse' }),
      mk('20', { status: 'reporte', until: new Date(2026, 10, 5).toISOString() }),
      mk('21', { status: 'reporte', until: new Date(2026, 9, 1).toISOString() }), // déjà revenu
      mk('22', {}), // faite
      { ...mk('23', { status: 'refuse' }), gardenId: 'autre' },
    ]
    expect(activeChoices(list, 'g1', NOW).map((t) => t.id)).toEqual(['20', '10'])
  })
})
