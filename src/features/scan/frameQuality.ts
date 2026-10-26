// Tri des images d'une vidéo : floues et sans végétation écartées (pur, testé). Travaille sur des pixels RGBA (ImageData.data).

/** Niveaux de gris (0 à 255) d'une image RGBA. */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  return g
}

/** Variance du laplacien (noyau 4-voisins) : grande si l'image est nette, faible si elle est floue. */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0
  let sum = 0
  let sum2 = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i]
      sum += l
      sum2 += l * l
      n++
    }
  }
  const mean = sum / n
  return sum2 / n - mean * mean
}

/** Part des pixels « plante » : verts (feuillage) ou bruns (tronc, terre). 0 à 1. */
export function vegetationRatio(rgba: ArrayLike<number>): number {
  const total = Math.floor(rgba.length / 4)
  if (total === 0) return 0
  let veg = 0
  for (let p = 0; p < total * 4; p += 4) {
    const r = rgba[p]
    const g = rgba[p + 1]
    const b = rgba[p + 2]
    const green = g > r + 8 && g > b + 8 && g > 35
    const brown = r > g && g > b && r - b > 30 && r < 200 && r > 50
    if (green || brown) veg++
  }
  return veg / total
}

/** Seuils : au-dessous, l'image est écartée. */
export const MIN_SHARPNESS = 60
export const MIN_VEGETATION = 0.2

export type FrameVerdict = { ok: true; sharpness: number; vegetation: number } | { ok: false; reason: 'floue' | 'sans-plante'; sharpness: number; vegetation: number }

export function judgeFrame(rgba: ArrayLike<number>, w: number, h: number, thresholds: { sharp?: number; veg?: number } = {}): FrameVerdict {
  const sharpness = laplacianVariance(toGray(rgba, w, h), w, h)
  const vegetation = vegetationRatio(rgba)
  if (sharpness < (thresholds.sharp ?? MIN_SHARPNESS)) return { ok: false, reason: 'floue', sharpness, vegetation }
  if (vegetation < (thresholds.veg ?? MIN_VEGETATION)) return { ok: false, reason: 'sans-plante', sharpness, vegetation }
  return { ok: true, sharpness, vegetation }
}
