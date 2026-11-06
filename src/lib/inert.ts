import { useEffect } from 'react'

// Plein écran (photos du jardin, fiche d'une plante) : le contenu de la page derrière devient inerte
// (ni focus clavier, ni lecteur d'écran, ni toucher) tant que l'écran est ouvert.
// Seules les zones de contenu sont rendues inertes. Les messages (« Annuler »), les bandeaux et les boîtes de dialogue
// (mesure, achat) ne sont jamais touchés : ils vivent hors de ces zones et doivent rester utilisables.

/** Ce qu'il faut savoir d'un élément pour le rendre inerte (permet de tester sans navigateur). */
export interface InertNode {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** Zones de contenu de l'appli : barre du haut, en-tête de page, sous-onglets, barre de navigation, contenu. */
export const CONTENT_REGIONS = '.app > .skip-link, .app > .topbar, .app > .phead-slot, .app > .modebar, .app > .sidenav, .app > .main'

/**
 * Rend inertes les zones de contenu trouvées sous `root`.
 * Renvoie la fonction qui rétablit l'état d'avant (un élément déjà inerte le reste).
 */
export function inertRegions(root: { querySelectorAll(selector: string): ArrayLike<InertNode> }, selector: string = CONTENT_REGIONS): () => void {
  const touched: InertNode[] = []
  for (const el of Array.from(root.querySelectorAll(selector))) {
    if (el.hasAttribute('inert')) continue
    el.setAttribute('inert', '')
    touched.push(el)
  }
  return () => touched.forEach((el) => el.removeAttribute('inert'))
}

/** Tant que `active` est vrai, le contenu de la page est inerte. */
export function useInertBehind(active: boolean) {
  useEffect(() => {
    if (!active) return
    return inertRegions(document as unknown as { querySelectorAll(selector: string): ArrayLike<InertNode> })
  }, [active])
}
