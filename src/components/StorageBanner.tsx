import { useState } from 'react'
import { retryLoadState, resumeSaving, useStorageStatus } from '../lib/store'
import { exportCurrentState } from '../lib/backup'
import { ConfirmModal } from './ConfirmModal'

/** Prévient quand les données ne peuvent pas être lues ou enregistrées sur l'appareil. */
export function StorageBanner() {
  const { readFailed, writeError } = useStorageStatus()
  const [confirming, setConfirming] = useState(false)
  if (readFailed) {
    return (
      <div className="alert error banner" role="alert">
        <span>
          <strong>Vos données ne peuvent pas être lues sur cet appareil.</strong> Rien n’est enregistré pour l’instant, pour ne rien écraser.
        </span>
        <span className="row">
          <button className="btn small" onClick={() => void retryLoadState()}>
            Réessayer
          </button>
          <button className="btn small danger" onClick={() => setConfirming(true)}>
            Repartir de zéro
          </button>
        </span>
        {confirming && (
          <ConfirmModal
            title="Repartir de zéro ?"
            confirmLabel="Oui, repartir de zéro"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              resumeSaving()
            }}
          >
            <p>Vos données illisibles seront remplacées dès le prochain enregistrement. Vous ne pourrez plus les retrouver.</p>
            <p className="small muted">Essayez d’abord « Réessayer » : le problème est parfois passager.</p>
          </ConfirmModal>
        )}
      </div>
    )
  }
  if (writeError) {
    return (
      <div className="alert error banner" role="alert">
        <span>
          <strong>Vos données ne peuvent pas être enregistrées sur cet appareil.</strong> L’espace est plein ou bloqué. Faites une sauvegarde pour ne rien perdre.
        </span>
        <button className="btn small" onClick={() => exportCurrentState()}>
          Faire une sauvegarde
        </button>
      </div>
    )
  }
  return null
}
