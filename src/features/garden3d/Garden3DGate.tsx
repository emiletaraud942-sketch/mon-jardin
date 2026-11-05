// Garde de la vue 3D : vérifie WebGL2 AVANT de laisser charger le chunk 3D.
// Ce fichier est dans le bundle principal : il n'importe ni three ni la scène. Branchement dans App.tsx (voir le rapport) :
//   <Garden3DGate><Suspense fallback={…}><View3D garden={garden} /></Suspense></Garden3DGate>
// `View3D` étant chargé par `lazy()`, son import n'a lieu que si la garde laisse passer les enfants.
import { useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { setUi } from '../../lib/ui'
import { openPanorama } from '../panorama/panoUi'
import { NO_3D_TITLE, detectWebGL, force3dRequested, requestForce3d, webglExplanation, type WebGLVerdict } from '../../lib/webgl'
import './gate3d.css'

/** Repli utile : la carte, les photos du jardin, et « Essayer quand même ». Sert aussi quand le rendu échoue après le chargement. */
export function Fallback3D({ verdict, detail, onForce, onRetry }: { verdict: WebGLVerdict | 'error'; detail?: string; onForce?: () => void; onRetry?: () => void }) {
  return (
    <div className="gate3d" role="alert">
      <div className="gate3d-box card">
        <h2 className="gate3d-title">{NO_3D_TITLE}</h2>
        <p className="gate3d-text">
          {verdict === 'error' ? 'Le dessin 3D s’est arrêté.' : webglExplanation(verdict)} Votre jardin reste visible sur la carte, et vos photos du jardin fonctionnent.
        </p>
        <div className="gate3d-actions">
          <button type="button" className="btn primary" onClick={() => setUi({ tab: 'carte' })}>
            <Icon name="map" /> Ouvrir la carte
          </button>
          <button type="button" className="btn" aria-haspopup="dialog" onClick={() => openPanorama('home')}>
            <Icon name="camera" /> Photos du jardin
          </button>
        </div>
        {onRetry && (
          <button type="button" className="gate3d-link" onClick={onRetry}>
            Réessayer
          </button>
        )}
        {onForce && (
          <button type="button" className="gate3d-link" onClick={onForce}>
            Essayer quand même
          </button>
        )}
        {detail && (
          <details className="gate3d-details">
            <summary>Informations techniques</summary>
            <code>{detail}</code>
          </details>
        )}
      </div>
    </div>
  )
}

/** Laisse passer `children` (la vue 3D) si l'appareil sait dessiner en WebGL2, ou si l'utilisateur a choisi « Essayer quand même ». */
export function Garden3DGate({ children }: { children: ReactNode }) {
  const [verdict] = useState<WebGLVerdict>(() => detectWebGL())
  const [forced, setForced] = useState(() => force3dRequested())
  if (verdict === 'ok' || forced) return <>{children}</>
  return (
    <Fallback3D
      verdict={verdict}
      onForce={() => {
        requestForce3d()
        setForced(true)
      }}
    />
  )
}
