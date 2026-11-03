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
        <button className="btn more-item" onClick={() => openScan('scanner', undefined, { video: true })}>
          <Icon name="camera" /> Filmer en marchant
        </button>
        <p className="small muted" style={{ margin: '-4px 0 0' }}>Marchez dans le jardin : l’appli repère les plantes.</p>
        <button className="btn more-item" onClick={() => openScan('scanner')}>
          <Icon name="camera" /> Photographier une plante
        </button>
        <button className="btn more-item" onClick={() => openScan('mesures', { kind: 'new' })}>
          <Icon name="move" /> Placer avec un mètre
        </button>
        <h3 style={{ margin: '8px 0 0' }}>Plus de précision (facultatif)</h3>
        <button className="btn more-item" onClick={() => openScan('recaler')}>
          <Icon name="pin" /> Recaler la carte sur ma position
        </button>
        <p className="small muted" style={{ margin: '-4px 0 0' }}>
          {c ? `Carte recalée. Précision : ${precisionText(Math.max(c.rmsM, 0.3))}.` : 'Pas encore fait. C’est facultatif.'}
        </p>
        {c && (
          <button
            className="btn"
            onClick={() => {
              const before = garden.calibration
              updateGarden(garden.id, { calibration: undefined })
              showToast({ message: 'Recalage effacé.', actionLabel: 'Annuler', onAction: () => updateGarden(garden.id, { calibration: before }) })
            }}
          >
            Effacer le recalage
          </button>
        )}
      </div>
    </Modal>
  )
}
