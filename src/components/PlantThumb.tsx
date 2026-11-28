import { useEffect, useState } from 'react'
import { getPhoto } from '../lib/photos'
import type { Plant } from '../types'
import { SpeciesThumb } from './SpeciesThumb'

/** Miniature d'UNE plante du jardin : sa dernière photo prise si elle en a une, sinon la photo de l'espèce, sinon un point de couleur. */
export function PlantThumb({ plant, color, size = 'md' }: { plant: Pick<Plant, 'speciesId' | 'photos'>; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const last = plant.photos[plant.photos.length - 1]
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let live = true
    let made: string | undefined
    setUrl(undefined)
    if (last) {
      void getPhoto(last)
        .then((b) => {
          if (b && live) {
            made = URL.createObjectURL(b)
            setUrl(made)
          }
        })
        .catch(() => undefined)
    }
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [last])
  if (!url) return <SpeciesThumb id={plant.speciesId} color={color} size={size} />
  return (
    <span className={'plant-thumb' + (size === 'md' ? '' : ' ' + size)} aria-hidden="true">
      <img src={url} alt="" decoding="async" />
    </span>
  )
}
