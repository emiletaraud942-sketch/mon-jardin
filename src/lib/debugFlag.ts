// Outils de mesure pour les recettes (mesures 3D en attributs `data-*`, `window.__pjMap`, `window.__g3d`).
// Jamais lus dans l'adresse. Actifs seulement en développement (`npm run dev`) ou si la clé de session
// `pj.debug` vaut « 1 » (posée par un script de recette avant le chargement). En production, sans cette clé,
// rien n'est exposé ni mesuré. Aucune donnée n'est envoyée.
const KEY = 'pj.debug'

export function reviewToolsEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
