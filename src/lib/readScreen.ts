// « Lire cet écran » : texte lu à voix haute pour l'écran courant (les étapes de l'aide, `HELP[tab].steps`).
// Module pur ; la voix est dans `speech.ts`.
import type { HelpContent } from './help'

/** Retire ce qu'une voix lirait mal : guillemets, symboles, espaces en trop ; chaque phrase finit par un point. */
export function cleanForSpeech(s: string): string {
  const t = s
    .replace(/[«»“”"]/g, '')
    .replace(/[–—]/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?…])/g, '$1')
    .trim()
  return /[.!?…]$/.test(t) ? t : t + '.'
}

/** Titre, puis chaque étape. Jamais vide tant que l'aide a un titre. */
export function screenSpeechText(help: HelpContent): string {
  return [help.title, ...help.steps].map(cleanForSpeech).join(' ')
}
