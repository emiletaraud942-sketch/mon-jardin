// Calendrier en grille d'un sachet : une rangée de lettres « J F M A M J J A S O N D » (ou JAN FÉV MAR…), puis des rangées
// « Semis », « Récolte »… dont les mois sont des cases pleines ou cochées. Le texte lu ne dit pas QUELLES cases sont marquées :
// on repère les colonnes grâce aux mots de la rangée des mois (positions rendues par l'OCR), puis on regarde les pixels.
// Pur et testé (mots et image fournis). Un OCR et un regard sur les pixels se trompent : tout est proposé, rien n'est ajouté seul.

export interface OcrWord {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}
/** Image en couleurs (RGBA, comme `ImageData`), à la même échelle que les mots. */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8ClampedArray | number[]
}
export interface GridMonths {
  semis: number[]
  recolte: number[]
}

const LETTERS = 'JFMAMJJASOND'
const ABBR: Record<string, number> = { jan: 1, janv: 1, fev: 2, feb: 2, fevr: 2, mar: 3, mars: 3, avr: 4, apr: 4, mai: 5, may: 5, jun: 6, juin: 6, jul: 7, juil: 7, aou: 8, aug: 8, aout: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Line {
  words: OcrWord[]
  y0: number
  y1: number
}

/** Regroupe les mots en lignes d'après leur hauteur centrale. */
function toLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  const lines: Line[] = []
  for (const w of sorted) {
    const c = (w.y0 + w.y1) / 2
    const h = w.y1 - w.y0
    const l = lines.find((x) => Math.abs((x.y0 + x.y1) / 2 - c) < Math.max(h, x.y1 - x.y0) * 0.45)
    if (l) {
      l.words.push(w)
      l.y0 = Math.min(l.y0, w.y0)
      l.y1 = Math.max(l.y1, w.y1)
    } else lines.push({ words: [w], y0: w.y0, y1: w.y1 })
  }
  for (const l of lines) l.words.sort((a, b) => a.x0 - b.x0)
  return lines
}

const editDistance = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export interface Columns {
  /** Abscisse du centre de la colonne du mois m (1 à 12). */
  xOf: (m: number) => number
  pitch: number
  /** Bas de la rangée des mois. */
  bottom: number
  top: number
}

/** Colonnes d'après la rangée des mois : 12 lettres (collées ou non) ou des abréviations en mots. */
export function findColumns(words: OcrWord[]): Columns | undefined {
  for (const line of toLines(words)) {
    const h = line.y1 - line.y0
    // 1. Abréviations : JAN FÉV MAR…
    const abbr = line.words.map((w) => ({ w, m: ABBR[fold(w.text).replace(/[^a-z]/g, '')] })).filter((x) => x.m)
    if (abbr.length >= 9 && new Set(abbr.map((a) => a.m)).size >= 9) {
      const pts = abbr.map((a) => ({ m: a.m!, x: (a.w.x0 + a.w.x1) / 2 }))
      const n = pts.length
      const mx = pts.reduce((s, p) => s + p.m, 0) / n
      const my = pts.reduce((s, p) => s + p.x, 0) / n
      const den = pts.reduce((s, p) => s + (p.m - mx) ** 2, 0)
      const pitch = pts.reduce((s, p) => s + (p.m - mx) * (p.x - my), 0) / den
      if (pitch > 0) return { xOf: (m) => my + (m - mx) * pitch, pitch, top: line.y0, bottom: line.y1 }
    }
    // 2. Lettres : « J FMAMJ J ASOND », « J F M A M J J A S O N D »…
    const letters = line.words.map((w) => w.text.toUpperCase().replace(/[^A-Z]/g, ''))
    const joined = letters.join('')
    if (joined.length < 10 || joined.length > 14 || editDistance(joined, LETTERS) > 3) continue
    const first = line.words[letters.findIndex((l) => l.length > 0)]
    const last = line.words[letters.length - 1 - [...letters].reverse().findIndex((l) => l.length > 0)]
    const lw = Math.max(4, h * 0.7) // largeur d'une lettre
    const nFirst = letters.find((l) => l.length > 0)!.length
    const nLast = [...letters].reverse().find((l) => l.length > 0)!.length
    // centre de la 1re lettre du 1er mot, de la dernière du dernier mot
    const c0 = nFirst === 1 ? (first.x0 + first.x1) / 2 : first.x0 + lw / 2
    const c11 = nLast === 1 ? (last.x0 + last.x1) / 2 : last.x1 - lw / 2
    // si des lettres manquent ou s'ajoutent, on suppose tout de même 12 colonnes régulières entre la 1re et la dernière
    const pitch = (c11 - c0) / 11
    if (pitch > lw * 0.8) return { xOf: (m) => c0 + (m - 1) * pitch, pitch, top: line.y0, bottom: line.y1 }
  }
  return undefined
}

const SOW_WORDS = ['semis', 'semer', 'sow', 'sowing', 'plantation', 'planting']
const HARVEST_WORDS = ['recolte', 'recoltes', 'recolter', 'harvest', 'harvesting', 'cueillette']
/** Le mot est-il (à peu près) l'un de ceux-là ? Un OCR écrit « Récoite » ou « Kécoue » : 40 % d'erreurs tolérées sur les mots de 6 lettres et plus. */
function looksLike(word: string, targets: string[]): boolean {
  const w = fold(word).replace(/[^a-z]/g, '')
  if (w.length < 3) return false
  return targets.some((t) => w.startsWith(t) || (t.length >= 6 && w.length >= 5 && editDistance(w, t) <= Math.floor(t.length * 0.45)) || (t.length < 6 && w === t))
}
const isSow = (w: string) => looksLike(w, SOW_WORDS)
const isHarvest = (w: string) => looksLike(w, HARVEST_WORDS)

/** Mois cochés ou colorés de chaque rangée « semis » et « récolte » d'un calendrier en grille ; rien si la grille n'est pas reconnue. */
export function readMonthGrid(words: OcrWord[], img: RgbaImage): GridMonths | undefined {
  const cols = findColumns(words)
  if (!cols) return undefined
  const { xOf, pitch } = cols
  const left = xOf(1) - pitch * 0.5
  const out: GridMonths = { semis: [], recolte: [] }
  let rows = 0
  const px = (x: number, y: number): [number, number, number] => {
    const i = (Math.round(y) * img.width + Math.round(x)) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  /** Couleur médiane d'une zone (le fond). */
  const median = (x0: number, x1: number, y0: number, y1: number): [number, number, number] => {
    const r: number[] = []
    const g: number[] = []
    const b: number[] = []
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(img.height - 1, Math.ceil(y1)); y += 2)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(img.width - 1, Math.ceil(x1)); x += 2) {
        const p = px(x, y)
        r.push(p[0])
        g.push(p[1])
        b.push(p[2])
      }
    const m = (a: number[]) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255)
    return [m(r), m(g), m(b)]
  }
  for (const line of toLines(words)) {
    if (line.y0 < cols.bottom - 2) continue // seulement sous la rangée des mois
    // L'étiquette de la rangée : un mot à gauche de la 1re colonne.
    const label = line.words.find((w) => w.x1 <= left + pitch * 0.2 && (isSow(w.text) || isHarvest(w.text)))
    if (!label) continue
    const kind = isSow(label.text) ? 'semis' : 'recolte'
    const cy = (label.y0 + label.y1) / 2
    const hh = Math.max(3, (label.y1 - label.y0) * 0.3)
    const halfW = pitch * 0.28
    // Fond : à droite de la grille (sinon à gauche, entre l'étiquette et la 1re colonne).
    const rx = xOf(12) + pitch * 0.9
    const bg = rx + halfW < img.width ? median(rx - halfW, rx + halfW, cy - hh, cy + hh) : median(label.x1 + 4, left - 2, cy - hh, cy + hh)
    const on: number[] = []
    for (let m = 1; m <= 12; m++) {
      const cx = xOf(m)
      let solid = 0
      let dark = 0
      let n = 0
      for (let y = cy - hh; y <= cy + hh; y += 1)
        for (let x = cx - halfW; x <= cx + halfW; x += 1) {
          if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
          const d = dist(px(x, y), bg)
          n++
          if (d > 30) solid++
          if (d > 90) dark++
        }
      if (n && (solid / n >= 0.4 || dark / n >= 0.05)) on.push(m)
    }
    rows++
    out[kind] = [...new Set([...out[kind], ...on])].sort((a, b) => a - b)
  }
  return rows > 0 && (out.semis.length || out.recolte.length) ? out : undefined
}
