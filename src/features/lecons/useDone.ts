import { useSyncExternalStore } from 'react'
import { readDone, subscribeDone } from './progress'

/** Les leçons terminées, mises à jour dès qu'on en marque une (écran, accueil). */
export function useLessonsDone(): string[] {
  return useSyncExternalStore(subscribeDone, readDone, () => [])
}
