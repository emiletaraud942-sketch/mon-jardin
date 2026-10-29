// Lecture du texte d'une étiquette (Tesseract, en français). Les modules (≈ 5 Mo) sont servis par notre domaine sous /ocr/ et
// téléchargés UNE fois, à la première lecture : cette étape demande donc internet la première fois ; le reste de l'appli n'en dépend jamais.
// La photo n'est ni enregistrée ni envoyée : elle est réduite, lue dans l'appareil, puis oubliée.

export class OcrUnavailableError extends Error {
  constructor(message = 'La lecture d’étiquette demande une connexion internet la première fois (environ 5 Mo). Connectez-vous, puis réessayez.') {
    super(message)
    this.name = 'OcrUnavailableError'
  }
}

export type OcrStage = 'preparation' | 'telechargement' | 'lecture'

/** Étire les gris pour que le texte ressorte (étiquettes ternes ou brillantes) : percentiles 2 % et 98 % ramenés à 0 et 255. */
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
  const lo = at(0.02)
  const hi = at(0.98)
  const out = new Uint8ClampedArray(gray.length)
  if (hi - lo < 16) {
    for (let i = 0; i < gray.length; i++) out[i] = gray[i] // image quasi uniforme : on ne touche à rien
    return out
  }
  const k = 255 / (hi - lo)
  for (let i = 0; i < gray.length; i++) out[i] = (gray[i] - lo) * k
  return out
}

/** Photo réduite (1600 px au plus), en niveaux de gris contrastés : plus rapide et plus fiable à lire. */
export async function prepareImage(file: Blob, maxSide = 1600): Promise<HTMLCanvasElement> {
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
    const gray = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) gray[j] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    const s = stretchGray(gray)
    for (let i = 0, j = 0; i < img.data.length; i += 4, j++) img.data[i] = img.data[i + 1] = img.data[i + 2] = s[j]
    ctx.putImageData(img, 0, 0)
    return canvas
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !(await ocrReadyOffline())) throw new OcrUnavailableError()
  onProgress?.('preparation')
  const canvas = await prepareImage(file)
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
    const { data } = await worker.recognize(canvas)
    return data.text
  } catch (e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OcrUnavailableError()
    throw e
  } finally {
    await worker.terminate().catch(() => undefined)
  }
}
