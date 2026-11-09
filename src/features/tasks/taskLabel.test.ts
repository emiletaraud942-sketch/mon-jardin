import { describe, expect, it } from 'vitest'
import { doneTaskLabel } from './taskLabel'

const names: Record<string, string> = { pommier: 'pommier', tomate: 'Tomate' }
const lookup = (id: string) => names[id]

describe('doneTaskLabel', () => {
  it('espèce et type', () => {
    expect(doneTaskLabel('2026-W41:pommier:arrosage:0', lookup)).toBe('Arrosage · Pommier')
    expect(doneTaskLabel('2026:tomate:recolte:3', lookup)).toBe('Récolte · Tomate')
  })
  it('arrosage météo du jardin', () => {
    expect(doneTaskLabel('2026-10-18:jardin:arrosage:meteo', lookup)).toBe('Arrosage (météo)')
  })
  it('protection contre le gel', () => {
    expect(doneTaskLabel('2026-10-19:jardin:protection:gel', lookup)).toBe('Protection gel')
    expect(doneTaskLabel('2026-07-15:jardin:protection:canicule', lookup)).toBe('Protection canicule')
    expect(doneTaskLabel('2026-07-15:jardin:arrosage:secheresse', lookup)).toBe('Arrosage sécheresse')
    expect(doneTaskLabel('2026-07-16:jardin:protection:vent', lookup)).toBe('Protection vent fort')
  })
  it('espèce inconnue : le type seul', () => {
    expect(doneTaskLabel('2026:fantome:taille:1', lookup)).toBe('Taille')
  })
  it('tolère un suffixe supplémentaire dans la clé', () => {
    expect(doneTaskLabel('2026-W41:pommier:taille:2:abc123', lookup)).toBe('Taille · Pommier')
  })
  it('clé illisible', () => {
    expect(doneTaskLabel('n-importe-quoi', lookup)).toBe('Tâche')
    expect(doneTaskLabel('', lookup)).toBe('Tâche')
  })
})

import { doneOnLabel } from './taskLabel'
import { rainWord, weatherSentences } from './weatherText'

describe('doneOnLabel', () => {
  const now = new Date('2026-10-24T10:00:00')
  it('date en toutes lettres', () => {
    expect(doneOnLabel('2026-10-21T09:00:00', now)).toBe('Fait le 21 octobre')
  })
  it('autre année : année ajoutée', () => {
    expect(doneOnLabel('2025-12-02T09:00:00', now)).toBe('Fait le 2 décembre 2025')
  })
  it('date illisible', () => expect(doneOnLabel('x', now)).toBe(''))
})

describe('météo en clair', () => {
  it('sol sec sans pluie', () => {
    const s = weatherSentences({ rain7: 0, et07: 20, deficitMm: 20, forecastRain3: 0 })
    expect(s[0]).toMatch(/arrosez/)
    expect(s[1]).toMatch(/Pas de pluie/)
  })
  it('sol humide, aucun chiffre', () => {
    const s = weatherSentences({ rain7: 30, et07: 10, deficitMm: 0, forecastRain3: 6 }).join(' ')
    expect(s).toMatch(/assez plu/)
    expect(s).not.toMatch(/\d+ mm/)
  })
  it('mots de pluie', () => {
    expect([rainWord(0), rainWord(1), rainWord(8)]).toEqual(['Sec', 'Averses', 'Pluie'])
  })
})
