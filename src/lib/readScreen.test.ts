import { describe, expect, it } from 'vitest'
import { HELP, HELP_EXTRA } from './help'
import { cleanForSpeech, screenSpeechText } from './readScreen'

describe('« Lire cet écran » : le texte lu', () => {
  it('commence par le titre, puis lit chaque étape dans l’ordre', () => {
    const t = screenSpeechText({ title: 'La carte', steps: ['Touchez « Ajouter une plante ».', 'Puis la carte'] })
    expect(t).toBe('La carte. Touchez Ajouter une plante. Puis la carte.')
  })

  it('enlève guillemets et tirets que la voix lirait mal', () => {
    expect(cleanForSpeech('« Voir tout » — toutes les tâches')).toBe('Voir tout, toutes les tâches.')
    expect(cleanForSpeech('Fini !')).toBe('Fini!')
    expect(cleanForSpeech('  deux   espaces ')).toBe('deux espaces.')
  })

  it('chaque écran de l’appli a un texte à lire, sans symbole parasite', () => {
    for (const [tab, h] of [...Object.entries(HELP), ...Object.entries(HELP_EXTRA)]) {
      const t = screenSpeechText(h)
      expect(t.startsWith(cleanForSpeech(h.title)), tab).toBe(true)
      expect(t.length, tab).toBeGreaterThan(40)
      expect(t, tab).not.toMatch(/[«»“”"]/)
      expect(t, tab).not.toMatch(/\s{2,}/)
    }
  })
})
