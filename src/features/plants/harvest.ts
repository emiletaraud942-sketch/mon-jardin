import type { Plant } from '../../types'
import { recordWithToast } from '../../lib/history'
import { updatePlant } from '../../lib/store'

/**
 * Marque ces annuelles « récoltées » (fin de saison). Annulable : « Annuler » du message, ↶ ou Ctrl/⌘+Z remettent l'état d'avant.
 * `label` nomme la plante ou le groupe dans le message.
 */
export function markHarvested(plants: Plant[], label: string) {
  if (plants.length === 0) return
  const before = plants.map((p) => ({ id: p.id, status: p.status }))
  const apply = () => plants.forEach((p) => updatePlant(p.id, { status: 'recoltee' }))
  apply()
  recordWithToast(
    { label: plants.length === 1 ? `${label} : marquée récoltée` : `${plants.length} plantes marquées récoltées`, undo: () => before.forEach((b) => updatePlant(b.id, { status: b.status })), redo: apply },
    plants.length === 1 ? `${label} : marquée récoltée.` : `${plants.length} plantes marquées récoltées.`,
  )
}
