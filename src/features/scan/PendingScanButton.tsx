import { useEffect } from 'react'
import { Icon } from '../../components/Icon'
import { loadQueue, useScanQueue } from './queueState'
import { openScan } from './scanUi'

/** Nombre de plantes scannées encore à revoir dans ce jardin (les cercles orange de la carte). */
export function usePendingScanCount(gardenId: string): number {
  const queue = useScanQueue()
  useEffect(() => {
    void loadQueue()
  }, [])
  return queue.filter((i) => i.gardenId === gardenId && (i.status === 'a-valider' || i.status === 'en-attente')).length
}

/** « 12 plantes à valider » : ouvre la liste de revue du scan. Rien d'affiché quand il n'y en a pas. */
export function PendingScanButton({ gardenId, className = 'btn primary' }: { gardenId: string; className?: string }) {
  const n = usePendingScanCount(gardenId)
  if (n === 0) return null
  return (
    <button className={className} data-feat="plantes-a-valider" onClick={() => openScan('scanner')}>
      <Icon name="scan" size={18} /> {n} plante{n > 1 ? 's' : ''} à valider
    </button>
  )
}
