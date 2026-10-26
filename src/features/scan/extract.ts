import { judgeFrame } from './frameQuality'
import { frameTimes } from './videoLog'

// Extraction d'images dans le navigateur : <video> + <canvas>. Rien n'est envoyé.
// Une image redessinée sur un canvas puis ré-encodée en JPEG perd ses métadonnées (EXIF, GPS), comme pour les photos.

/** Plus grand côté d'une image gardée (px). */
export const MAX_SIDE = 1024
/** Plus grand côté de l'image d'analyse (px) : assez pour juger le flou, assez petit pour un téléphone modeste. */
const ANALYSIS_SIDE = 256

export interface Candidate {
  /** Instant dans la vidéo (s), ou depuis le début de la prise (flux direct). */
  t: number
  blob: Blob
  sharpness: number
}

export type Skipped = 'floue' | 'sans-plante'

/** Dessine l'image courante d'un <video> et la juge. `undefined` si elle est écartée (la raison est donnée à `onSkip`). */
export async function grabFrame(video: HTMLVideoElement, t: number, onSkip: (why: Skipped) => void): Promise<Candidate | undefined> {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return undefined
  const small = document.createElement('canvas')
  const k = ANALYSIS_SIDE / Math.max(vw, vh)
  small.width = Math.max(8, Math.round(vw * k))
  small.height = Math.max(8, Math.round(vh * k))
  const sctx = small.getContext('2d', { willReadFrequently: true })
  if (!sctx) return undefined
  sctx.drawImage(video, 0, 0, small.width, small.height)
  const verdict = judgeFrame(sctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height)
  if (!verdict.ok) {
    onSkip(verdict.reason)
    return undefined
  }
  const big = document.createElement('canvas')
  const s = Math.min(1, MAX_SIDE / Math.max(vw, vh))
  big.width = Math.round(vw * s)
  big.height = Math.round(vh * s)
  big.getContext('2d')?.drawImage(video, 0, 0, big.width, big.height)
  const blob = await new Promise<Blob | null>((res) => big.toBlob(res, 'image/jpeg', 0.8))
  small.width = small.height = big.width = big.height = 0 // libère la mémoire tout de suite
  return blob ? { t, blob, sharpness: verdict.sharpness } : undefined
}

const seekTo = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup()
      resolve()
    }
    const ko = () => {
      cleanup()
      reject(new Error('Vidéo illisible.'))
    }
    const timer = window.setTimeout(ko, 8000)
    const cleanup = () => {
      window.clearTimeout(timer)
      v.removeEventListener('seeked', ok)
      v.removeEventListener('error', ko)
    }
    v.addEventListener('seeked', ok)
    v.addEventListener('error', ko)
    v.currentTime = t
  })

export interface ExtractResult {
  frames: Candidate[]
  /** Images écartées, par raison. */
  skipped: Record<Skipped, number>
  durationS: number
}

/**
 * Tire des images d'un fichier vidéo : une toutes les `everyS` secondes, au plus `max`.
 * Les images floues ou sans végétation sont écartées. `onProgress(fait, total)` pour l'écran.
 */
export async function extractFrames(file: Blob, opts: { everyS?: number; max?: number; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<ExtractResult> {
  const { everyS = 2, max = 30, signal, onProgress } = opts
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Vidéo illisible : format non pris en charge sur ce téléphone.')), 15000)
      v.onloadeddata = () => {
        window.clearTimeout(timer)
        resolve()
      }
      v.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('Vidéo illisible : format non pris en charge sur ce téléphone.'))
      }
    })
    const duration = Number.isFinite(v.duration) ? v.duration : 0
    const times = frameTimes(duration, everyS, 120) // on regarde large, puis on garde les `max` meilleures
    const frames: Candidate[] = []
    const skipped: Record<Skipped, number> = { floue: 0, 'sans-plante': 0 }
    for (let i = 0; i < times.length; i++) {
      if (signal?.aborted) break
      await seekTo(v, times[i])
      const c = await grabFrame(v, times[i], (why) => skipped[why]++)
      if (c) frames.push(c)
      onProgress?.(i + 1, times.length)
      if (frames.length >= max) break
    }
    return { frames, skipped, durationS: duration }
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}
