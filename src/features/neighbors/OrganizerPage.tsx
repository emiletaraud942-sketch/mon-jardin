import { useState } from 'react'
import { requestOrganizer, withdrawOrganizer } from '../../lib/neighbors/api'
import { NEIGHBORS_LIMITS as L, type OrganizerInfo } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { Confirm, ErrorBox } from './common'
import { errorText } from './hooks'

/** « Devenir organisateur » : un nom public et une courte présentation. L'éditeur vérifie chaque demande avant de l'accepter. */
export function OrganizerPage({
  organizer,
  online,
  onBack,
  onChanged,
  onNewEvent,
}: {
  organizer: OrganizerInfo | null
  online: boolean
  onBack: () => void
  onChanged: () => void
  onNewEvent: () => void
}) {
  const [name, setName] = useState(organizer?.name ?? '')
  const [description, setDescription] = useState(organizer?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [withdrawing, setWithdrawing] = useState(false)
  const [sent, setSent] = useState(false)
  const nameOk = name.trim().length >= L.organizerNameMin

  async function send() {
    setBusy(true)
    setError(undefined)
    try {
      await requestOrganizer({ name, description })
      setSent(true)
      showToast({ message: organizer ? 'Demande modifiée.' : 'Demande envoyée.' })
      onChanged()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const pending = !!organizer && !organizer.verified
  return (
    <div className="stack">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour aux événements
      </button>
      {organizer?.verified ? (
        <section className="card stack" aria-label="Vous êtes organisateur">
          <h2>Vous êtes organisateur</h2>
          <p style={{ margin: 0 }}>
            Nom affiché : <strong><bdi>{organizer.name}</bdi></strong>
          </p>
          {organizer.description && <p className="nb-body">{organizer.description}</p>}
          <p className="small muted" style={{ margin: 0 }}>Pour changer de nom, écrivez à l’éditeur de l’appli.</p>
          <div className="row">
            <button className="btn primary" onClick={onNewEvent}>
              Publier un événement
            </button>
            <button className="btn danger" onClick={() => setWithdrawing(true)} disabled={!online}>
              Ne plus être organisateur
            </button>
          </div>
        </section>
      ) : (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (nameOk && !busy) void send()
          }}
        >
          <h2>{pending ? 'Ma demande d’organisateur' : 'Devenir organisateur'}</h2>
          <div className="stack">
            <p style={{ margin: 0 }}>Les événements sont publiés par des organisateurs vérifiés : associations, jardins partagés, mairies ou particuliers.</p>
            <p style={{ margin: 0 }}>
              <strong>Nous vérifions votre demande</strong> avant de l’accepter. Cela peut prendre quelques jours. Vous ne pouvez rien publier avant.
            </p>
          </div>
          {pending && !sent && <p className="alert info small" style={{ margin: 0 }}>Votre demande est en cours d’examen. Vous pouvez encore la corriger.</p>}
          {sent && <p className="alert info small" role="status" style={{ margin: 0 }}>Merci. Votre demande est envoyée. Nous la regardons au plus vite.</p>}
          <label className="field">
            <span>
              Nom public ({name.trim().length}/{L.organizerNameMax})
            </span>
            <input className="input" value={name} maxLength={L.organizerNameMax} placeholder="Ex. : Jardin partagé des Lilas" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>
              Qui êtes-vous ? Que proposez-vous ? ({description.length}/{L.organizerDescriptionMax})
            </span>
            <textarea className="input" rows={4} value={description} maxLength={L.organizerDescriptionMax} placeholder="Ex. : Association de jardiniers. Un atelier chaque mois." onChange={(e) => setDescription(e.target.value)} />
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Le nom est montré à tous les voisins. Pas d’adresse, de téléphone ni d’e-mail ici.
          </p>
          {error && <ErrorBox message={error} />}
          {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour envoyer.</p>}
          <div className="row">
            <button className="btn primary" type="submit" disabled={!nameOk || busy || !online}>
              {busy && <span className="spinner" />} {pending ? 'Modifier ma demande' : 'Envoyer ma demande'}
            </button>
            {pending && (
              <button type="button" className="btn danger" onClick={() => setWithdrawing(true)} disabled={busy || !online}>
                Retirer ma demande
              </button>
            )}
            <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {withdrawing && (
        <Confirm
          title={pending ? 'Retirer votre demande ?' : 'Ne plus être organisateur ?'}
          confirmLabel={pending ? 'Retirer ma demande' : 'Ne plus être organisateur'}
          danger
          onClose={() => setWithdrawing(false)}
          onConfirm={async () => {
            await withdrawOrganizer()
            showToast({ message: pending ? 'Demande retirée.' : 'Vous n’êtes plus organisateur.' })
            onChanged()
            onBack()
          }}
        >
          <p style={{ margin: 0 }}>
            {pending ? 'Votre demande est effacée. Vous pourrez en refaire une plus tard.' : 'Vos événements sont effacés. Pour redevenir organisateur, il faudra refaire une demande.'}
          </p>
        </Confirm>
      )}
    </div>
  )
}
