// Recadrage au centre d'une image de vidéo avant l'envoi à Pl@ntNet : en filmant, la plante visée est au milieu,
// le reste (pelouse, mur, voisin) ne fait que brouiller l'identification. La photo gardée pour la plante n'est PAS touchée.

/** Part du côté conservée (0,7 : la moitié de la surface). */
export const CENTER_FRACTION = 0.7

/** Rectangle central à découper (pur, testé). */
export function centerRect(w: number, h: number, fraction = CENTER_FRACTION): { sx: number; sy: number; sw: number; sh: number } {
  const f = Math.min(1, Math.max(0.2, fraction))
  const sw = Math.max(1, Math.round(w * f))
  const sh = Math.max(1, Math.round(h * f))
  return { sx: Math.floor((w - sw) / 2), sy: Math.floor((h - sh) / 2), sw, sh }
}

/** Découpe le centre d'une image. En cas d'échec (pas de canvas, image illisible), renvoie l'image entière : on ne bloque jamais l'identification. */
export async function cropCenter(blob: Blob, fraction = CENTER_FRACTION): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob)
    const { sx, sy, sw, sh } = centerRect(bmp.width, bmp.height, fraction)
    const c = document.createElement('canvas')
    c.width = sw
    c.height = sh
    c.getContext('2d')?.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh)
    bmp.close?.()
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
    c.width = c.height = 0
    return out ?? blob
  } catch {
    return blob
  }
}
