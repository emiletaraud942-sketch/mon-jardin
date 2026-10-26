// Réglage « Qualité 3D » : Auto / Simple / Détaillé, mémorisé dans localStorage (aucune migration : simple préférence d'interface).
// Auto s'appuie sur le matériel (cœurs, mémoire) puis sur la fréquence d'images mesurée pendant les mouvements de caméra.
import { useSyncExternalStore } from 'react'

export type QualityPref = 'auto' | 'simple' | 'detaille'
/** Niveau maximal de détail des modèles de plantes : 0 = simple, 1 = moyen, 2 = détaillé. */
export type QualityTier = 0 | 1 | 2

export const QUALITY_KEY = 'pj.quality3d'
export const QUALITY_PREFS: { id: QualityPref; label: string; title: string }[] = [
  { id: 'auto', label: 'Auto', title: 'Choisit selon votre téléphone et la fluidité mesurée' },
  { id: 'simple', label: 'Simple', title: 'Formes légères : le plus fluide' },
  { id: 'detaille', label: 'Détaillé', title: 'Feuillage, branches et ombres plus fins' },
]

export function parseQualityPref(raw: string | null | undefined): QualityPref {
  return raw === 'simple' || raw === 'detaille' || raw === 'auto' ? raw : 'auto'
}

/** Plafond de triangles dessinés pour les plantes, selon le niveau. */
export const TRIANGLE_CAP: Record<QualityTier, number> = { 0: 90000, 1: 120000, 2: 150000 }

export interface HardwareInfo {
  cores?: number
  memoryGb?: number
}

/** Niveau choisi par Auto d'après le matériel, puis abaissé si la fréquence d'images mesurée est faible. */
export function autoTier(hw: HardwareInfo, fps?: number): QualityTier {
  const cores = hw.cores
  const mem = hw.memoryGb
  let tier: QualityTier = 1
  if ((cores != null && cores <= 4) || (mem != null && mem <= 2)) tier = 0
  else if ((cores != null && cores >= 8) && (mem == null || mem >= 6)) tier = 2
  if (fps != null && Number.isFinite(fps)) {
    if (fps < 20) tier = 0
    else if (fps < 30 && tier > 1) tier = 1
  }
  return tier
}

export function resolveTier(pref: QualityPref, hw: HardwareInfo, fps?: number): QualityTier {
  if (pref === 'simple') return 0
  if (pref === 'detaille') return 2
  return autoTier(hw, fps)
}

export function readHardware(): HardwareInfo {
  if (typeof navigator === 'undefined') return {}
  const n = navigator as Navigator & { deviceMemory?: number }
  return { cores: n.hardwareConcurrency, memoryGb: n.deviceMemory }
}

// ---------- Fréquence d'images mesurée ----------

const WINDOW = 40
const MIN_SAMPLES = 24
/** Mesure sur les images consécutives : les écarts longs (rendu à la demande, onglet masqué) sont ignorés. */
export function createFpsMeter() {
  const dts: number[] = []
  return {
    push(dtMs: number) {
      if (!(dtMs > 2) || dtMs > 250) return
      dts.push(dtMs)
      if (dts.length > WINDOW) dts.shift()
    },
    /** Images par seconde (médiane), ou undefined tant que l'échantillon est trop petit. */
    fps(): number | undefined {
      if (dts.length < MIN_SAMPLES) return undefined
      const s = [...dts].sort((a, b) => a - b)
      return 1000 / s[Math.floor(s.length / 2)]
    },
    reset() {
      dts.length = 0
    },
  }
}

// ---------- Mémoire du réglage ----------

let pref: QualityPref = (() => {
  try {
    return parseQualityPref(localStorage.getItem(QUALITY_KEY))
  } catch {
    return 'auto'
  }
})()
/** Dégradation décidée par la mesure (jamais remontée dans la session : évite le va-et-vient). */
let measuredFps: number | undefined
const meter = createFpsMeter()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

export function getQualityPref(): QualityPref {
  return pref
}
export function setQualityPref(p: QualityPref): void {
  pref = p
  meter.reset()
  measuredFps = undefined
  try {
    localStorage.setItem(QUALITY_KEY, p)
  } catch {
    /* stockage indisponible : le réglage ne dure que pour cette session */
  }
  emit()
}

/** À appeler à chaque image rendue (intervalle en ms depuis l'image précédente). */
export function reportFrameInterval(dtMs: number): void {
  meter.push(dtMs)
  const f = meter.fps()
  if (f == null) return
  // On ne retient que les mesures qui abaissent le niveau, et seulement en Auto.
  if (pref === 'auto' && f < 30 && (measuredFps == null || f < measuredFps - 4)) {
    const before = autoTier(readHardware(), measuredFps)
    measuredFps = f
    if (autoTier(readHardware(), measuredFps) !== before) emit()
  }
}
export function lastMeasuredFps(): number | undefined {
  return meter.fps() ?? measuredFps
}

export function currentTier(): QualityTier {
  return resolveTier(pref, readHardware(), measuredFps)
}

export interface QualityState {
  pref: QualityPref
  tier: QualityTier
  setPref: (p: QualityPref) => void
}
let cached: { v: number; s: QualityState } | null = null
function snapshot(): QualityState {
  if (!cached || cached.v !== version) cached = { v: version, s: { pref, tier: currentTier(), setPref: setQualityPref } }
  return cached.s
}
export function useQuality3D(): QualityState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    snapshot,
    snapshot,
  )
}

export const TIER_LABEL: Record<QualityTier, string> = { 0: 'simple', 1: 'moyen', 2: 'détaillé' }
