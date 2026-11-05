// Détection tactile unifiée de la 3D. Avant : trois définitions différentes (Scene : pointer coarse seul ; Walk et Garden3D :
// pointer coarse OU maxTouchPoints > 0, ce qui donnait un joystick aux ordinateurs à écran tactile avec souris).
// Règle : pointeur principal grossier (téléphone, tablette, iPad avec clavier compris), ou, sans matchMedia, des points de contact
// sans pointeur fin disponible.

export interface TouchEnv {
  matches: (query: string) => boolean
  maxTouchPoints: number
}

/** Pure : vrai si l'écran se pilote au doigt. */
export function isTouchPrimary(env: TouchEnv): boolean {
  if (env.matches('(pointer: coarse)')) return true
  return env.maxTouchPoints > 0 && !env.matches('(any-pointer: fine)') && !env.matches('(pointer: fine)')
}

let cached: boolean | undefined
/** Lit le navigateur une fois (le type de pointeur change rarement en cours de session). */
export function isTouchDevice(): boolean {
  if (cached !== undefined) return cached
  if (typeof window === 'undefined') return false
  const mm = window.matchMedia?.bind(window)
  cached = isTouchPrimary({ matches: (q) => (mm ? !!mm(q).matches : false), maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0 })
  return cached
}
export function resetTouchCache(): void {
  cached = undefined
}
