// Pont entre la bannière de placement (bouton « Placer ici ») et la carte (viseur au centre).
let handler: (() => void) | undefined

export function registerAim(h: () => void): () => void {
  handler = h
  return () => {
    if (handler === h) handler = undefined
  }
}

/** Pose la plante sous le viseur. Sans carte ouverte : rien. */
export function placeAtAim() {
  handler?.()
}
