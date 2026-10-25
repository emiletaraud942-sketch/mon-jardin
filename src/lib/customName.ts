/** Longueur maximale d'un nom de plante saisi à la main. */
export const CUSTOM_NAME_MAX = 60

/** Nom saisi à la main : espaces nettoyés, longueur bornée. Texte vide = pas de nom. */
export function cleanCustomName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length > CUSTOM_NAME_MAX ? name.slice(0, CUSTOM_NAME_MAX).trim() : name
}

/** Espèce utilisée pour une plante absente de la liste (fiche générique, sans calendrier). */
export const UNKNOWN_SPECIES_ID = 'inconnue'

/** Nom au milieu d'une phrase : « Pommier » devient « pommier » ; un sigle ou un nom propre en majuscules reste tel quel. */
export function inSentence(name: string): string {
  const n = name.trim()
  if (n.length < 2) return n
  const [first, second] = [n[0], n[1]]
  const isAcronym = second === second.toUpperCase() && second !== second.toLowerCase()
  return isAcronym ? n : first.toLowerCase() + n.slice(1)
}

/** « votre pommier » : un article ou un possessif déjà saisi (« Mon rosier », « Le figuier », « L’if ») est remplacé, pas doublé. */
export function yourPlant(name: string): string {
  const bare = name.trim().replace(/^(mon|ma|mes|le|la|les|un|une)\s+/i, '').replace(/^l[’']\s*/i, '')
  const n = inSentence(bare || name)
  return `votre ${n}`
}
