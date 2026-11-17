import { hasSpeciesPhoto } from './SpeciesThumb'
import type { Tab } from '../lib/ui'

/** Une photo par écran (espèces ayant une photo libre dans public/plantes). Pas de photo sur la carte : elle remplit l'écran. */
const PHOTO_OF: Partial<Record<Tab, string>> = {
  accueil: 'basilic',
  plantes: 'romarin',
  entretien: 'pommier',
  planter: 'lavande',
  catalogue: 'lavande',
  reglages: 'hetre',
  voisins: 'tilleul',
}

export const backdropPhoto = (tab: Tab): string | undefined => {
  const id = PHOTO_OF[tab]
  return id && hasSpeciesPhoto(id) ? id : undefined
}

/**
 * Fond de page « Nature » (variante C) : la plante bien nette en haut, puis la même photo qui s'étire en fond flou
 * sur toute la page, voilée de la couleur du fond pour que le texte reste lisible. Décoratif : caché des lecteurs d'écran.
 */
export function PageBackdrop({ photo }: { photo: string }) {
  const src = `/plantes/${photo}.jpg`
  return (
    <div className="page-backdrop" aria-hidden="true">
      <img className="pb-blur" src={src} alt="" decoding="async" />
      <div className="pb-veil" />
      <img className="pb-sharp" src={src} alt="" decoding="async" />
      <div className="pb-top" />
    </div>
  )
}
