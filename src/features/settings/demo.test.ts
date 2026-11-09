import { describe, expect, it } from 'vitest'
import { DEMO_PLACE } from '../../data/demo'
import { DEMO_GARDEN_NAME, demoHomeTitle, isDemoGarden } from './demo'

describe('jardin d’exemple', () => {
  it('reconnaît le jardin d’exemple à son adresse', () => {
    expect(isDemoGarden({ address: DEMO_PLACE.label })).toBe(true)
    expect(isDemoGarden({ address: '12 rue des Lilas, Nantes' })).toBe(false)
  })
  it('porte un nom qui dit que c’est un exemple', () => {
    expect(DEMO_GARDEN_NAME).toMatch(/^Exemple/)
  })
  it('affiche « Jardin d’exemple » sans « Chez » pour l’exemple, y compris renommé en double', () => {
    expect(demoHomeTitle({ address: DEMO_PLACE.label, name: DEMO_GARDEN_NAME }, 'Chez x')).toBe('Jardin d’exemple')
    expect(demoHomeTitle({ address: DEMO_PLACE.label, name: DEMO_GARDEN_NAME + ' 2' }, 'Chez x')).toBe('Jardin d’exemple')
    expect(demoHomeTitle({ address: DEMO_PLACE.label, name: 'Mon potager' }, 'Mon potager')).toBe('Mon potager')
    expect(demoHomeTitle({ address: '12 rue des Lilas', name: 'Marie' }, 'Chez Marie')).toBe('Chez Marie')
  })
})
