import type { PurchaseForm } from '../types'

/**
 * Achat lu sur une étiquette de pépinière (« Scanner un sachet ou une étiquette ») : mis de côté en mémoire
 * le temps de placer la plante, puis proposé dans « Comment l'avez-vous achetée ? ». Jamais enregistré sans
 * que la personne le voie et le corrige ; rien n'est stocké (mémoire seulement, 30 minutes au plus).
 */
export interface PurchaseDraft {
  speciesId: string
  form?: PurchaseForm
  heightCm?: number
  priceEur?: number
  note?: string
}

const TTL_MS = 30 * 60 * 1000
let draft: (PurchaseDraft & { at: number }) | undefined

export function setPurchaseDraft(d: PurchaseDraft | undefined, now = Date.now()) {
  const useful = d && (d.form || d.heightCm !== undefined || d.priceEur !== undefined || d.note)
  draft = useful ? { ...d, at: now } : undefined
}

/** Le brouillon, seulement s'il concerne cette espèce et n'est pas périmé. */
export function peekPurchaseDraft(speciesId: string, now = Date.now()): PurchaseDraft | undefined {
  if (!draft || draft.speciesId !== speciesId || now - draft.at > TTL_MS) return undefined
  return draft
}

export const hasPurchaseDraft = (speciesId: string, now = Date.now()) => !!peekPurchaseDraft(speciesId, now)
export const clearPurchaseDraft = () => {
  draft = undefined
}
