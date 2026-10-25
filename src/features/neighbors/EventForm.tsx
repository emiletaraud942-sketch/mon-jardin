import { useState } from 'react'
import { createEvent, validateEvent } from '../../lib/neighbors/api'
import { capacityText, dateInput, formatEventDate, localDateTimeToIso } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS as L, type EventItem } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { ErrorBox } from './common'
import { errorText } from './hooks'

/** Création d'un événement (organisateurs validés). Deux étapes : saisie, puis récapitulatif avant de publier. */
export function EventForm({ organizerName, where, online, onPublished, onCancel }: { organizerName: string; where?: string; online: boolean; onPublished: (e: EventItem) => void; onCancel: () => void }) {
  const tomorrow = new Date(Date.now() + 86_400_000)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [place, setPlace] = useState('')
  const [day, setDay] = useState(dateInput(tomorrow))
  const [start, setStart] = useState('14:00')
  const [end, setEnd] = useState('16:00')
  const [lastDay, setLastDay] = useState('')
  const [url, setUrl] = useState('')
  const [capacity, setCapacity] = useState('')
  const [step, setStep] = useState<'edit' | 'recap'>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const startsAt = localDateTimeToIso(day, start)
  const endsAt = localDateTimeToIso(lastDay || day, end)

  function toRecap() {
    setError(undefined)
    try {
      validateEvent({ title, description, place, startsAt: startsAt ?? '', endsAt: endsAt ?? '', signupUrl: url, capacity: capacity.trim() ? Number(capacity) : null })
      setStep('recap')
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function publish() {
    setBusy(true)
    setError(undefined)
    try {
      const ev = await createEvent({ title, description, place, startsAt: startsAt ?? '', endsAt: endsAt ?? '', signupUrl: url, capacity: capacity.trim() ? Number(capacity) : null })
      showToast({ message: 'Événement publié.' })
      onPublished(ev)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  if (step === 'recap') {
    return (
      <section className="card stack" aria-label="Récapitulatif">
        <h2>Vérifiez votre événement</h2>
        <dl className="np-recap">
          <dt>Titre</dt>
          <dd>
            <bdi>{title.trim()}</bdi>
          </dd>
          <dt>Quand</dt>
          <dd>{startsAt && endsAt ? formatEventDate(startsAt, endsAt) : ''}</dd>
          <dt>Où</dt>
          <dd>
            <bdi>{place.trim()}</bdi>
          </dd>
          {description.trim() && (
            <>
              <dt>Détails</dt>
              <dd>{description.trim()}</dd>
            </>
          )}
          {url.trim() && (
            <>
              <dt>Lien d’inscription</dt>
              <dd>{url.trim()}</dd>
            </>
          )}
          {capacity.trim() && (
            <>
              <dt>Places</dt>
              <dd>{capacityText(Number(capacity))}</dd>
            </>
          )}
          <dt>Vu par vos voisins</dt>
          <dd>
            Organisé par <bdi>{organizerName}</bdi>
            {where ? `, ${where}` : ''}
          </dd>
        </dl>
        {error && <ErrorBox message={error} />}
        {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour publier.</p>}
        <div className="row">
          <button className="btn primary" onClick={() => void publish()} disabled={busy || !online}>
            {busy && <span className="spinner" />} Publier maintenant
          </button>
          <button className="btn" onClick={() => setStep('edit')} disabled={busy}>
            Modifier
          </button>
        </div>
      </section>
    )
  }

  const canContinue = !!title.trim() && !!place.trim() && !!startsAt && !!endsAt
  return (
    <form
      className="card stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (canContinue) toRecap()
      }}
    >
      <h2>Nouvel événement</h2>
      <label className="field">
        <span>
          Titre ({title.trim().length}/{L.eventTitleMax})
        </span>
        <input className="input" value={title} maxLength={L.eventTitleMax} placeholder="Ex. : Troc de plantes d’automne" onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>Jour</span>
        <input className="input" type="date" value={day} min={dateInput(new Date())} onChange={(e) => setDay(e.target.value)} />
      </label>
      <div className="row nb-time-row">
        <label className="field">
          <span>Début</span>
          <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Fin</span>
          <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Dernier jour, si cela dure plusieurs jours (facultatif)</span>
        <input className="input" type="date" value={lastDay} min={day} onChange={(e) => setLastDay(e.target.value)} />
      </label>
      <label className="field">
        <span>
          Lieu ({place.trim().length}/{L.eventPlaceMax})
        </span>
        <input className="input" value={place} maxLength={L.eventPlaceMax} placeholder="Ex. : Salle des fêtes, place de la mairie" onChange={(e) => setPlace(e.target.value)} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Indiquez un lieu public. N’écrivez pas l’adresse d’une maison privée.
      </p>
      <label className="field">
        <span>
          Description, facultatif ({description.length}/{L.eventDescriptionMax})
        </span>
        <textarea className="input" rows={5} value={description} maxLength={L.eventDescriptionMax} placeholder="Programme, ce qu’il faut apporter…" onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field">
        <span>Lien pour s’inscrire, facultatif</span>
        <input className="input" type="url" inputMode="url" value={url} maxLength={L.eventUrlMax} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Le lien doit commencer par « https:// ». Les voisins verront un avertissement avant de quitter l’appli.
      </p>
      <label className="field">
        <span>Nombre de places, facultatif</span>
        <input className="input" type="number" inputMode="numeric" min={1} max={L.eventCapacityMax} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </label>
      <p className="alert info small" style={{ margin: 0 }}>
        L’événement montre le nom de votre organisation et votre quartier. Il disparaît 30 jours après sa fin.
      </p>
      {error && <ErrorBox message={error} />}
      {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour publier.</p>}
      <div className="row">
        <button className="btn primary" type="submit" disabled={!canContinue}>
          Voir le récapitulatif
        </button>
        {!title.trim() && <span className="small muted">Écrivez un titre pour continuer.</span>}
        <button type="button" className="btn ghost" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  )
}
