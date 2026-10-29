import type { Plant, PlantPurchase, PurchaseForm, Species } from '../types'
import { addMeasurement } from './measure'

// Achat et plantation : formes d'achat, âge et hauteur estimés, conseil de mesure. Pur, testé dans purchase.test.ts.

export interface PurchaseFormInfo {
  id: PurchaseForm
  label: string
  /** Une phrase pour reconnaître la forme (à lire en magasin ou sur l'étiquette). */
  hint: string
}

export const PURCHASE_FORMS: readonly PurchaseFormInfo[] = [
  { id: 'graine', label: 'Graines', hint: 'Semées en place ou en godet.' },
  { id: 'godet', label: 'Godet ou pot', hint: 'Jeune plant en petit pot, avec sa terre.' },
  { id: 'motte', label: 'Motte', hint: 'Plante vendue avec sa terre, souvent dans une toile.' },
  { id: 'racines-nues', label: 'Racines nues', hint: 'Sans terre, vendue en hiver, plantée à l’automne ou en fin d’hiver.' },
  { id: 'scion', label: 'Scion', hint: 'Jeune arbre d’un an : une tige d’environ 1 m, sans branches.' },
  { id: 'baliveau', label: 'Baliveau', hint: 'Arbre de 2 ans : une tige droite avec ses premières branches.' },
  { id: 'demi-tige', label: 'Demi-tige', hint: 'Tronc de 1,2 à 1,5 m avant les premières branches.' },
  { id: 'haute-tige', label: 'Haute-tige', hint: 'Tronc de 1,8 m ou plus avant les premières branches.' },
]

export const purchaseFormLabel = (f: PurchaseForm | undefined): string => PURCHASE_FORMS.find((x) => x.id === f)?.label ?? ''

/** Arbres (canopée, petit arbre) : les formes scion, baliveau, demi-tige et haute-tige n'ont de sens que pour eux. */
export const isTree = (sp: Pick<Species, 'strate'> | undefined): boolean => !!sp && (sp.strate === 'canopee' || sp.strate === 'arbre-bas')

/** Formes proposées pour une espèce : les arbres ont tout, les arbustes et vivaces ont les formes de pépinière, les annuelles peu. */
export function formsFor(sp: Pick<Species, 'strate' | 'vivace'> | undefined): PurchaseFormInfo[] {
  const keep = (ids: PurchaseForm[]) => PURCHASE_FORMS.filter((f) => ids.includes(f.id))
  if (!sp) return [...PURCHASE_FORMS]
  if (isTree(sp)) return [...PURCHASE_FORMS]
  if (!sp.vivace) return keep(['graine', 'godet', 'motte'])
  return keep(['graine', 'godet', 'motte', 'racines-nues'])
}

const TREE_PRESET: Partial<Record<PurchaseForm, { ageYears: number; heightCm: number }>> = {
  'racines-nues': { ageYears: 1, heightCm: 100 },
  scion: { ageYears: 1, heightCm: 100 },
  baliveau: { ageYears: 2, heightCm: 175 },
  'demi-tige': { ageYears: 3, heightCm: 250 },
  'haute-tige': { ageYears: 4, heightCm: 350 },
  godet: { ageYears: 1, heightCm: 60 },
  motte: { ageYears: 2, heightCm: 120 },
}

/** Âge estimé (années) d'après la forme d'achat, ou `undefined` si on ne sait pas. Proposé, jamais imposé. */
export function suggestedAgeYears(form: PurchaseForm | undefined, sp: Pick<Species, 'strate' | 'vivace'> | undefined): number | undefined {
  if (!form) return undefined
  if (form === 'graine') return 0
  if (isTree(sp)) return TREE_PRESET[form]?.ageYears
  if (form === 'racines-nues') return 1
  if (form === 'godet') return 0.3
  return 0.5
}

/** Hauteur d'achat habituelle (cm) d'un arbre selon la forme ; sert de valeur proposée dans le formulaire. */
export function suggestedHeightCm(form: PurchaseForm | undefined, sp: Pick<Species, 'strate'> | undefined): number | undefined {
  return form && isTree(sp) ? TREE_PRESET[form]?.heightCm : undefined
}

/**
 * Ce qu'il faut écrire sur la plante quand on enregistre l'achat : l'achat lui-même, l'âge à la plantation s'il est inconnu
 * (jamais écrasé s'il est déjà connu), et la hauteur d'achat comme première mesure (recale la courbe de croissance).
 */
export function purchasePatch(plant: Plant, sp: Pick<Species, 'strate' | 'vivace'> | undefined, purchase: PlantPurchase): Partial<Plant> {
  const clean: PlantPurchase = {}
  if (purchase.form) clean.form = purchase.form
  if (purchase.heightCm && purchase.heightCm > 0) clean.heightCm = purchase.heightCm
  if (purchase.boughtAt) clean.boughtAt = purchase.boughtAt
  if (purchase.shop?.trim()) clean.shop = purchase.shop.trim()
  if (purchase.priceEur !== undefined && purchase.priceEur >= 0) clean.priceEur = purchase.priceEur
  if (purchase.note?.trim()) clean.note = purchase.note.trim()
  if (purchase.skipped) clean.skipped = true
  const patch: Partial<Plant> = { purchase: Object.keys(clean).length > 0 ? clean : undefined }
  if (plant.ageAtPlanting === undefined) {
    const age = suggestedAgeYears(clean.form, sp)
    if (age !== undefined) patch.ageAtPlanting = age
  }
  if (clean.heightCm) patch.measurements = addMeasurement(plant.measurements, { at: plant.plantedAt, heightM: Math.round(clean.heightCm) / 100 })
  return patch
}

/** Faut-il demander l'achat ? Oui pour une plante en place, sans achat renseigné et sans « je ne veux pas ». */
export const shouldAskPurchase = (plant: Pick<Plant, 'status' | 'purchase'>): boolean => plant.status === 'en-place' && !plant.purchase

export interface MeasureAdvice {
  text: string
  /** Vrai si c'est le moment (première mesure, ou mesure ancienne en saison de croissance). */
  due: boolean
}

const DAY = 86400000

/** Quand mesurer la plante : une phrase simple, ou rien. Avril à septembre : saison de croissance. */
export function measureAdvice(plant: Plant, now: Date): MeasureAdvice | undefined {
  if (plant.status !== 'en-place' && plant.status !== 'malade') return undefined
  const dates = (plant.measurements ?? []).map((m) => Date.parse(m.at)).filter(Number.isFinite)
  const last = dates.length ? Math.max(...dates) : undefined
  const growing = now.getMonth() >= 3 && now.getMonth() <= 8
  if (last === undefined) {
    return { due: true, text: 'Mesurez-la maintenant : sa taille sera juste sur la carte et en 3D.' }
  }
  const days = Math.floor((now.getTime() - last) / DAY)
  const months = Math.max(1, Math.round(days / 30))
  if (days >= 365) return { due: true, text: `Dernière mesure il y a plus d’un an. Mesurez-la de nouveau.` }
  if (days >= 90 && growing) return { due: true, text: `Dernière mesure il y a ${months} mois. Mesurez-la de nouveau pendant la pousse.` }
  return { due: false, text: `Dernière mesure il y a ${days < 30 ? 'moins d’un mois' : `${months} mois`}. Prochaine mesure conseillée : ${growing ? 'dans 3 mois' : 'au printemps'}.` }
}

const ASK_KEY = 'pj.askPurchase'

/** Demander l'achat après chaque placement ? Oui tant que la personne n'a pas coché « Ne plus me demander ». */
export function askPurchaseEnabled(): boolean {
  try {
    return localStorage.getItem(ASK_KEY) !== '0'
  } catch {
    return true
  }
}

export function setAskPurchaseEnabled(on: boolean) {
  try {
    localStorage.setItem(ASK_KEY, on ? '1' : '0')
  } catch {
    /* stockage indisponible : on redemandera */
  }
}

/** Résumé en phrases courtes de l'achat déjà renseigné (fiche de la plante). */
export function purchaseSummary(purchase: PlantPurchase | undefined): string[] {
  if (!purchase || purchase.skipped) return []
  const lines: string[] = []
  if (purchase.form) lines.push(`Forme : ${purchaseFormLabel(purchase.form).toLowerCase()}`)
  if (purchase.heightCm) lines.push(`Hauteur à l’achat : ${purchase.heightCm.toLocaleString('fr-FR')} cm`)
  if (purchase.shop) lines.push(`Achetée chez : ${purchase.shop}`)
  if (purchase.boughtAt) lines.push(`Achetée le ${new Date(purchase.boughtAt.length === 10 ? `${purchase.boughtAt}T12:00:00` : purchase.boughtAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
  if (purchase.priceEur !== undefined) lines.push(`Prix : ${purchase.priceEur.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`)
  if (purchase.note) lines.push(`Note : ${purchase.note}`)
  return lines
}
