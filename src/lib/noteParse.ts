import type { PlantPurchase, PurchaseForm } from '../types'
import { parseForm, parseHeightCm, parsePriceEur } from './labelParse'

// Note libre de la fiche plante -> informations d'achat proposées. Pur et testé (noteParse.test.ts).
// Ce sont des règles de lecture de mots, pas de la compréhension : la personne voit toujours ce qui a été trouvé et choisit.

export interface NoteFacts {
  form?: PurchaseForm
  heightCm?: number
  priceEur?: number
  shop?: string
  boughtAt?: string
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Hauteur : « 120 cm », « 100-120 cm », ou un mètre précédé d'un mot (« mesurait 1,20 m », « hauteur 1,5 m »).
 * Un mètre seul n'est jamais pris (« plantée à 2 m de la clôture » n'est pas une hauteur).
 */
export function noteHeightCm(text: string): number | undefined {
  const t = text.replace(/,/g, '.')
  const kw = /(?:hauteur|haut(?:e)? de|mesur\w*|fai(?:s|t|sait)\w*|taille|\bh\.?)\s*(?:d'environ|environ|de|:)?\s*(\d(?:\.\d{1,2})?)\s*m\b(?!m)/i.exec(t)
  if (kw) {
    const n = Math.round(Number(kw[1]) * 100)
    if (n >= 20 && n <= 1000) return n
  }
  return parseHeightCm(t.replace(/\b\d(?:\.\d{1,2})?\s*m\b/gi, ' '))
}

/** Date d'achat complète seulement : 2024-03-12, 12/03/2024, 12 mars 2024. Jamais une date inventée ni dans le futur. */
export function noteDate(text: string, now: Date = new Date()): string | undefined {
  const t = plain(text)
  let y: number | undefined
  let m: number | undefined
  let d: number | undefined
  let r = /\b(20\d{2}|19\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t)
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((r = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|19\d{2})\b/.exec(t))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((r = new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')})\\s+(20\\d{2}|19\\d{2})\\b`).exec(t))) [d, m, y] = [Number(r[1]), MONTHS.indexOf(r[2]) + 1, Number(r[3])]
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined
  if (date.getTime() > now.getTime()) return undefined
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const SHOP_WORDS = 'pépinière|pepiniere|jardinerie|marché|marche|supermarché|supermarche|animalerie|grande surface|brocante|vide-grenier|producteur|voisin|voisine|ami|amie|cousin|cousine|mon père|ma mère|ma mere|mon pere'
/** Lieu d'achat : « acheté chez Truffaut », « pris à la pépinière du Moulin », « reçu d'un voisin ». */
export function noteShop(text: string): string | undefined {
  const t = text.replace(/\s+/g, ' ')
  // Le verbe se cherche sans tenir compte des majuscules ; le nom propre, lui, doit en avoir une.
  const verb = /(?:achet|pris|command|trouv|re[cç]u|donn|offert)[a-zà-ÿ]*/i.exec(t)
  if (!verb) return undefined
  const rest = t.slice(verb.index + verb[0].length).split(/[.;\n]/)[0]
  const cap = "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*(?:\\s+(?:(?:de|du|des|la|le|les)\\s+|d['’])?[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]*){0,3}"
  const named = new RegExp(`^.{0,25}?(?:^|\\s)(?:chez|à|au|aux)\\s+(${cap})`).exec(rest)
  if (named) return named[1].trim().slice(0, 60)
  const generic = new RegExp(`^.{0,25}?(?:^|\\s)(?:chez|à|au|aux|d['’]un|d['’]une|de la|du)\\s+((?:la\\s+|le\\s+|l['’])?(?:${SHOP_WORDS})(?:\\s+(?:de|du|des|d['’])?\\s*[A-Za-zÀ-ÿ'’-]+){0,3})`, 'i').exec(rest)
  if (generic) return generic[1].replace(/\s+(?:et|mais|puis|il|elle|c['’]était)\b.*$/i, '').trim().slice(0, 60)
  return undefined
}

/** Ce qu'on peut tirer de la note : forme d'achat, hauteur, prix, lieu, date. Les champs absents ne sont pas renvoyés. */
export function parseNote(text: string, now: Date = new Date()): NoteFacts {
  const facts: NoteFacts = {}
  const form = parseForm(text)
  if (form) facts.form = form
  const height = noteHeightCm(text)
  if (height) facts.heightCm = height
  const price = parsePriceEur(text)
  if (price !== undefined) facts.priceEur = price
  const shop = noteShop(text)
  if (shop) facts.shop = shop
  const date = noteDate(text, now)
  if (date) facts.boughtAt = date
  return facts
}

/** Fusion : les informations trouvées dans la note complètent ou remplacent celles de l'achat (la note libre reste telle quelle). */
export function mergePurchase(current: PlantPurchase | undefined, facts: NoteFacts): PlantPurchase {
  const base = { ...(current ?? {}) }
  delete base.skipped
  return { ...base, ...facts }
}

export const hasFacts = (f: NoteFacts) => Object.keys(f).length > 0
