import React from 'react'
import ReactDOM from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/app.css'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { loadState } from './lib/store'
import { applyStoredTheme } from './lib/theme'
import { applyStoredTextSize } from './lib/textSize'
import { showToast } from './lib/toast'
import { hasConsent } from './lib/consent'
import { neighborsEnabled } from './lib/neighbors/enabled'
import { setUi } from './lib/ui'

applyStoredTheme()
applyStoredTextSize()

// Entraide entre voisins : le retour d'un lien magique (`/?entraide=1&code=…`) est traité AVANT la synchro privée,
// qui lit aussi `?code=` : initNeighbors() échange le code puis remplace l'URL par `#entraide`.
// Sans accord de l'utilisateur, aucune requête ne part : on nettoie seulement l'URL.
const neighborsReturn = neighborsEnabled && new URLSearchParams(location.search).get('entraide') === '1'
function startNeighbors(): Promise<void> {
  if (!hasConsent('voisins')) {
    try {
      history.replaceState(null, '', location.pathname + '#entraide')
    } catch {
      /* historique indisponible */
    }
    setUi({ tab: 'voisins' })
    return Promise.resolve()
  }
  return import('./lib/neighbors/api')
    .then((m) => m.initNeighbors())
    .then((r) => {
      if (!r.handled) return
      setUi({ tab: 'voisins' })
      if (r.error) showToast({ message: r.error, tone: 'error' })
      else if (r.signedIn) showToast({ message: 'Vous êtes connecté à l’entraide.' })
    })
    .catch((e) => console.warn('Entraide indisponible', e))
}
const neighborsDone = neighborsReturn ? startNeighbors() : undefined

// Synchronisation (supabase-js) : module chargé à la demande. S'il y a un retour de lien de connexion dans
// l'URL, il démarre avant le premier rendu (aucun setUi ne passe avant) ; sinon, après le rendu.
const syncConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY
const authInUrl = !neighborsReturn && /[?&#](code|access_token|error_description|error_code|error)=/.test(location.search + location.hash)
function startSync() {
  if (!syncConfigured) return
  void import('./lib/sync')
    .then((m) => m.initSync())
    .then((r) => {
      // Synchronisation automatique (compte connecté et accord donné) : jamais d'écrasement silencieux (voir autoSync.ts).
      void import('./lib/autoSync').then((a) => a.startAutoSync()).catch((e) => console.warn('Synchronisation automatique indisponible', e))
      if (!r.handled) return
      setUi({ tab: 'reglages' })
      if (r.error) showToast({ message: r.error, tone: 'error' })
      else if (r.signedIn) showToast({ message: 'Vous êtes connecté. Vous pouvez mettre vos jardins en ligne.' })
    })
    .catch((e) => console.warn('Synchronisation indisponible', e))
}
if (authInUrl) startSync()

void loadState()

// La mise à jour de l'appli est proposée par <UpdateBanner /> : jamais de rechargement automatique.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
// Après l'entraide (URL nettoyée) pour qu'initSync ne voie pas le `code` du lien de l'entraide.
if (neighborsDone) void neighborsDone.then(startSync)
else if (!authInUrl) startSync()
