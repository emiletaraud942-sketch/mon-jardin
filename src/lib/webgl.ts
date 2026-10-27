// MapLibre 6 ne sait dessiner qu'en WebGL 2 (la 4.x se contentait de WebGL 1). Un appareil ou un navigateur sans WebGL 2
// (iPhone sous iOS 14 ou moins, très vieux Android, GPU bloqué) ferait planter l'écran de la carte : on le détecte avant.

let cached: boolean | undefined

/** Le navigateur peut-il créer un contexte WebGL 2 ? Résultat mémorisé (la réponse ne change pas en cours de session). */
export function webgl2Supported(create: () => { getContext(id: string): unknown } | null = () => (typeof document === 'undefined' ? null : document.createElement('canvas'))): boolean {
  if (cached !== undefined) return cached
  try {
    cached = !!create()?.getContext('webgl2')
  } catch {
    cached = false
  }
  return cached
}

/** Pour les tests : oublie la réponse mémorisée. */
export function resetWebgl2Cache() {
  cached = undefined
}
