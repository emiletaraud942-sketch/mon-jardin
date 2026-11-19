// Saison sans feuilles (pur, testé). Hémisphère nord, comme le reste de l'appli : de novembre à mars, les arbres et arbustes
// caducs n'ont ni feuilles, ni fleurs, ni fruits. Pl@ntNet reconnaît alors surtout l'écorce et les bourgeons, de près.

export const isLeafOffSeason = (d: Date = new Date()): boolean => {
  const m = d.getMonth() + 1
  return m >= 11 || m <= 3
}

export const WINTER_NOTE =
  'En hiver, un arbre sans feuilles est difficile à reconnaître, même pour un spécialiste. Quand l’appli n’est pas sûre, elle le dit et vous propose des gros plans de l’écorce et des branches. Pour un scan complet, le printemps et l’été donnent de bien meilleurs résultats.'

/** Les deux gros plans demandés, dans l'ordre : de quoi Pl@ntNet a besoin quand il n'y a plus de feuilles. */
export const CLOSE_UPS = [
  { key: 'bark', organ: 'bark', title: 'L’écorce du tronc', help: 'Approchez-vous à 20 ou 30 cm, bien net, sans ombre dure.' },
  { key: 'twig', organ: 'auto', title: 'Une branche avec ses bourgeons', help: 'Une jeune branche de près : bourgeons, feuilles qui restent, fruits secs.' },
] as const
