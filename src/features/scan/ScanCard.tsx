import { Icon } from '../../components/Icon'
import { updateGarden } from '../../lib/store'
import { showToast } from '../../lib/toast'
import type { Garden } from '../../types'
import { openScan } from './scanUi'
import { precisionText } from './trilat'

/** Carte « Carte du jardin » des Réglages : entrée du scan et état du recalage. */
export function ScanCard({ garden }: { garden: Garden }) {
  const c = garden.calibration
  return (
    <div className="card">
      <h2>Carte du jardin</h2>
      <p>{c ? `Carte recalée sur votre position. Précision : ${precisionText(Math.max(c.rmsM, 0.3))}.` : 'Avec votre téléphone, placez vos plantes sur la carte au mètre près.'}</p>
      <div className="stack">
        <button className="btn" onClick={() => openScan('menu')}>
          <Icon name="camera" /> Scanner mon jardin
        </button>
        {c && (
          <button
            className="btn"
            onClick={() => {
              updateGarden(garden.id, { calibration: undefined })
              showToast({ message: 'Recalage effacé.' })
            }}
          >
            Effacer le recalage
          </button>
        )}
      </div>
    </div>
  )
}
