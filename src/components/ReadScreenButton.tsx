import { Icon } from './Icon'
import type { HelpContent } from '../lib/help'
import { screenSpeechText } from '../lib/readScreen'
import { speak, speechSupported, stopSpeaking, useSpeakingKey, useStopSpeakingOnLeave } from '../lib/speech'

const SPEECH_ID = 'ecran'

/**
 * « Lire cet écran » : lit à voix haute l'aide de l'écran courant. Caché si le téléphone n'a pas de synthèse vocale.
 * Jamais de lecture automatique : un appui lance, un appui arrête (puis relit depuis le début). La voix s'arrête quand on quitte la feuille.
 */
export function ReadScreenButton({ help, className = 'btn lost-big' }: { help: HelpContent; className?: string }) {
  const speaking = useSpeakingKey() === SPEECH_ID
  useStopSpeakingOnLeave()
  if (!speechSupported()) return null
  return (
    <button className={className} data-feat="lire-ecran" aria-pressed={speaking} onClick={() => (speaking ? stopSpeaking() : speak(SPEECH_ID, screenSpeechText(help)))}>
      <Icon name="speaker" /> {speaking ? 'Arrêter la lecture' : 'Lire cet écran'}
    </button>
  )
}
