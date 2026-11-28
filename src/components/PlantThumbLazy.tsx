import { lazy, Suspense } from 'react'
import type { Plant } from '../types'
import { SpeciesThumb } from './SpeciesThumb'

// La miniature avec la photo prise de la plante se charge à la demande (chunk d'entrée au plafond).
const Own = lazy(() => import('./PlantThumb').then((m) => ({ default: m.PlantThumb })))

export function PlantThumb({ plant, color, size = 'md' }: { plant: Pick<Plant, 'speciesId' | 'photos'>; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (plant.photos.length === 0) return <SpeciesThumb id={plant.speciesId} color={color} size={size} />
  return (
    <Suspense fallback={<SpeciesThumb id={plant.speciesId} color={color} size={size} />}>
      <Own plant={plant} color={color} size={size} />
    </Suspense>
  )
}
