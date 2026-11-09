import { closeScan } from '../features/scan/scanUi'
import { closePanorama } from '../features/panorama/panoUi'
import { ennuisOpen, guideOpen, lostSheet, rotationOpen, toutFaire, tourOpen } from './overlays'
import { setHelpOpen, setUi } from './ui'

/**
 * Retour à l'accueil en un appui, depuis n'importe quel écran : ferme la fiche d'une plante, le scanner,
 * les photos du jardin, l'aide et les feuilles d'aide, puis ouvre « Que voulez-vous faire ? ».
 */
export function goHome() {
  closeScan()
  closePanorama()
  setHelpOpen(false)
  toutFaire.set(false)
  lostSheet.set(false)
  guideOpen.set(false)
  ennuisOpen.set(undefined)
  rotationOpen.set(false)
  tourOpen.set(false)
  setUi({ tab: 'accueil', selectedPlantId: undefined, speciesId: undefined })
}
