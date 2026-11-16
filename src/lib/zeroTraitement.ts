// Réglage « Jardiner sans produit de traitement » (zéro phyto). Activé par défaut : les conseils de l'appli
// ne proposent alors ni cuivre, ni soufre, ni savon insecticide, ni Bacillus thuringiensis, ni granulés.
// Les gestes sans produit (ramasser, aérer, tailler, paillis, auxiliaires, purins maison) restent.
// Mémorisé sur l'appareil seulement ; rien n'est envoyé.
import { useSyncExternalStore } from 'react'

const KEY = 'pj.zeroTraitement'
const CHANGE_EVENT = 'zerotraitement-change' // nom d'événement, pas une clé de stockage

/** Un produit du commerce qu'on pulvérise ou qu'on épand. « eau savonneuse » (fait maison) n'en est pas un. */
export const PRODUCT = /cuivr|bouillie|soufre|savon(?!neu)|bacillus|biocontr|phosphate ferrique|granul|huile de colza|insecticide|fongicide|engrais chimique/i

/** Phrase qui ne se comprend plus une fois le produit retiré (« À appliquer à la chute des feuilles »). */
const FOLLOWUP = /^(à appliquer|l['’]appliquer|appliquez|traitez|gardez la plante à l['’]ombre)/i

/** Découpe en phrases, sans perdre la ponctuation. */
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).filter(Boolean)

/** `true` si la phrase propose un produit. */
export const mentionsProduct = (text: string): boolean => PRODUCT.test(text)

/** Le texte sans les phrases qui proposent un produit. Vide si tout était produit. */
export function withoutProducts(text: string): string {
  return sentences(text)
    .filter((s) => !PRODUCT.test(s) && !FOLLOWUP.test(s))
    .join(' ')
    .trim()
}

/** Les lignes d'une liste sans celles qui proposent un produit. */
export const linesWithoutProducts = (lines: readonly string[]): string[] => lines.filter((l) => !PRODUCT.test(l) && !FOLLOWUP.test(l))

/** Texte d'un conseil selon le réglage. Si rien ne reste, le texte d'origine est remplacé par `fallback`. */
export function adviceText(text: string, zero: boolean, fallback = 'Pas de produit : surveillez, ramassez à la main et laissez faire les auxiliaires.'): string {
  if (!zero || !PRODUCT.test(text)) return text
  return withoutProducts(text) || fallback
}

export const parseZero = (v: unknown): boolean => v !== '0'

export function getZeroTraitement(): boolean {
  try {
    return parseZero(localStorage.getItem(KEY))
  } catch {
    return true
  }
}

export function setZeroTraitement(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, '0')
  } catch {
    /* mémorisation impossible : le choix vaut pour cette session */
    memory = on
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

let memory: boolean | undefined

/** Le réglage vu par l'interface. */
export function useZeroTraitement(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(CHANGE_EVENT, cb)
      return () => window.removeEventListener(CHANGE_EVENT, cb)
    },
    () => memory ?? getZeroTraitement(),
    () => true,
  )
}
