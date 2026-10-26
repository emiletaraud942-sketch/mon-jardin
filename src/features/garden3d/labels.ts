// Textes de la vue 3D en langage clair (purs, testés).

const DIRECTIONS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest']

/** Côté du ciel d'où vient le soleil, en toutes lettres (azimut géographique : 0 = nord, 90 = est). */
export function directionName(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360
  return DIRECTIONS[Math.round(a / 45) % 8]
}

/** Heure décimale -> « 14:30 ». */
export function formatClock(h: number): string {
  let hh = Math.floor(h)
  let mm = Math.round((h - hh) * 60)
  if (mm === 60) {
    hh += 1
    mm = 0
  }
  return `${hh}:${String(mm).padStart(2, '0')}`
}

/** « Soleil à 14:30 · haut dans le ciel, côté sud-ouest » (ou soleil couché). */
export function describeSun(hour: number, altitudeDeg: number, azimuthDeg: number): string {
  if (altitudeDeg <= 0) return `Soleil couché à ${formatClock(hour)}`
  const height = altitudeDeg < 15 ? 'bas sur l’horizon' : altitudeDeg < 40 ? 'à mi-hauteur dans le ciel' : 'haut dans le ciel'
  return `Soleil à ${formatClock(hour)} · ${height}, côté ${directionName(azimuthDeg)}`
}

/** Version courte, sur une ligne : « 17:15 · soleil bas, sud-ouest » (ou « 21:00 · soleil couché »). */
export function describeSunShort(hour: number, altitudeDeg: number, azimuthDeg: number): string {
  if (altitudeDeg <= 0) return `${formatClock(hour)} · soleil couché`
  const height = altitudeDeg < 15 ? 'soleil bas' : altitudeDeg < 40 ? 'soleil mi-hauteur' : 'soleil haut'
  return `${formatClock(hour)} · ${height}, ${directionName(azimuthDeg)}`
}

/** « Aujourd’hui », « Dans 1 an », « Dans 5 ans ». */
export function yearsLabel(n: number): string {
  if (n <= 0) return 'Aujourd’hui'
  return `Dans ${n} an${n > 1 ? 's' : ''}`
}

/** Raccourcis de saison : libellé clair, date de repère (mois, jour). */
export const SEASON_SHORTCUTS = [
  { label: 'Début du printemps', month: 3, day: 21 },
  { label: 'Plein été', month: 6, day: 21 },
  { label: 'Plein hiver', month: 12, day: 21 },
] as const

/** Résumé du jardin pour les lecteurs d'écran (le canvas 3D n'a pas de contenu textuel). */
export function gardenSummary(name: string | undefined, plantCount: number, buildingCount: number): string {
  const plants = plantCount === 0 ? 'aucune plante' : `${plantCount} plante${plantCount > 1 ? 's' : ''}`
  const houses = buildingCount === 0 ? 'aucune maison voisine' : `${buildingCount} maison${buildingCount > 1 ? 's' : ''} voisine${buildingCount > 1 ? 's' : ''}`
  return `Vue 3D du jardin${name ? ` « ${name} »` : ''} : ${plants}, ${houses}. Utilisez la carte pour une description précise.`
}

/** Aide de la Promenade, selon l'appareil. */
export function walkHelp(touch: boolean): string {
  return touch
    ? 'Poussez le rond ou touchez les flèches pour avancer. Touchez « Tourner » pour pivoter. Glissez le doigt sur le jardin pour regarder autour. Touchez une plante pour la choisir.'
    : 'Touches fléchées pour avancer (↑ ↓) et tourner (← →). Glissez la souris pour regarder autour. Maj pour courir. Cliquez une plante pour la choisir.'
}

/** Bulle d'aide de la Promenade : deux lignes, disparaît seule. */
export function walkHelpShort(touch: boolean): string {
  return touch ? 'Poussez le rond pour marcher. Glissez sur la scène pour regarder autour.' : 'Flèches ou ZQSD pour marcher, glissez pour regarder. Maj pour courir.'
}

/** Jardin sans plante : message discret, la scène reste visible. */
export const EMPTY_GARDEN_TEXT = 'Aucune plante pour l’instant — ajoutez-en depuis la carte'

export const ERROR_3D_TITLE = 'La vue 3D ne fonctionne pas sur cet appareil.'
export const ERROR_3D_TEXT = 'Vous pouvez continuer avec la carte.'
