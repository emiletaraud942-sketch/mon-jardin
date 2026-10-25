import { useState, type ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { report } from '../../lib/neighbors/api'
import { externalHost } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS, POST_CATEGORY_LABELS, POST_KIND_LABELS, REPORT_REASONS, type PostCategory, type PostKind, type ReportReason, type ReportTarget } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { errorText } from './hooks'

export const Spinner = ({ label }: { label: string }) => (
  <div className="empty" role="status">
    <span className="spinner" /> {label}
  </div>
)

/** Erreur avec « Réessayer ». */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert error nb-error" role="alert">
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && (
        <button className="btn small tall" style={{ marginTop: 8 }} onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

const KIND_TONE: Record<PostKind, string> = { don: 'green', echange: '', pret: 'warn', question: '', cherche: 'warn' }
export const KindBadge = ({ kind }: { kind: PostKind }) => <span className={`badge ${KIND_TONE[kind]} nb-kind nb-kind-${kind}`}>{POST_KIND_LABELS[kind]}</span>

/** Catégorie de l'annonce (rien si l'annonce n'en a pas). */
export const CategoryBadge = ({ category }: { category: PostCategory | null }) =>
  category ? <span className="badge nb-cat-badge">{POST_CATEGORY_LABELS[category]}</span> : null

/** Confirmation avant une action irréversible. `onConfirm` peut lever : le message s'affiche dans la boîte. */
export function Confirm({
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function go() {
    setBusy(true)
    setError(undefined)
    try {
      await onConfirm()
      onClose()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        {children}
        {error && <ErrorBox message={error} />}
        <div className="row consent-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={go} disabled={busy}>
            {busy && <span className="spinner" />} {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Signalement : motif obligatoire, précisions facultatives. */
export function ReportDialog({ target, targetId, what, onClose }: { target: ReportTarget; targetId: string; what: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function send() {
    if (!reason) return
    setBusy(true)
    setError(undefined)
    try {
      await report(target, targetId, reason, details)
      showToast({ message: 'Merci. Votre signalement est envoyé.' })
      onClose()
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }
  return (
    <Modal title={`Signaler ${what}`} onClose={onClose}>
      <div className="stack">
        <fieldset className="nb-fieldset">
          <legend>Que se passe-t-il ?</legend>
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
            <label key={r} className="nb-radio">
              <input type="radio" name="motif" checked={reason === r} onChange={() => setReason(r)} />
              <span>{REPORT_REASONS[r]}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Dites-nous en plus (facultatif)</span>
          <textarea className="input" rows={3} maxLength={NEIGHBORS_LIMITS.detailsMax} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {target === 'event'
            ? 'Si trois personnes le signalent, l’événement est caché. Nous lisons chaque signalement.'
            : 'Si trois personnes la signalent, l’annonce est cachée. Pour ne plus voir quelqu’un, choisissez « Ne plus voir cette personne ».'}
        </p>
        {error && <ErrorBox message={error} />}
        <div className="row consent-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className="btn primary" onClick={send} disabled={!reason || busy}>
            {busy && <span className="spinner" />} Envoyer le signalement
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Lien vers un site extérieur (inscription à un événement). Jamais d'ouverture directe : une fenêtre dit d'abord
 * « Vous quittez l'appli ». Le lien s'ouvre dans un nouvel onglet, sans transmettre l'appli au site (noopener noreferrer).
 */
export function ExternalLinkButton({ url, label, className }: { url: string; label: string; className?: string }) {
  const [asking, setAsking] = useState(false)
  const host = externalHost(url)
  if (!host) return null // lien qui ne passe pas le contrôle https : on ne montre rien
  return (
    <>
      <button className={className ?? 'btn'} onClick={() => setAsking(true)}>
        {label}
      </button>
      {asking && (
        <Modal title="Vous quittez l’appli" onClose={() => setAsking(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>
              Vous allez ouvrir le site <strong>{host}</strong> dans un nouvel onglet.
            </p>
            <p style={{ margin: 0 }}>Ce site n’appartient pas à PermaJardin. Nous ne le contrôlons pas.</p>
            <p className="small muted" style={{ margin: 0 }}>
              Ne donnez jamais un mot de passe ou un numéro de carte bancaire si vous avez un doute.
            </p>
            <div className="row consent-actions">
              <button className="btn" onClick={() => setAsking(false)}>
                Rester dans l’appli
              </button>
              <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer" onClick={() => setAsking(false)}>
                Ouvrir {host}
              </a>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
