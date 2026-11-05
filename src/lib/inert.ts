import { useEffect } from 'react'

// Plein écran (photos du jardin, fiche d'une plante) : le reste de la page devient inerte
// (ni focus clavier, ni lecteur d'écran, ni toucher) tant que l'écran est ouvert.

/** Ce qu'il faut savoir d'un élément pour le rendre inerte (permet de tester sans navigateur). */
export interface InertNode {
  parentElement: InertNode | null
  children: ArrayLike<InertNode>
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
  tagName?: string
  className?: string | { toString(): string }
}

/** Éléments à laisser actifs : messages (toasts, lien de sortie), balises sans contenu. */
const KEEP = /(^|\s)(toast-host|overlay-stack)(\s|$)/
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT'])

/**
 * Rend inertes tous les éléments qui entourent `node` (ses frères et ceux de ses ancêtres, jusqu'à `root`).
 * Renvoie la fonction qui rétablit l'état d'avant (un élément déjà inerte le reste).
 */
export function inertAround(node: InertNode, root: InertNode): () => void {
  const touched: InertNode[] = []
  let cur: InertNode | null = node
  while (cur && cur !== root) {
    const parent: InertNode | null = cur.parentElement
    if (!parent) break
    for (const el of Array.from(parent.children)) {
      if (el === cur || SKIP_TAGS.has(el.tagName ?? '') || KEEP.test(String(el.className ?? '')) || el.hasAttribute('inert')) continue
      el.setAttribute('inert', '')
      touched.push(el)
    }
    cur = parent
  }
  return () => touched.forEach((el) => el.removeAttribute('inert'))
}

/** Tant que `active` est vrai et que `ref` est monté, le reste de la page est inerte. */
export function useInertBehind(active: boolean, ref: { current: HTMLElement | null }, deps: unknown[] = []) {
  useEffect(() => {
    const node = ref.current
    if (!active || !node) return
    return inertAround(node as unknown as InertNode, document.body as unknown as InertNode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps])
}
