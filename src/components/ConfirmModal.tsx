import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { Modal } from './Modal'

/**
 * Demande de confirmation avant une action qu'on ne peut pas défaire d'un geste.
 * Le bouton rouge dit ce qu'il fait (« Supprimer ce jardin »), « Annuler » est toujours à côté.
 * `onBackup` ajoute « Faire d'abord une sauvegarde » ; `photosNote` rappelle que les photos n'y sont pas.
 */
export function ConfirmModal({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  onBackup,
  photosNote,
  tone = 'danger',
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  onBackup?: () => void
  photosNote?: boolean
  tone?: 'danger' | 'primary'
}) {
  const [backedUp, setBackedUp] = useState(false)
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="stack confirm-body">
        {children}
        {photosNote && <p className="alert small">Les photos ne sont pas dans la sauvegarde. Elles restent seulement sur cet appareil.</p>}
        {onBackup && (
          <div className="stack">
            <button
              className="btn"
              onClick={() => {
                onBackup()
                setBackedUp(true)
              }}
            >
              <Icon name="download" /> Faire d’abord une sauvegarde
            </button>
            {backedUp && (
              <p className="small" role="status" style={{ margin: 0 }}>
                ✓ Sauvegarde faite. Elle est dans vos téléchargements.
              </p>
            )}
          </div>
        )}
        <div className="row confirm-actions">
          <button className="btn" onClick={onCancel} autoFocus>
            Annuler
          </button>
          <button className={'btn ' + (tone === 'danger' ? 'danger-solid' : 'primary')} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
