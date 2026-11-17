// Lecture du texte d'une étiquette (Tesseract, en français). Les modules (≈ 5 Mo) sont servis par notre domaine sous /ocr/ et
// téléchargés UNE fois, à la première lecture : cette étape demande donc internet la première fois ; le reste de l'appli n'en dépend jamais.
// La photo n'est ni enregistrée ni envoyée : elle est réduite, lue dans l'appareil, puis oubliée.

import { readMonthGrid, type GridMonths, type OcrWord } from './monthGrid'

export class OcrUnavailableError extends Error {
  constructor(message = 'La lecture d’étiquette demande une connexion internet la première fois (environ 5 Mo). Connectez-vous, puis réessayez.') {
    super(message)
    this.name = 'OcrUnavailableError'
  }
}

export type OcrStage = 'preparation' | 'telechargement' | 'lecture'

/** Étire les gris pour que le texte ressorte (étiquettes ternes ou brillantes) : percentiles 0,1 % et 99,9 % ramenés à 0 et 255 (le texte fin d’une étiquette pâle pèse bien moins de 2 % des points : 2 % l’écrasait). */
export function stretchGray(gray: Uint8ClampedArray | number[]): Uint8ClampedArray {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, Math.round(gray[i])))]++
  const total = gray.length
  const at = (q: number) => {
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= total * q) return v
    }
    return 255
  }
  const lo = at(0.001)
  const hi = at(0.999)
  const out = new Uint8ClampedArray(gray.length)
  if (hi - lo < 16) {
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] // image quasi uniforme : on ne touche à rien
    return out
  }
  const k = 255 / (hi - lo)
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * k
  return out
}

/**
 * Inclinaison des lignes de texte, en degrés (positif = les lignes descendent vers la droite). Une photo prise à la main est rarement droite,
 * et Tesseract perd les rangées de lettres d'un calendrier dès 4 ou 5 degrés. On cherche l'angle qui concentre le mieux les points sombres
 * en lignes (variance du profil des rangées) sur une image réduite ; sans gain net, 0.
 */
export function estimateSkewDeg(gray: Uint8ClampedArray | number[], w: number, h: number): number {
  const step = Math.max(1, Math.round(Math.max(w, h) / 500))
  const dark: number[] = []
  let sum = 0
  let n = 0
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    sum += gray[y * w + x]
    n++
  }
  const thr = (sum / n) * 0.6
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (gray[y * w + x] < thr) dark.push(x / step, y / step)
  if (dark.length < 400) return 0
  const score = (deg: number) => {
    const t = Math.tan((deg * Math.PI) / 180)
    const bins = new Float64Array(Math.ceil(h / step) * 2 + Math.ceil(w / step) + 8)
    const off = Math.ceil(w / step) + 4
    for (let i = 0; i < dark.length; i += 2) bins[Math.round(dark[i + 1] - dark[i] * t) + off]++
    let ss = 0
    for (const b of bins) ss += b * b
    return ss
  }
  const base = score(0)
  let best = 0
  let bestScore = base
  for (let d = -10; d <= 10; d += 1) {
    const sc = score(d)
    if (sc > bestScore) { bestScore = sc; best = d }
  }
  for (let d = best - 0.75; d <= best + 0.75; d += 0.25) {
    const sc = score(d)
    if (sc > bestScore) { bestScore = sc; best = d }
  }
  return Math.abs(best) >= 1 && bestScore > base * 1.12 ? best : 0
}

/** Photo réduite (1600 px au plus), en niveaux de gris contrastés : plus rapide et plus fiable à lire. */
export async function prepareImage(file: Blob, maxSide = 1600): Promise<HTMLCanvasElement> {
  return (await prepareImageWithColor(file, maxSide)).canvas
}

/** Comme `prepareImage`, avec en plus les couleurs d'origine (pour repérer les cases colorées d'un calendrier en grille). */
export async function prepareImageWithColor(file: Blob, maxSide = 1600): Promise<{ canvas: HTMLCanvasElement; color: ImageData }> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Cet appareil ne peut pas préparer la photo.')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const color = new ImageData(new Uint8ClampedArray(img.data), canvas.width, canvas.height)
    const gray = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) gray[j] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    const s = stretchGray(gray)
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) img.data[i] = img.data[i + 1] = img.data[i + 2] = s[j]
    ctx.putImageData(img, 0, 0)
    const skew = estimateSkewDeg(s, canvas.width, canvas.height)
    if (skew !== 0) {
      // Redresse l'image grise ET l'image en couleurs, de la même façon : les boîtes des mots restent valables pour les deux.
      const back = `rgb(${Math.round(s[0])},${Math.round(s[0])},${Math.round(s[0])})`
      const colorCanvas = document.createElement('canvas')
      colorCanvas.width = canvas.width
      colorCanvas.height = canvas.height
      colorCanvas.getContext('2d')!.putImageData(color, 0, 0)
      const rot = (src: HTMLCanvasElement, fill: string) => {
        const a = (-skew * Math.PI) / 180
        const W = Math.ceil(Math.abs(src.width * Math.cos(a)) + Math.abs(src.height * Math.sin(a)))
        const H = Math.ceil(Math.abs(src.width * Math.sin(a)) + Math.abs(src.height * Math.cos(a)))
        const out = document.createElement('canvas')
        out.width = W
        out.height = H
        const c = out.getContext('2d', { willReadFrequently: true })!
        c.fillStyle = fill
        c.fillRect(0, 0, W, H)
        c.translate(W / 2, H / 2)
        c.rotate(a)
        c.drawImage(src, -src.width / 2, -src.height / 2)
        return out
      }
      const corner = color.data
      const fillColor = `rgb(${corner[0]},${corner[1]},${corner[2]})`
      const rotated = rot(canvas, back)
      const rotColor = rot(colorCanvas, fillColor)
      const rc = rotColor.getContext('2d', { willReadFrequently: true })!
      return { canvas: rotated, color: rc.getImageData(0, 0, rotColor.width, rotColor.height) }
    }
    return { canvas, color }
  } finally {
    bitmap.close?.()
  }
}

/** Les modules sont-ils déjà gardés sur l'appareil (lecture possible hors ligne) ? */
export async function ocrReadyOffline(): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' && !!(await caches.match('/ocr/fra.traineddata.gz'))
  } catch {
    return false
  }
}

const STAGE_OF: Record<string, OcrStage> = {
  'loading tesseract core': 'telechargement',
  'initializing tesseract': 'telechargement',
  'loading language traineddata': 'telechargement',
  'initializing api': 'telechargement',
  'recognizing text': 'lecture',
}

/** Lit le texte d'une photo d'étiquette. Lève `OcrUnavailableError` hors ligne tant que les modules ne sont pas sur l'appareil. */
export async function readLabelText(file: Blob, onProgress?: (stage: OcrStage, ratio?: number) => void): Promise<string> {
  return (await readLabelData(file, onProgress)).text
}

/** Texte lu et, s'il y en a un, calendrier en grille (J F M A M J J A S O N D) : mois de semis et de récolte cochés. */
export interface LabelRead {
  text: string
  grid?: GridMonths
}

export async function readLabelData(file: Blob, onProgress?: (stage: OcrStage, ratio?: number) => void): Promise<LabelRead> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !(await ocrReadyOffline())) throw new OcrUnavailableError()
  onProgress?.('preparation')
  const { canvas, color } = await prepareImageWithColor(file)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('fra', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr',
    langPath: '/ocr',
    gzip: true,
    cacheMethod: 'none', // la mise en cache est faite par le service worker (règle « ocr-modules »)
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      const stage = STAGE_OF[m.status]
      if (stage) onProgress?.(stage, m.progress)
    },
  })
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true })
    let grid: GridMonths | undefined
    try {
      const words: OcrWord[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })))))
      grid = readMonthGrid(words, color)
    } catch {
      grid = undefined // la grille est un plus : le texte seul suffit
    }
    return { text: data.text, grid }
  } catch (e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OcrUnavailableError()
    throw e
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}
