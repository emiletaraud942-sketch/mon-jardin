/**
 * Vrai si, sans défiler, le panneau « Heure et réglages » n'atteint pas le bas de la rangée des saisons (l'heure, − et +, Animer, Réglages 3D et les saisons
 * sont l'essentiel ; le reste, derrière « Réglages 3D », défile toujours). Tient compte du défilement déjà fait.
 */
export function essentialsClipped(panel: HTMLElement): boolean {
  const seasons = panel.querySelector<HTMLElement>('.season-picker')
  if (!seasons) return false
  const pr = panel.getBoundingClientRect()
  const sr = seasons.getBoundingClientRect()
  return sr.bottom + panel.scrollTop > pr.bottom - panel.clientTop + 0.5
}


/**
 * Vrai si la barre Dessus / Perspective / Se promener et la rangée Heure / Recentrer descendent sous la place que le haut de l'écran leur laisse
 * (`barBottom` : bas de la barre ; `overlayBottom` et `padBottom` : bas de la couche de commandes et sa marge du bas, qui réserve la feuille du bas).
 * Cas mesuré : jardin d'exemple avec son bandeau, 360×740, « Très grand » + « Grandes touches » : scène de 321 px, rangée Heure à 466–522 px sous une feuille
 * qui commence à 488 px (un appui tombait sur sa poignée). Tolérance d'un demi-pixel.
 */
export function barOverflows(barBottom: number, overlayBottom: number, padBottom: number): boolean {
  return barBottom > overlayBottom - padBottom + 0.5
}

/** Mesure faite sur la mise en page « au naturel » (l'attribut `data-squeezed` doit être retiré avant). */
export function stackOverflows(root: HTMLElement): boolean {
  const overlay = root.querySelector<HTMLElement>('.g3d-overlay')
  const bar = root.querySelector<HTMLElement>('.g3d-bar')
  if (!overlay || !bar) return false
  const pad = parseFloat(getComputedStyle(overlay).paddingBottom) || 0
  return barOverflows(bar.getBoundingClientRect().bottom, overlay.getBoundingClientRect().bottom, pad)
}
