import { describe, expect, it } from 'vitest'
import { frostSentence } from './weatherText'

const NOW = new Date(2026, 10, 2, 8, 0) // lundi 2 novembre 2026
const day = (d: number, tMin: number) => ({ date: `2026-11-${String(d).padStart(2, '0')}`, tMin })

describe('frostSentence', () => {
  it('nomme le jour du gel et la température la plus basse', () => {
    expect(frostSentence([day(2, 6), day(3, 4), day(4, -3), day(5, 2)], NOW)).toBe('Gel prévu mercredi, jusqu’à −3 °C.')
  })
  it('dit « demain » et « cette nuit » plutôt que le jour', () => {
    expect(frostSentence([day(2, -1), day(3, 5)], NOW)).toBe('Gel prévu cette nuit, jusqu’à −1 °C.')
    expect(frostSentence([day(2, 5), day(3, -2)], NOW)).toBe('Gel prévu demain, jusqu’à −2 °C.')
  })
  it('liste plusieurs jours de gel', () => {
    expect(frostSentence([day(2, 5), day(3, 4), day(4, -1), day(5, 3), day(6, -4)], NOW)).toBe('Gel prévu mercredi et vendredi, jusqu’à −4 °C.')
  })
  it('compte 0 °C comme du gel, comme les tuiles de la semaine', () => {
    expect(frostSentence([day(4, 0)], NOW)).toBe('Gel prévu mercredi, jusqu’à 0 °C.')
  })
  it('rien sans gel, ni au-delà de 7 jours, ni dans le passé', () => {
    expect(frostSentence([day(2, 3), day(3, 2)], NOW)).toBeUndefined()
    expect(frostSentence([{ date: '2026-11-12', tMin: -5 }], NOW)).toBeUndefined()
    expect(frostSentence([{ date: '2026-11-01', tMin: -5 }], NOW)).toBeUndefined()
    expect(frostSentence([], NOW)).toBeUndefined()
  })
})
