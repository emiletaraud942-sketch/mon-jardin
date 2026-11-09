import type { ConseilTheme } from '../../data/conseils'

// Une icône au trait par thème (24×24, comme `Icon`) : dessinée ici, aucune image ni police téléchargée.
const PATHS: Record<ConseilTheme, string> = {
  // Compost : un bac, et une feuille qui en sort.
  compost: 'M5 11h14l-1.4 9.5a1 1 0 0 1-1 .8H7.4a1 1 0 0 1-1-.8ZM4 11h16M12 8V5M12 6.5C12 4.4 10.4 3 8 3c0 2.2 1.4 3.5 4 3.5ZM12 6.5c0-2 1.5-3.5 4-3.5 0 2.2-1.4 3.5-4 3.5Z',
  // Eau : une goutte.
  eau: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11ZM9.5 15a2.5 2.5 0 0 0 2.5 2.5',
}

/** Icône décorative d'un thème (le texte à côté dit le thème). */
export function ConseilIcon({ theme, size = 24 }: { theme: ConseilTheme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[theme]} />
    </svg>
  )
}
