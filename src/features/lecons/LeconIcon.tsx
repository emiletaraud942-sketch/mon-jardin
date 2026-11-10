import type { Niveau } from '../../data/lecons'

// Une icône au trait par niveau (24×24, comme `Icon`) : dessinée ici, aucune image ni police téléchargée.
const PATHS: Record<Niveau, string> = {
  // Comprendre : une graine (une feuille et sa nervure), posée sur le sol.
  comprendre: 'M5 17C5 9.5 10 5 18 5c0 7.5-4.5 12-13 12ZM5 17 13 9M3 21h18',
  // Préparer : un pot à rebord, une pousse.
  preparer:
    'M6.5 12h11l-1.3 7.6a1 1 0 0 1-1 .9H8.8a1 1 0 0 1-1-.9ZM5 9h14v3H5ZM12 9V5.5M12 7C12 5 10.6 3.8 8.5 3.8c0 2 1.2 3.2 3.5 3.2ZM12 7c0-2 1.4-3.2 3.5-3.2 0 2-1.2 3.2-3.5 3.2Z',
  // Cultiver : un arrosoir.
  cultiver: 'M4 10h10v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM14 14l5.5-4.5M18 7.5l3.5 2.8M7 10c0-2.3 1-3.5 3-3.5S13 7.7 13 10M4 12.5H2.5',
  // Un jardin vivant : une fleur à quatre pétales.
  vivant:
    'M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0ZM12 9.5C10.5 8 10.5 4.5 12 3c1.5 1.5 1.5 5 0 6.5ZM14.5 12c1.5-1.5 5-1.5 6.5 0-1.5 1.5-5 1.5-6.5 0ZM12 14.5c1.5 1.5 1.5 5 0 6.5-1.5-1.5-1.5-5 0-6.5ZM9.5 12C8 13.5 4.5 13.5 3 12c1.5-1.5 5-1.5 6.5 0Z',
}

/** Icône décorative d'un niveau (le texte à côté dit le niveau). */
export function LeconIcon({ niveau, size = 24 }: { niveau: Niveau; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[niveau]} />
    </svg>
  )
}
