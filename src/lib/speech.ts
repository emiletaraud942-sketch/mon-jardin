// Lecture à voix haute d'une tâche (synthèse vocale du navigateur, locale : rien n'est envoyé).
// Le bouton « Lire » n'existe que si la synthèse est disponible.
import { useEffect, useState } from 'react'

export interface VoiceLike {
  lang: string
  name?: string
  localService?: boolean
  default?: boolean
}

export interface SpeechEnv {
  synth?: {
    speak(u: unknown): void
    cancel(): void
    getVoices(): VoiceLike[]
  }
  /** Constructeur de SpeechSynthesisUtterance. */
  Utterance?: new (text: string) => { lang: string; voice: unknown; rate: number; onend: (() => void) | null; onerror: (() => void) | null }
}

function browserEnv(): SpeechEnv {
  if (typeof window === 'undefined') return {}
  return { synth: window.speechSynthesis as unknown as SpeechEnv['synth'], Utterance: (window as unknown as { SpeechSynthesisUtterance?: SpeechEnv['Utterance'] }).SpeechSynthesisUtterance }
}

export const speechSupported = (env: SpeechEnv = browserEnv()): boolean => !!env.synth && typeof env.Utterance === 'function'

/** Voix française : fr-FR d'abord, puis tout fr, de préférence locale (hors ligne). `undefined` : la langue de l'utterance suffit. */
export function pickFrenchVoice<T extends VoiceLike>(voices: T[]): T | undefined {
  const fr = voices.filter((v) => /^fr([-_]|$)/i.test(v.lang))
  const score = (v: T) => (/^fr[-_]FR$/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0)
  return [...fr].sort((a, b) => score(b) - score(a))[0]
}

/** Texte lu : titre, raison, puis le « comment faire ». Sans symboles, coupé à 700 caractères. */
export function taskSpeech(t: { title: string; reason?: string; howTo?: string; tool?: string }): string {
  const end = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : s.trim() + '.')
  const parts = [t.title, t.reason, t.howTo, t.tool ? `Outil : ${t.tool}` : undefined].filter((x): x is string => !!x && x.trim().length > 0).map(end)
  const text = parts.join(' ').replace(/[“”«»]/g, '"').replace(/\s+/g, ' ')
  return text.length > 700 ? text.slice(0, 700).replace(/\s\S*$/, '') + '…' : text
}

let current: { stop: () => void } | undefined
const listeners = new Set<() => void>()
let speakingKey: string | undefined
const emit = () => listeners.forEach((l) => l())

export function stopSpeaking(env: SpeechEnv = browserEnv()) {
  if (speechSupported(env)) env.synth!.cancel()
  current = undefined
  speakingKey = undefined
  emit()
}

/** Lit `text` ; `key` identifie la lecture (pour afficher « Arrêter » sur la bonne tâche). Renvoie faux si la synthèse est absente. */
export function speak(key: string, text: string, env: SpeechEnv = browserEnv()): boolean {
  if (!speechSupported(env)) return false
  env.synth!.cancel()
  const u = new env.Utterance!(text)
  u.lang = 'fr-FR'
  const voice = pickFrenchVoice(env.synth!.getVoices())
  if (voice) u.voice = voice
  u.rate = 0.95
  const done = () => {
    if (speakingKey === key) {
      speakingKey = undefined
      current = undefined
      emit()
    }
  }
  u.onend = done
  u.onerror = done
  speakingKey = key
  current = { stop: () => env.synth!.cancel() }
  emit()
  env.synth!.speak(u)
  return true
}

/** Clé de la lecture en cours (undefined : silence). Quitter l'écran coupe la voix. */
export function useSpeakingKey(): string | undefined {
  const [k, setK] = useState<string | undefined>(speakingKey)
  useEffect(() => {
    const l = () => setK(speakingKey)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return k
}

/** À monter une fois dans l'écran qui lit : la voix s'arrête quand on le quitte. */
export function useStopSpeakingOnLeave() {
  useEffect(() => () => {
    if (current) stopSpeaking()
  }, [])
}
