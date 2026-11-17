import { SPECIES } from '../data/species'
import { normalizeSearch } from '../data/species/search'
import type { PurchaseForm, Species } from '../types'
import { englishNamesOf } from './englishNames'

// Texte lu sur une étiquette de pépinière → ce qu'on sait en tirer (forme, hauteur, prix, plante). Pur et testé.
// Rien n'est enregistré sans que la personne ait vu et corrigé le résultat : un OCR se trompe.

export interface LabelFacts {
  form?: PurchaseForm
  heightCm?: number
  priceEur?: number
  /** Lignes utiles de l'étiquette (nom latin, variété) : proposées comme note. */
  noteLines: string[]
  /** Espèce du catalogue reconnue dans le texte, si une seule se détache. */
  speciesId?: string
}

const clean = (t: string) => t.replace(/[|_~]/g, ' ').replace(/\s+/g, ' ').trim()

/** Hauteur en cm : « 100-120 cm » (milieu), « H 150 », « 1,20 m », « 80/100 ». */
export function parseHeightCm(text: string): number | undefined {
  const t = text.replace(/,/g, '.')
  const range = /(\d{2,3})\s*(?:-|–|\/|à)\s*(\d{2,3})\s*cm/i.exec(t)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (a > 0 && b >= a && b <= 1000) return Math.round((a + b) / 2)
  }
  const cm = /(?:\bh\.?\s*|(?:hauteur|height|tall)\s*:?\s*)(\d{2,3})\s*(?:cm)?\b/i.exec(t) ?? /\b(\d{2,3})\s*cm\b/i.exec(t)
  if (cm) {
    const n = Number(cm[1])
    if (n >= 5 && n <= 1000) return n
  }
  const m = /\b(\d(?:\.\d{1,2})?)\s*m\b/i.exec(t)
  if (m) {
    const n = Math.round(Number(m[1]) * 100)
    if (n >= 20 && n <= 1000) return n
  }
  return undefined
}

export function parsePriceEur(text: string): number | undefined {
  // Ligne par ligne : « C3 » sur une ligne et « € 14,90 » sur la suivante ne doivent pas se mélanger.
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/\s+/g, ' ').replace(/,/g, '.')
    const cents = /(?<![\d.])(\d{1,4})\s?€\s?(\d{2})(?!\d)/.exec(t) // 5€90
    const m = cents ?? /(?<![\d.])(\d{1,4}(?:\.\d{1,2})?)\s*(?:€|(?<![a-z])eur\b|(?<![a-z])euros?\b)/i.exec(t) ?? /(?:€|(?<![a-z])eur\b)\s*(\d{1,4}(?:\.\d{1,2})?)(?![\d.])/i.exec(t)
    if (!m) continue
    const n = cents ? Number(`${m[1]}.${m[2]}`) : Number(m[1])
    if (n > 0 && n <= 10_000) return n
  }
  return undefined
}

/** Forme d'achat d'après les mots de l'étiquette. L'ordre compte : « demi-tige » avant « tige ». */
export function parseForm(text: string): PurchaseForm | undefined {
  const t = normalizeSearch(text)
  // Les formes d'arbre (scion, baliveau, demi-tige, haute-tige) disent plus que le conditionnement (racines nues, motte, pot) :
  // « demi-tige, racines nues » donne demi-tige.
  if (/demi[- ]?tige|1\/2 ?tige|1\/2t/.test(t)) return 'demi-tige'
  if (/haute[- ]?tige|\bh\.?t\.?\b/.test(t)) return 'haute-tige'
  if (/\bscions?\b/.test(t)) return 'scion'
  if (/\bbaliveaux?\b/.test(t)) return 'baliveau'
  if (/\bracines? nues?\b|\bbare[- ]?roots?\b|\br\.?n\.?\b(?! ?\d)/.test(t)) return 'racines-nues'
  if (/\bmotte\b|en motte/.test(t)) return 'motte'
  if (/\bgodet\b|\bpot\b|\bpotted\b|conteneur|\bc ?\d{1,2}\b|\bcontainer\b/.test(t)) return 'godet'
  if (/\bgraines?\b|\bsachet\b/.test(t)) return 'graine'
  return undefined
}

/** Espèce du catalogue la plus nettement présente dans le texte (nom latin complet, nom usuel, alias), ou undefined. */
export function findSpeciesInText(text: string, species: readonly Species[] = SPECIES): Species | undefined {
  const t = ` ${normalizeSearch(text)} `
  let best: { s: Species; score: number } | undefined
  let tie = false
  for (const s of species) {
    const names = [...[s.nomLatin, s.nomCommun, ...(s.alias ?? [])].map(normalizeSearch), ...englishNamesOf(s.id)].filter((n) => n.length >= 4)
    let score = 0
    for (const n of names) if (t.includes(` ${n} `) || t.includes(` ${n}s `)) score = Math.max(score, n.length + (n === normalizeSearch(s.nomLatin) ? 20 : 0))
    if (!score) continue
    if (!best || score > best.score) {
      best = { s, score }
      tie = false
    } else if (score === best.score) tie = true
  }
  return best && !tie ? best.s : undefined
}

/** Lignes qui ressemblent à un nom latin ou à une variété (« Malus domestica », ‘Reine des reinettes’). */
function noteLinesOf(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    const latin = /\b[A-Z][a-z]{3,}\s(?:x\s)?[a-z]{3,}\b/.test(l)
    const variety = /['‘’"«»]\s?\S[^'‘’"«»]{2,40}\S\s?['‘’"«»]|\bvar\.|\bcv\.|variété/i.test(l)
    if ((latin || variety) && l.length <= 80) out.push(l)
  }
  return out.slice(0, 3)
}

export function parseLabel(rawText: string): LabelFacts {
  const lines = rawText
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => l.length >= 3)
  const text = lines.join('\n')
  const facts: LabelFacts = { noteLines: noteLinesOf(lines) }
  const form = parseForm(text)
  if (form) facts.form = form
  const height = parseHeightCm(text)
  if (height) facts.heightCm = height
  const price = parsePriceEur(text)
  if (price !== undefined) facts.priceEur = price
  const sp = findSpeciesInText(text)
  if (sp) facts.speciesId = sp.id
  return facts
}
