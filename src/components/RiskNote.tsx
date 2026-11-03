import type { Risque, Species } from '../types'
import { Icon } from './Icon'

export const RISQUE_LABEL: Record<Risque, string> = { toxique: 'Toxique', invasive: 'Invasive', allergene: 'Allergène' }

/** Pastille « Invasive » (le texte porte le sens, pas seulement la couleur). */
export function InvasiveBadge({ species }: { species: Species }) {
  if (!species.risque?.includes('invasive')) return null
  return (
    <span className="badge danger risk-badge">
      <Icon name="alert" size={14} /> Invasive
    </span>
  )
}

/** Bandeau « Attention » d'une fiche : icône, mot, types de risque et phrase de la fiche. Rien si la plante n'a pas de risque. */
export function RiskNote({ species }: { species: Species }) {
  if (!species.risque?.length) return null
  return (
    <div className="risk-note" role="note">
      <span className="risk-ico" aria-hidden>
        <Icon name="alert" size={22} />
      </span>
      <div>
        <strong>Attention : {species.risque.map((r) => RISQUE_LABEL[r].toLowerCase()).join(', ')}.</strong>
        {species.risqueNote && <span> {species.risqueNote}</span>}
      </div>
    </div>
  )
}
