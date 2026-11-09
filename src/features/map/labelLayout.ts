/** Un nom de plante posé sous son point : rectangle en pixels d'écran (haut-gauche et taille). */
export type LabelBox = { id: string; left: number; top: number; width: number; height: number; keep?: boolean }

/** Vrai si deux rectangles se recouvrent (ou sont à moins de `gap` pixels l'un de l'autre). */
export function boxesOverlap(a: LabelBox, b: LabelBox, gap = 2): boolean {
  return a.left < b.left + b.width + gap && b.left < a.left + a.width + gap && a.top < b.top + b.height + gap && b.top < a.top + a.height + gap
}

/**
 * Noms à masquer pour qu'aucun ne chevauche un autre. Les noms `keep` (plante choisie) passent d'abord et ne sont jamais masqués ;
 * les autres sont gardés dans l'ordre reçu tant qu'ils ne touchent aucun nom déjà gardé. Calcul simple, sans bibliothèque.
 */
export function hiddenLabelIds(boxes: LabelBox[], gap = 2): Set<string> {
  const kept: LabelBox[] = boxes.filter((b) => b.keep)
  const hidden = new Set<string>()
  for (const b of boxes) {
    if (b.keep) continue
    if (kept.some((k) => boxesOverlap(b, k, gap))) hidden.add(b.id)
    else kept.push(b)
  }
  return hidden
}
