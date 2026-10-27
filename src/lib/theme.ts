// Thème de l'interface : Clair (par défaut, comme la maquette), Sombre, ou Automatique (réglage du système). Mémorisé sur l'appareil.
export type Theme = 'auto' | 'light' | 'dark'
export const THEME_LABEL: Record<Theme, string> = { auto: 'Automatique', light: 'Clair', dark: 'Sombre' }

const KEY = 'permajardin:theme'

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'auto' ? v : 'light'
  } catch {
    return 'light'
  }
}

/** Couleurs de la barre du navigateur (mêmes valeurs que les deux balises `theme-color` d'index.html). */
const THEME_COLOR: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#131a14' }
const FORCED_META = 'data-forced-theme-color'

/** Thème forcé : une balise `theme-color` sans `media` l'emporte sur les deux balises d'index.html. Auto : on la retire. */
function syncThemeColor(theme: Theme) {
  const existing = document.head.querySelector(`meta[${FORCED_META}]`)
  if (theme === 'auto') {
    existing?.remove()
    return
  }
  const meta = existing ?? document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute(FORCED_META, '')
  meta.setAttribute('content', THEME_COLOR[theme])
  if (!existing) document.head.prepend(meta)
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  syncThemeColor(theme)
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* mémorisation impossible : le thème vaut pour cette session */
  }
  applyTheme(theme)
}

export function applyStoredTheme() {
  applyTheme(getTheme())
}
