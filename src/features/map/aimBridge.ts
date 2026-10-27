// Pont entre la bannière de placement (bouton « Valider ») et la carte (viseur au centre, endroit touché).
let handler: (() => void) | undefined

export function registerAim(h: () => void): () => void {
  handler = h
  return () => {
    if (handler === h) handler = undefined
  }
}

/** « Valider » : pose (ou déplace) la plante à l'endroit choisi : sous le viseur, sinon là où l'on a touché. Sans carte ouverte : rien. */
export function placeAtAim() {
  handler?.()
}

/**
 * Sur téléphone et sur écran tactile, toucher la carte choisit un endroit et « Valider » le confirme (doigt imprécis, on peut corriger).
 * À la souris, un clic suffit : la plante est posée tout de suite (annulable).
 */
export function confirmBeforePlacing(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches || window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}
