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

