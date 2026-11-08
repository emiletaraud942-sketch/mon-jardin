import { recordWithToast } from '../../lib/history'
import { updateGarden } from '../../lib/store'
import type { Garden } from '../../types'

/** « Effacer l’ajustement de la carte » : message « Annuler » et historique (↶ ↷), pour ne pas perdre un recalage fait sur le terrain. */
export function clearCalibration(garden: Garden) {
  const before = garden.calibration
  if (!before) return
  updateGarden(garden.id, { calibration: undefined })
  recordWithToast(
    {
      label: 'Effacement de l’ajustement de la carte',
      undo: () => updateGarden(garden.id, { calibration: before }),
      redo: () => updateGarden(garden.id, { calibration: undefined }),
    },
    'Ajustement de la carte effacé.',
  )
}
