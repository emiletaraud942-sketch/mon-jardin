// Après un déploiement, un morceau de code de l'ancienne version peut ne plus exister (erreur 404).
// Vite signale alors `vite:preloadError` : on propose de recharger, une seule fois par page.
// On ne bloque pas l'erreur (pas de preventDefault) : l'écran concerné affiche son propre message.

export const NEW_VERSION_MESSAGE = 'Une nouvelle version de l’appli est disponible. Rechargez pour continuer.'

export function installChunkErrorHandler(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, onFail: () => void): () => void {
  let warned = false
  const handler = () => {
    if (warned) return
    warned = true
    onFail()
  }
  target.addEventListener('vite:preloadError', handler)
  return () => target.removeEventListener('vite:preloadError', handler)
}
