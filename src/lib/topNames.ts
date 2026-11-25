/** Résumé de la feuille repliée de « Où planter ? » : les meilleures plantes d'abord (« Lavande · Romarin · Thym · +12 »), pour lire les conseils sans l'ouvrir. */
export function topNames(names: string[], max = 3): string {
  if (names.length === 0) return 'Aucune idée ici'
  const shown = names.slice(0, max).join(' · ')
  return names.length > max ? `${shown} · +${names.length - max}` : shown
}
