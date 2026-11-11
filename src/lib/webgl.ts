// Détection de WebGL 2, pour la carte (MapLibre 6). La réponse est mémorisée : elle ne change pas en cours de session.
// Le rendu logiciel (SwiftShader, llvmpipe) reste permis : la carte 2D y fonctionne. iPhone sous iOS 14 ou moins,
// très vieux Android, GPU bloqué : faux, et la carte est remplacée par `MapUnsupported`.

let cached: boolean | undefined

/** Le navigateur peut-il créer un contexte WebGL 2 ? Résultat mémorisé. */
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
