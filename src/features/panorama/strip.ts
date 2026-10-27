// Bande cylindrique : les photos d'un point, posées à leur cap sur un cylindre à 360°, vues depuis l'intérieur.
// Pas d'assemblage lourd : chaque photo est redressée colonne par colonne, puis fondue sur la précédente par son bord gauche.
import { getPhoto } from '../../lib/photos'
import type { Panorama, PanoramaShot } from '../../types'
import { angleDelta, clamp, normDeg, sortedShots } from './geometry'

type Bitmap = ImageBitmap

/** Pixels par degré de la bande : 9 donne 3 240 px pour 360°, net sur un téléphone sans trop de mémoire. */
export const PPD = 9
const RAD = Math.PI / 180
/** Largeur (px de la bande) d'une tranche redressée. */
const COL = 2
/** Hauteur maximale couverte par une bande importée (degrés). */
const MAX_COVER_DEG = 120

export interface Strip {
  canvas: HTMLCanvasElement
  ppd: number
  /** Hauteur couverte par les photos (degrés). */
  coverVfovDeg: number
}

function newCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.imageSmoothingQuality = 'high'
  return { canvas, ctx }
}

/** Hauteur minimale de la bande (degrés) : au-delà des photos, le haut et le bas sont prolongés par la couleur moyenne du bord. */
const MIN_COVER_DEG = 90

/** Moyenne des `rows` premières (ou dernières) lignes d'une image, sur une ligne de pixels : sert à prolonger le ciel et le sol. */
function edgeRow(bitmap: Bitmap, top: boolean, rows = 24): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = bitmap.width
  c.height = 1
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const n = Math.min(rows, bitmap.height)
  ctx.drawImage(bitmap, 0, top ? 0 : bitmap.height - n, bitmap.width, n, 0, 0, bitmap.width, 1)
  return c
}

/** Photo rectiligne → colonnes du cylindre. `rampDeg` : largeur du fondu au bord gauche (0 = bord net). `onlyRamp` : ne dessine que le fondu. */
function drawGuideShot(ctx: CanvasRenderingContext2D, bitmap: Bitmap, shot: PanoramaShot, stripW: number, stripH: number, rampDeg: number, onlyRamp: boolean) {
  const edges = { top: edgeRow(bitmap, true), bottom: edgeRow(bitmap, false) }
  const w = bitmap.width
  const h = bitmap.height
  const fov = clamp(shot.fovDeg, 10, 150)
  const fS = w / 2 / Math.tan((fov / 2) * RAD)
  const fC = (PPD * 180) / Math.PI
  const cols = Math.max(1, Math.floor(fov * PPD))
  const rampCols = Math.round(rampDeg * PPD)
  const left = Math.round((shot.headingDeg - fov / 2) * PPD)
  const n = onlyRamp ? Math.min(cols, rampCols) : cols
  // Tranches de COL pixels (moins d'appels de dessin : un téléphone modeste met plusieurs secondes sinon).
  for (let i = 0; i < n; i += COL) {
    const wCol = Math.min(COL, cols - i)
    const th = ((i + wCol / 2) / PPD - fov / 2) * RAD
    const cos = Math.cos(th)
    const sw = Math.max(0.5, ((fS / (cos * cos)) * RAD * wCol) / PPD)
    const xs = fS * Math.tan(th) + w / 2
    const sx = clamp(xs - sw / 2, 0, Math.max(0, w - sw))
    const k = (fC * cos) / fS
    const dh = h * k
    ctx.globalAlpha = rampCols > 0 && i < rampCols ? Math.min(1, (i + wCol / 2) / rampCols) : 1
    const dx = (((left + i) % stripW) + stripW) % stripW
    const top = stripH / 2 - dh / 2
    // Au-dessus et au-dessous de la photo : prolongement par la couleur moyenne du bord (ciel, sol), une tranche sur deux.
    if (top > 0.5 && (i / COL) % 2 === 0) {
      const ew = Math.min(sw * 2, w - sx)
      ctx.drawImage(edges.top, sx, 0, ew, 1, dx, 0, wCol * 2, top + 0.5)
      ctx.drawImage(edges.bottom, sx, 0, ew, 1, dx, top + dh - 0.5, wCol * 2, top + 0.5)
    }
    ctx.drawImage(bitmap, sx, 0, sw, h, dx, top, wCol, dh)
  }
  ctx.globalAlpha = 1
}

/** Lit une photo du point (undefined si elle n'est plus sur l'appareil ou illisible). */
async function loadBitmap(shot: PanoramaShot): Promise<Bitmap | undefined> {
  const blob = await getPhoto(shot.photoId)
  if (!blob) return undefined
  try {
    return await createImageBitmap(blob)
  } catch {
    return undefined
  }
}

/** Recouvrement (degrés) entre une photo et la précédente : largeur du fondu. */
function overlapDeg(cur: PanoramaShot, prev: PanoramaShot | undefined): number {
  if (!prev || prev === cur) return 0
  const d = normDeg(angleDelta(prev.headingDeg, cur.headingDeg))
  return Math.max(0, prev.fovDeg / 2 + cur.fovDeg / 2 - d)
}

/** Panorama importé : une seule photo large, posée sur la bande à son cap. */
function drawImport(bitmap: Bitmap, shot: PanoramaShot): Strip {
  const stripW = 360 * PPD
  const span = clamp(shot.fovDeg, 20, 360)
  const cover = Math.min(MAX_COVER_DEG, (span * bitmap.height) / bitmap.width)
  const coverRows = Math.round(cover * PPD)
  const totalRows = Math.max(coverRows, MIN_COVER_DEG * PPD)
  const pad = Math.round((totalRows - coverRows) / 2)
  const { canvas, ctx } = newCanvas(stripW, totalRows)
  const cropH = Math.min(bitmap.height, (cover / span) * bitmap.width)
  const sy = (bitmap.height - cropH) / 2
  const left = Math.round((shot.headingDeg - span / 2) * PPD)
  const dw = Math.round(span * PPD)
  // Prolongement du haut et du bas : couleur moyenne des bords de la photo.
  const rowsFor = (top: boolean) => {
    const c = document.createElement('canvas')
    c.width = bitmap.width
    c.height = 1
    const x = c.getContext('2d')!
    x.imageSmoothingQuality = 'high'
    const n = Math.max(1, Math.min(24, Math.round(cropH / 20)))
    x.drawImage(bitmap, 0, top ? sy : sy + cropH - n, bitmap.width, n, 0, 0, bitmap.width, 1)
    return c
  }
  const topRow = rowsFor(true)
  const bottomRow = rowsFor(false)
  // Une photo sur toute la largeur peut passer par la couture à 0° : deux morceaux.
  const x0 = ((left % stripW) + stripW) % stripW
  const firstDw = stripW - x0
  const firstSw = (firstDw / dw) * bitmap.width
  const pieces = x0 + dw <= stripW ? [{ sx: 0, sw: bitmap.width, dx: x0, dw }] : [{ sx: 0, sw: firstSw, dx: x0, dw: firstDw }, { sx: firstSw, sw: bitmap.width - firstSw, dx: 0, dw: dw - firstDw }]
  for (const pc of pieces) {
    if (pad > 0) {
      ctx.drawImage(topRow, pc.sx, 0, pc.sw, 1, pc.dx, 0, pc.dw, pad + 1)
      ctx.drawImage(bottomRow, pc.sx, 0, pc.sw, 1, pc.dx, pad + coverRows - 1, pc.dw, pad + 1)
    }
    ctx.drawImage(bitmap, pc.sx, sy, pc.sw, cropH, pc.dx, pad, pc.dw, coverRows)
  }
  return { canvas, ppd: PPD, coverVfovDeg: totalRows / PPD }
}

/**
 * Construit la bande de 360° d'un point, une photo à la fois (une seule photo décodée en mémoire à tout moment :
 * 12 photos décodées d'un coup pèseraient une soixantaine de Mo). `missing` : photos absentes ou illisibles.
 * undefined si aucune photo n'a pu être lue.
 */
export async function buildStrip(p: Panorama, isCancelled: () => boolean = () => false): Promise<{ strip: Strip; missing: number } | undefined> {
  if (p.kind === 'import') {
    const bmp = await loadBitmap(p.shots[0])
    if (!bmp) return undefined
    const strip = drawImport(bmp, p.shots[0])
    bmp.close?.()
    return { strip, missing: p.shots.length - 1 }
  }
  const stripW = 360 * PPD
  const fC = (PPD * 180) / Math.PI
  const stripH = Math.round(2 * fC * Math.tan((MIN_COVER_DEG / 2) * RAD))
  const { canvas, ctx } = newCanvas(stripW, stripH)
  const order = sortedShots(p.shots)
  let missing = 0
  let first: PanoramaShot | undefined
  let prev: PanoramaShot | undefined
  for (const shot of order) {
    if (isCancelled()) return undefined
    const bmp = await loadBitmap(shot)
    if (!bmp) {
      missing++
      continue
    }
    // La première photo est posée nette ; chacune des suivantes se fond sur la précédente par son bord gauche.
    drawGuideShot(ctx, bmp, shot, stripW, stripH, first ? Math.min(overlapDeg(shot, prev), shot.fovDeg / 2) : 0, false)
    bmp.close?.()
    first ??= shot
    prev = shot
  }
  if (!first || !prev) return undefined
  // Retour au début du tour : la première photo se fond sur la dernière.
  if (first !== prev) {
    const bmp = await loadBitmap(first)
    if (bmp) {
      drawGuideShot(ctx, bmp, first, stripW, stripH, Math.min(overlapDeg(first, prev), first.fovDeg / 2), true)
      bmp.close?.()
    }
  }
  return { strip: { canvas, ppd: PPD, coverVfovDeg: (2 * Math.atan(stripH / 2 / fC)) / RAD }, missing }
}
