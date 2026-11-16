// Territoire : le jardin est-il dans la Métropole Rouen Normandie ? Données publiques seulement, aucun appel réseau ici.
// Les 71 communes (code INSEE) viennent de l'API officielle geo.api.gouv.fr (EPCI 200023414), relevées le 16 nov. 2026.
import type { Garden } from '../types'

export const METROPOLE_INSEE: ReadonlySet<string> = new Set(
  '76005 76020 76039 76056 76069 76088 76095 76103 76108 76116 76131 76157 76165 76178 76212 76216 76222 76231 76237 76273 76282 76313 76319 76322 76350 76354 76366 76367 76377 76378 76391 76402 76410 76429 76436 76448 76451 76457 76464 76474 76475 76484 76486 76497 76498 76513 76514 76536 76540 76550 76558 76560 76561 76575 76591 76599 76608 76614 76617 76631 76634 76636 76640 76681 76682 76705 76709 76717 76750 76753 76759'.split(' '),
)

export const ROUEN_INSEE = '76540'

export const isMetropoleInsee = (code: string | undefined): boolean => !!code && METROPOLE_INSEE.has(code)

/** Code INSEE de la commune d'après l'identifiant de parcelle (« 76540000AB0123 » : 5 chiffres de commune, 3 de préfixe, section, numéro). */
export function inseeFromParcelRef(ref: string | undefined): string | undefined {
  const m = /^(\d{5})\d{3}[A-Z0-9]{1,2}\d{1,4}$/i.exec((ref ?? '').trim())
  return m?.[1]
}

/** Commune du jardin d'après sa parcelle ; `undefined` si on ne peut pas le savoir sans réseau. */
export const gardenInsee = (g: Pick<Garden, 'parcelRefs'> | undefined): string | undefined => inseeFromParcelRef(g?.parcelRefs?.[0])

/** `true` / `false` si on le sait, `undefined` sinon (jardin sans parcelle trouvée : la page peut alors demander la commune par l'adresse). */
export function inMetropole(g: Pick<Garden, 'parcelRefs'> | undefined): boolean | undefined {
  const c = gardenInsee(g)
  return c ? METROPOLE_INSEE.has(c) : undefined
}

// Adresses publiques citées par l'appli (relevées le 16 nov. 2026 ; la page peut changer : l'appli ne les recopie pas).
export const JARDINONS_URL = 'https://www.metropole-rouen-normandie.fr/conso-durable/jardinons'
export const AIDES_COMPOST_URL = 'https://www.metropole-rouen-normandie.fr/file-download/download/public/632995'
export const GUIDE_PARCELLE_URL = 'https://www.metropole-rouen-normandie.fr/file-download/download/public/630085'
export const GUIDE_EAU_URL = 'https://www.metropole-rouen-normandie.fr/file-download/download/public/628485'
export const HERISSON_URL = 'https://www.rouen.fr/renaturation-herisson'
export const HORAIRES_ROUEN_URL = 'https://www.rouen.fr/fr/horaires-jardinage-bricolage'

/** Horaires d'usage des tondeuses et outils motorisés (arrêté préfectoral du 16 oct. 2017, page de la Ville de Rouen). */
export const HORAIRES_OUTILS: { jour: string; heures: string }[] = [
  { jour: 'En semaine', heures: '8 h 30 à 12 h et 14 h à 20 h' },
  { jour: 'Le samedi', heures: '9 h à 12 h et 14 h 30 à 19 h' },
  { jour: 'Dimanche et jours fériés', heures: '10 h à 12 h' },
]
