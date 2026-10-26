// Recalage GPS : similitude 2D (rotation + échelle + translation) en mètres locaux. Pur, sans DOM.
// Convention de src/lib/geo.ts : x = est, y = nord. x' = a·x − b·y + tx ; y' = b·x + a·y + ty.

export type Calibration = { a: number; b: number; tx: number; ty: number; rmsM: number; n: number }

export type CalibrationPoint = { measured: { x: number; y: number }; truth: { x: number; y: number } }

type XY = { x: number; y: number }

export const CALIBRATION_SCALE_MIN = 0.8
export const CALIBRATION_SCALE_MAX = 1.25
const MIN_SPREAD_M = 2

const finite = (p: XY) => Number.isFinite(p.x) && Number.isFinite(p.y)

/** Échelle d'une calibration (module de a + ib). */
export const calibrationScale = (c: { a: number; b: number }) => Math.hypot(c.a, c.b)

/** Vrai si les nombres sont finis et l'échelle bornée. */
export function isValidCalibration(c: Calibration): boolean {
  if (![c.a, c.b, c.tx, c.ty, c.rmsM, c.n].every(Number.isFinite)) return false
  const s = calibrationScale(c)
  return s >= CALIBRATION_SCALE_MIN && s <= CALIBRATION_SCALE_MAX
}

/** Applique une similitude à un point (sans test de validité). */
function transform(c: { a: number; b: number; tx: number; ty: number }, p: XY): XY {
  return { x: c.a * p.x - c.b * p.y + c.tx, y: c.b * p.x + c.a * p.y + c.ty }
}

/** Ajuste la similitude measured → truth (moindres carrés fermés). null si insuffisant, dégénéré ou hors bornes. */
export function fitCalibration(points: CalibrationPoint[]): Calibration | null {
  const pts = points.filter((p) => finite(p.measured) && finite(p.truth))
  const n = pts.length
  if (n < 1) return null
  const cu = { x: pts.reduce((s, p) => s + p.measured.x, 0) / n, y: pts.reduce((s, p) => s + p.measured.y, 0) / n }
  const cv = { x: pts.reduce((s, p) => s + p.truth.x, 0) / n, y: pts.reduce((s, p) => s + p.truth.y, 0) / n }

  let a = 1
  let b = 0
  if (n >= 2) {
    // Dispersion mutuelle moyenne des points mesurés.
    let sum = 0
    let pairs = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        sum += Math.hypot(pts[i].measured.x - pts[j].measured.x, pts[i].measured.y - pts[j].measured.y)
        pairs++
      }
    }
    if (sum / pairs < MIN_SPREAD_M) return null
    let s = 0
    let dot = 0
    let cross = 0
    for (const p of pts) {
      const ux = p.measured.x - cu.x
      const uy = p.measured.y - cu.y
      const vx = p.truth.x - cv.x
      const vy = p.truth.y - cv.y
      s += ux * ux + uy * uy
      dot += ux * vx + uy * vy
      cross += ux * vy - uy * vx
    }
    if (s <= 0) return null
    a = dot / s
    b = cross / s
  }
  const scale = Math.hypot(a, b)
  if (!(scale >= CALIBRATION_SCALE_MIN && scale <= CALIBRATION_SCALE_MAX)) return null
  const tx = cv.x - (a * cu.x - b * cu.y)
  const ty = cv.y - (b * cu.x + a * cu.y)
  const c = { a, b, tx, ty }
  const sq = pts.reduce((s, p) => {
    const q = transform(c, p.measured)
    return s + (q.x - p.truth.x) ** 2 + (q.y - p.truth.y) ** 2
  }, 0)
  return { ...c, rmsM: Math.sqrt(sq / n), n }
}

/** Corrige un point mesuré. Identité si pas de calibration. */
export function applyCalibration(c: Calibration | null | undefined, p: XY): XY {
  if (!c) return { x: p.x, y: p.y }
  return transform(c, p)
}

/** Moyenne pondérée (1/précision²) de relevés GPS, avec rejet des valeurs à plus de 2,5 écarts-types. */
export function averageFixes(fixes: { x: number; y: number; accuracy?: number }[]): { x: number; y: number; spreadM: number } {
  const valid = fixes.filter(finite)
  if (valid.length === 0) return { x: 0, y: 0, spreadM: Infinity }
  const weight = (f: { accuracy?: number }) => {
    const acc = f.accuracy !== undefined && Number.isFinite(f.accuracy) && f.accuracy > 0 ? f.accuracy : 10
    return 1 / (acc * acc)
  }
  const mean = (list: typeof valid) => {
    let w = 0
    let x = 0
    let y = 0
    for (const f of list) {
      const k = weight(f)
      w += k
      x += f.x * k
      y += f.y * k
    }
    return { x: x / w, y: y / w }
  }
  const rms = (list: typeof valid, m: XY) => Math.sqrt(list.reduce((s, f) => s + (f.x - m.x) ** 2 + (f.y - m.y) ** 2, 0) / list.length)

  let kept = valid
  let m = mean(kept)
  if (kept.length >= 4) {
    const sigma = rms(kept, m)
    if (sigma > 0) {
      const inl = kept.filter((f) => Math.hypot(f.x - m.x, f.y - m.y) <= 2.5 * sigma)
      if (inl.length >= 2 && inl.length < kept.length) {
        kept = inl
        m = mean(kept)
      }
    }
  }
  return { x: m.x, y: m.y, spreadM: rms(kept, m) }
}

/** Qualité d'un relevé GPS d'après sa précision annoncée (m). */
export function gpsQuality(accuracyM: number): 'bonne' | 'moyenne' | 'faible' {
  if (accuracyM <= 5) return 'bonne'
  if (accuracyM <= 12) return 'moyenne'
  return 'faible'
}

/** Décalage (m) vers où pointe le téléphone. Cap 0 = nord, sens horaire (90 = est). */
export function headingToOffset(headingDeg: number, distanceM: number): { x: number; y: number } {
  const r = (headingDeg * Math.PI) / 180
  return { x: distanceM * Math.sin(r), y: distanceM * Math.cos(r) }
}
