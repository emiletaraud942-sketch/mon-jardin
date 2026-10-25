export interface Counts {
  gardens: number
  plants: number
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n > 1 ? many : one}`

export const describeCounts = (c: Counts) => `${plural(c.gardens, 'jardin')} et ${plural(c.plants, 'plante')}`

/** Phrase de confirmation d'un import : « Remplacer vos 2 jardins et 40 plantes par 1 jardin et 12 plantes ? » */
export function importQuestion(current: Counts, next: Counts): string {
  if (current.gardens === 0 && current.plants === 0) return `Reprendre ${describeCounts(next)} ?`
  return `Remplacer vos ${describeCounts(current)} par ${describeCounts(next)} ?`
}

/** Message pour un fichier de sauvegarde refusé : une phrase simple, la raison technique dans « Détails ». */
export function backupErrorNote(error: string): { message: string; detail?: string } {
  if (/version plus récente/i.test(error)) return { message: 'Cette sauvegarde vient d’une version plus récente de l’appli. Faites d’abord la mise à jour.' }
  if (/volumineux/i.test(error)) return { message: 'Ce fichier est trop gros pour être une sauvegarde de PermaJardin.' }
  return { message: 'Ce fichier ne peut pas servir de sauvegarde. Choisissez un fichier fait par PermaJardin.', detail: error }
}
