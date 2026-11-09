import type { EnnuiType } from '../../data/ravageurs/types'

// Une icône au trait par type (24×24, comme `Icon`) : dessinée ici, aucune image ni police téléchargée.
const PATHS: Record<EnnuiType, string> = {
  // Insecte : corps, tête, antennes, six pattes.
  insecte: 'M9 14a3 5 0 1 0 6 0a3 5 0 1 0-6 0M10 8.5c0-2.3 4-2.3 4 0M10.5 6.2 9 3.5M13.5 6.2 15 3.5M9.2 12 5 10.5M9 14.5 4.5 15M9.4 17 6 19.5M14.8 12 19 10.5M15 14.5l4.5.5M14.6 17 18 19.5',
  // Champignon : chapeau, pied, points.
  champignon: 'M4 12.5a8 7 0 0 1 16 0ZM9.5 12.5V17a2.5 2.5 0 0 0 5 0v-4.5M9 9.5h.01M13 8h.01M15.5 10.5h.01',
  // Limace ou escargot : coquille en spirale, corps, antennes.
  mollusque: 'M4.5 14a5 5 0 1 0 10 0a5 5 0 1 0-10 0M9.5 14a1.6 1.6 0 1 1 1.6 1.6M3 19.5h15a3.5 3.5 0 0 0 3.5-3.5v-3.5M21.5 12.5l1-3M19.5 12.5l-.5-3',
  // Animal : une patte, un coussinet et quatre doigts.
  animal: 'M12 20c-3 0-5-1.8-5-3.8 0-2.3 3-4.7 5-4.7s5 2.4 5 4.7c0 2-2 3.8-5 3.8ZM4.8 10.2a1.5 2.1 0 1 0 3 0a1.5 2.1 0 1 0-3 0M8.5 6.3a1.5 2.1 0 1 0 3 0a1.5 2.1 0 1 0-3 0M12.5 6.3a1.5 2.1 0 1 0 3 0a1.5 2.1 0 1 0-3 0M16.2 10.2a1.5 2.1 0 1 0 3 0a1.5 2.1 0 1 0-3 0',
  // Autre cause : une feuille.
  autre: 'M12 21V11M12 13C12 9 9 6.5 5 6.5c0 4 2.5 6.5 7 6.5ZM12 11c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6Z',
}

/** Icône décorative d'un type d'ennui (le texte à côté dit le type). */
export function EnnuiIcon({ type, size = 24 }: { type: EnnuiType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[type]} />
    </svg>
  )
}
