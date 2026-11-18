import { useEffect, useRef, useState } from 'react'
import { LARGE_IDS } from '../data/species/photoIds'
import type { Tab } from '../lib/ui'

/** Une photo par écran (Carte, Plantes et Photos partagent celle de « Mon jardin »). */
const PHOTO_OF: Partial<Record<Tab, string>> = {
  accueil: 'basilic',
  carte: 'romarin',
  plantes: 'romarin',
  entretien: 'pommier',
  planter: 'lavande',
  catalogue: 'lavande',
  reglages: 'hetre',
  voisins: 'tilleul',
}

export const BACKDROP_PHOTOS: string[] = Object.values(PHOTO_OF) as string[]

/** Photo du fond pour un écran : celle prévue si sa version large est là, sinon le basilic (large, toujours présent). */
export const backdropPhoto = (tab: Tab): string | undefined => {
  const id = PHOTO_OF[tab]
  if (!id) return undefined
  return LARGE_IDS.has(id) ? id : LARGE_IDS.has('basilic') ? 'basilic' : undefined
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
  const root = useRef<HTMLDivElement>(null)
  // La photo nette défile avec la page : le texte ne passe jamais par-dessus (on lit le défilement de la zone principale).
  useEffect(() => {
    const el = root.current
    if (!el) return
    const move = (y: number) => {
      el.style.setProperty('--pb-shift', `${-Math.min(Math.max(y, 0), 420)}px`)
    }
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | Document
      const y = t instanceof Document ? window.scrollY : (t as HTMLElement).scrollTop
      if (t instanceof Document || (t as HTMLElement).classList?.contains('main')) move(y)
    }
    move(0)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [photo])
  return (
    <div className="page-backdrop" aria-hidden="true" ref={root}>
      <img className="pb-blur" src={src} alt="" decoding="async" onError={onError} />
      <div className="pb-veil" />
      <img className="pb-sharp" src={src} alt="" decoding="async" onError={onError} />
      <div className="pb-top" />
    </div>
  )
}

/** Fond des écrans plein écran (leçons, guides, Jardinons !, fiches) : la même photo floue et voilée, sans la plante nette. */
export function OverlayBackdrop({ tab }: { tab: Tab }) {
  const photo = backdropPhoto(tab)
  return photo ? <PageBackdrop photo={photo} /> : null
}
