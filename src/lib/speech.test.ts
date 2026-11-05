import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickFrenchVoice, speak, speechSupported, stopSpeaking, taskSpeech, type SpeechEnv } from './speech'

class FakeUtterance {
  lang = ''
  voice: unknown = null
  rate = 1
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

function env(voices: { lang: string; localService?: boolean; name?: string }[] = []) {
  const spoken: FakeUtterance[] = []
  const synth = { speak: vi.fn((u: FakeUtterance) => void spoken.push(u)), cancel: vi.fn(), getVoices: () => voices }
  return { e: { synth, Utterance: FakeUtterance } as unknown as SpeechEnv, spoken, synth }
}

afterEach(() => stopSpeaking(env().e))

describe('speechSupported', () => {
  it('faux sans synthèse ou sans constructeur', () => {
    expect(speechSupported({})).toBe(false)
    expect(speechSupported({ synth: env().synth as never })).toBe(false)
    expect(speechSupported(env().e)).toBe(true)
  })
})

describe('pickFrenchVoice', () => {
  it('préfère fr-FR, puis une voix locale', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'fr-CA', localService: true, name: 'ca' }, { lang: 'fr-FR', localService: false, name: 'fr-réseau' }, { lang: 'fr-FR', localService: true, name: 'fr-local' }]
    expect(pickFrenchVoice(voices)?.name).toBe('fr-local')
  })
  it('accepte une autre variante du français, et rien sinon', () => {
    expect(pickFrenchVoice([{ lang: 'fr-BE', name: 'be' }])?.name).toBe('be')
    expect(pickFrenchVoice([{ lang: 'en-GB' }, { lang: 'de-DE' }])).toBeUndefined()
  })
})

describe('taskSpeech', () => {
  it('lit le titre, la raison, le geste et l’outil, chacun fini par un point', () => {
    expect(taskSpeech({ title: 'Tailler le pommier', reason: 'Hors gel', howTo: 'Coupez les branches mortes.', tool: 'sécateur' })).toBe('Tailler le pommier. Hors gel. Coupez les branches mortes. Outil : sécateur.')
  })
  it('coupe un texte très long sans casser un mot', () => {
    const t = taskSpeech({ title: 'T', howTo: 'mot '.repeat(400) })
    expect(t.length).toBeLessThanOrEqual(702)
    expect(t.endsWith('…')).toBe(true)
  })
})

describe('speak', () => {
  it('lit en français avec la voix française et remet le silence à la fin', () => {
    const { e, spoken } = env([{ lang: 'fr-FR', name: 'fr' }])
    expect(speak('k1', 'Bonjour', e)).toBe(true)
    expect(spoken).toHaveLength(1)
    expect(spoken[0].lang).toBe('fr-FR')
    expect((spoken[0].voice as { name: string }).name).toBe('fr')
    spoken[0].onend?.()
  })
  it('coupe la lecture précédente avant d’en lancer une autre', () => {
    const { e, synth } = env()
    speak('a', 'un', e)
    speak('b', 'deux', e)
    expect(synth.cancel).toHaveBeenCalledTimes(2)
  })
  it('renvoie faux quand la synthèse manque', () => {
    expect(speak('a', 'x', {})).toBe(false)
  })
})
