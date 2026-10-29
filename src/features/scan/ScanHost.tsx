import { Modal } from '../../components/Modal'
import { Icon } from '../../components/Icon'
import { useActiveGarden } from '../../lib/store'
import { updateGarden } from '../../lib/store'
import { showToast } from '../../lib/toast'
import { precisionText } from './trilat'
import { closeScan, openScan, useScanUi } from './scanUi'
import { RecalerScreen } from './RecalerScreen'
import { ScannerScreen } from './ScannerScreen'
import { MesuresScreen } from './MesuresScreen'

const SCAN_PLANTS_HINT = 'Filme le jardin et propose le nom des plantes, avec votre accord.'
const PHOTOS_HINT = 'Pour vous promener dans de vraies photos, sans reconnaissance : « Photos du jardin » sur la carte.'

/** Écrans de « Scanner mon jardin » : menu, recalage, scan des plantes, placement par mesures. */
export default function ScanHost() {
  const { screen, target } = useScanUi()
  const garden = useActiveGarden()
  if (!screen || !garden) return null
  if (screen === 'recaler') return <RecalerScreen garden={garden} />
  if (screen === 'scanner') return <ScannerScreen garden={garden} />
  if (screen === 'mesures') return <MesuresScreen garden={garden} target={target} />
  const c = garden.calibration
  return (
    <Modal title="Scanner mon jardin" sheet onClose={closeScan}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>Placez vos plantes avec votre téléphone, sur place. Tout reste sur votre appareil.</p>
        <button className="btn more-item" onClick={() => openScan('recaler')}>
          <Icon name="pin" /> Recaler la carte sur ma position
        </button>
        <p className="small muted" style={{ margin: '-4px 0 0' }}>
          {c ? `Carte recalée. Précision : ${precisionText(Math.max(c.rmsM, 0.3))}.` : 'Pas encore fait. C’est conseillé avant de scanner.'}
        </p>
        <button className="btn more-item" onClick={() => openScan('scanner')}>
          <Icon name="camera" /> Scanner les plantes
        </button>
        <p className="small muted" style={{ margin: '-4px 0 0' }}>
          {SCAN_PLANTS_HINT}
        </p>
        <button className="btn more-item" onClick={() => openScan('mesures', { kind: 'new' })}>
          <Icon name="move" /> Placer par mesures
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          {PHOTOS_HINT}
        </p>
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
    </Modal>
  )
}
