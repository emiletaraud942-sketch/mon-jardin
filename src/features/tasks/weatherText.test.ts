import { describe, expect, it } from 'vitest'
import { dayTemps, degrees, frostSentence, TEMP_LEGEND, TEMP_WORD } from './weatherText'

const NOW = new Date(2026, 10, 2, 8, 0) // lundi 2 novembre 2026
const day = (d: number, tMin: number) => ({ date: `2026-11-${String(d).padStart(2, '0')}`, tMin })

describe('frostSentence', () => {
  it('nomme le jour du gel et la température la plus basse', () => {
    expect(frostSentence([day(2, 6), day(3, 4), day(4, -3), day(5, 2)], NOW)).toBe('Gel prévu mercredi, jusqu’à −3 °C la nuit.')
  })
  it('dit « demain » et « cette nuit » plutôt que le jour', () => {
    expect(frostSentence([day(2, -1), day(3, 5)], NOW)).toBe('Gel prévu cette nuit, jusqu’à −1 °C.')
    expect(frostSentence([day(2, 5), day(3, -2)], NOW)).toBe('Gel prévu demain, jusqu’à −2 °C la nuit.')
  })
  it('liste plusieurs jours de gel', () => {
    expect(frostSentence([day(2, 5), day(3, 4), day(4, -1), day(5, 3), day(6, -4)], NOW)).toBe('Gel prévu mercredi et vendredi, jusqu’à −4 °C la nuit.')
  })
  it('compte 0 °C comme du gel, comme les tuiles de la semaine', () => {
    expect(frostSentence([day(4, 0)], NOW)).toBe('Gel prévu mercredi, jusqu’à 0 °C la nuit.')
  })
  it('rien sans gel, ni au-delà de 7 jours, ni dans le passé', () => {
    expect(frostSentence([day(2, 3), day(3, 2)], NOW)).toBeUndefined()
    expect(frostSentence([{ date: '2026-11-12', tMin: -5 }], NOW)).toBeUndefined()
    expect(frostSentence([{ date: '2026-11-01', tMin: -5 }], NOW)).toBeUndefined()
    expect(frostSentence([], NOW)).toBeUndefined()
  })
})

describe('dayTemps : jamais une température sans son mot', () => {
  it('donne les deux valeurs, arrondies, avec un vrai signe moins', () => {
    const t = dayTemps({ tMin: 2.6, tMax: 13.5 })
    expect(t).toMatchObject({ jour: '14°', nuit: '3°', frost: false })
    expect(t.text).toBe('le jour 14 °C, la nuit 3 °C')
    expect(t.spoken).toBe('le jour 14 degrés, la nuit 3 degrés')
  })
  it('gel à 0 °C ou moins la nuit : il est dit, et la valeur du jour reste affichée', () => {
    const t = dayTemps({ tMin: -3.2, tMax: 6 })
    expect(t).toMatchObject({ jour: '6°', nuit: '−3°', frost: true })
    expect(t.text).toBe('le jour 6 °C, la nuit −3 °C (gel)')
    expect(t.spoken).toBe('le jour 6 degrés, la nuit −3 degrés, gel')
    expect(dayTemps({ tMin: 0, tMax: 4 }).frost).toBe(true)
    expect(dayTemps({ tMin: 0.4, tMax: 4 })).toMatchObject({ nuit: '0°', frost: false })
  })
  it('jamais de « −0 »', () => {
    expect(degrees(-0.4)).toBe('0')
    expect(degrees(-12)).toBe('−12')
  })
  it('les mots sont « Jour » et « Nuit », expliqués en une phrase courte chacun', () => {
    expect(TEMP_WORD).toEqual({ jour: 'Jour', nuit: 'Nuit' })
    for (const phrase of TEMP_LEGEND.split('. ')) expect(phrase.split(/\s+/).length).toBeLessThanOrEqual(20)
  })
})
