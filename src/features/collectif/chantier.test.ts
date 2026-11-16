import { describe, expect, it } from 'vitest'
import { chantierEvent, chantierText, chantierTimes, chantierValid, EMPTY_CHANTIER, type ChantierForm } from './chantier'

const f: ChantierForm = { titre: 'Plantation de la haie', date: '2026-12-05', heure: '14:00', dureeH: 2, lieu: 'Jardin de la rue Verte', apporter: 'gants, pelle', organisateur: 'Sam' }

describe('chantier participatif', () => {
  it('calcule le début et la fin', () => {
    const t = chantierTimes(f)!
    expect(t.end.getTime() - t.start.getTime()).toBe(2 * 3_600_000)
    expect(chantierTimes({ ...f, date: 'demain' })).toBeNull()
    expect(chantierTimes({ ...f, heure: '2h' })).toBeNull()
    expect(chantierTimes({ ...f, dureeH: -5 })!.end.getTime() - chantierTimes(f)!.start.getTime()).toBe(3 * 3_600_000)
  })
  it('demande ce qui manque, dans l’ordre', () => {
    expect(chantierValid(EMPTY_CHANTIER)).toMatch(/titre/)
    expect(chantierValid({ ...EMPTY_CHANTIER, titre: 'x' })).toMatch(/jour/)
    expect(chantierValid({ ...EMPTY_CHANTIER, titre: 'x', date: '2026-12-05' })).toMatch(/où/i)
    expect(chantierValid(f)).toBeUndefined()
  })
  it('écrit une invitation courte', () => {
    const t = chantierText(f)
    expect(t).toContain('Plantation de la haie')
    expect(t).toContain('Où : Jardin de la rue Verte')
    expect(t).toContain('À apporter : gants, pelle')
    expect(t).toContain('Organisé par : Sam')
    expect(t.split('\n').length).toBeLessThanOrEqual(6)
  })
  it('ne laisse passer aucun saut de ligne venu d’un champ', () => {
    expect(chantierText({ ...f, titre: 'a\nb\r\nc' }).split('\n')[0]).toBe('a b c')
  })
  it('prépare l’événement d’agenda sans lien d’inscription', () => {
    const e = chantierEvent(f, 'c1')!
    expect(e.signupUrl).toBeNull()
    expect(e.organizerName).toBe('Sam')
    expect(chantierEvent({ ...f, date: '' }, 'c1')).toBeNull()
    expect(chantierEvent({ ...f, organisateur: '' }, 'c1')!.organizerName).toBe('Jardin partagé')
  })
})
