import { afterEach, describe, expect, it } from 'vitest'
import { buildDiagnostic, clearErrors, getErrors, installDiagnostics, recordError, RING_SIZE, scrub } from './diagnostics'

afterEach(clearErrors)

describe('scrub', () => {
  it('retire e-mails, paramètres d’adresse, coordonnées et identifiants', () => {
    const t = scrub('Échec pour marie@exemple.fr sur https://x.fr/ext/geopf/geocode?q=12+rue+des+Lilas&lat=48.85661 à 48.856614 photo:abcdef123456 123e4567-e89b-12d3-a456-426614174000')
    expect(t).not.toMatch(/marie|Lilas|48\.85|abcdef123456|123e4567/)
    expect(t).toContain('/ext/geopf/geocode')
  })
  it('coupe les textes longs', () => {
    expect(scrub('a'.repeat(1000)).length).toBe(240)
  })
})

describe('anneau d’erreurs', () => {
  it('garde les 20 dernières seulement', () => {
    for (let i = 0; i < 27; i++) recordError('erreur', new Error('n' + i))
    expect(getErrors()).toHaveLength(RING_SIZE)
    expect(getErrors()[0].message).toContain('n7')
    expect(getErrors()[RING_SIZE - 1].message).toContain('n26')
  })

  it('enregistre erreurs et promesses rejetées via les écouteurs globaux, puis se retire', () => {
    const t = new EventTarget()
    const off = installDiagnostics(t as unknown as Window)
    const err = new Event('error') as Event & { message: string; error: unknown }
    err.message = 'boum'
    err.error = new TypeError('boum')
    t.dispatchEvent(err)
    const rej = new Event('unhandledrejection') as Event & { reason: unknown }
    rej.reason = new Error('promesse perdue')
    t.dispatchEvent(rej)
    t.dispatchEvent(new Event('error')) // chargement d'image raté : ignoré
    expect(getErrors().map((x) => x.kind)).toEqual(['erreur', 'promesse'])
    off()
    t.dispatchEvent(rej)
    expect(getErrors()).toHaveLength(2)
  })
})

describe('buildDiagnostic', () => {
  it('ne contient que des comptes, jamais de noms ni de positions', () => {
    recordError('erreur', new Error('Échec pour jardin:abcdefgh1234'))
    const d = buildDiagnostic({
      now: new Date('2026-11-03T10:00:00Z'),
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      language: 'fr-FR',
      online: true,
      viewport: { w: 390, h: 844 },
      standalone: false,
      stateVersion: 2,
      counts: { jardins: 1, plantes: 12, tachesFaites: 30 },
      theme: 'light',
      textSize: 'normal',
    })
    const text = JSON.stringify(d)
    expect(d.donnees).toEqual({ versionFormat: 2, jardins: 1, plantes: 12, tachesFaites: 30 })
    expect(d.erreurs).toHaveLength(1)
    expect(text).not.toContain('abcdefgh1234')
  })
})
