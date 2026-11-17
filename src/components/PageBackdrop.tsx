import { useState } from 'react'
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

export const BACKDROP_PHOTOS: string[] = Object.values(PHOTO_OF) as string[]

export const backdropPhoto = (tab: Tab): string | undefined => {
  const id = PHOTO_OF[tab]
  return id && hasSpeciesPhoto(id) ? id : undefined
}

/**
 * Fond de page « Nature » (variante C) : la plante bien nette en haut, puis la même photo qui s'étire en fond flou
 * sur toute la page, voilée de la couleur du fond pour que le texte reste lisible. Décoratif : caché des lecteurs d'écran.
 */
export function PageBackdrop({ photo }: { photo: string }) {
  // Version large (1280 px) : la photo est étirée sur toute la largeur, la petite (640 px) serait floue.
  const [small, setSmall] = useState(false) // version large absente : on retombe sur la petite
  const src = `/plantes/${photo}${small ? '' : '-lg'}.jpg`
  const onError = () => setSmall(true)
  return (
    <div className="page-backdrop" aria-hidden="true">
      <img className="pb-blur" src={src} alt="" decoding="async" onError={onError} />
      <div className="pb-veil" />
      <img className="pb-sharp" src={src} alt="" decoding="async" onError={onError} />
      <div className="pb-top" />
    </div>
  )
}
