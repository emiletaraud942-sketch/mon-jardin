import { isMetropolitan } from '../engine/climate'
import type { Garden } from '../types'
import { Icon } from './Icon'

/** Bandeau discret quand le jardin est hors de France métropolitaine : les conseils n'y sont pas calibrés. */
export function MetroNote({ garden }: { garden: Pick<Garden, 'center'> }) {
  if (isMetropolitan(garden.center)) return null
  return (
    <p className="metro-note" role="note">
      <Icon name="alert" size={16} /> Conseils prévus pour la France métropolitaine.
    </p>
  )
}
