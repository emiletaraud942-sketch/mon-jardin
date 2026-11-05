import { useState } from 'react'
import { RESUME_REFUSAL_TEXT, describeReadFailure, resumeSaving, retryLoadState, useStorageStatus } from '../lib/store'
import { exportCurrentState, exportSafetyCopy } from '../lib/backup'
import { useBanner } from '../lib/banners'
import { ConfirmModal } from './ConfirmModal'

/** Active la version en attente du service worker puis recharge ; sans service worker, recharge simplement. */
export async function updateApp(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.update().catch(() => undefined)
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
    }
  } catch {
    /* on recharge quand même */
  }
  window.location.reload()
}

/** Bouton « Récupérer la copie de sécurité » : télécharge la copie gardée sur l'appareil (ou les données illisibles elles-mêmes). Dit quand il n'y en a pas. */
export function SafetyCopyButton({ className = 'btn small' }: { className?: string }) {
  const [msg, setMsg] = useState('')
  return (
    <>
      <button
        className={className}
        onClick={() => {
          setMsg('')
          exportSafetyCopy()
            .then((ok) => setMsg(ok ? 'Copie téléchargée. Elle ne contient pas les photos.' : 'Aucune copie de sécurité sur cet appareil.'))
            .catch(() => setMsg('La copie n’a pas pu être téléchargée.'))
        }}
      >
        Récupérer la copie de sécurité
      </button>
      {msg && (
        <span className="small" role="status">
          {msg}
        </span>
      )}
    </>
  )
}

/** Prévient quand les données ne peuvent pas être lues ou enregistrées sur l'appareil. */
export function StorageBanner() {
  const { readFailed, readFailure, writeError } = useStorageStatus()
  const [confirming, setConfirming] = useState(false)
  const [refusal, setRefusal] = useState('')
  // Le plus important des bandeaux : il passe toujours en premier (mais jamais sur la carte pendant un placement).
  const myTurn = useBanner('stockage', readFailed || !!writeError)
  if (!myTurn) return null
  if (readFailed) {
    const info = describeReadFailure(readFailure ?? 'unreadable')
    return (
      <div className="alert error banner" role="alert">
        <span>
          <strong>{info.title}</strong> {info.message}
        </span>
        <span className="row">
          {info.primary === 'update' ? (
            <button className="btn small primary" onClick={() => void updateApp()}>
              {info.primaryLabel}
            </button>
          ) : (
            <button className="btn small" onClick={() => void retryLoadState()}>
              {info.primaryLabel}
            </button>
          )}
          {info.canStartOver && (
            <button className="btn small danger" onClick={() => setConfirming(true)}>
              Repartir de zéro
            </button>
          )}
          <SafetyCopyButton />
        </span>
        {refusal && <span className="small">{refusal}</span>}
        {confirming && info.canStartOver && (
          <ConfirmModal
            title="Repartir de zéro ?"
            confirmLabel="Oui, repartir de zéro"
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false)
              setRefusal('')
              void resumeSaving().then((r) => {
                if (!r.ok) setRefusal(RESUME_REFUSAL_TEXT[r.reason])
              })
            }}
          >
            <p>{info.startOverWarning}</p>
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
