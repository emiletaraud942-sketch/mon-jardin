import { useMemo, useState } from 'react'
import { listEvents, toggleInterest } from '../../lib/neighbors/api'
import { RADII, capacityText, emptyEventsText, eventEnded, eventStatusInfo, formatEventDate, interestCountText } from '../../lib/neighbors/logic'
import type { EventItem, OrganizerInfo } from '../../lib/neighbors/types'
import { ErrorBox, ExternalLinkButton, ReportDialog, Spinner } from './common'
import { errorText, useLoad, type Loaded } from './hooks'

/** « Je suis intéressé(e) » : un simple compteur. Cela n'inscrit à rien et ne dit pas votre nom à l'organisateur. */
export function InterestButton({ event, online, onChange }: { event: EventItem; online: boolean; onChange: (e: EventItem) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const closed = event.status !== 'open' || eventEnded(event)
  async function toggle() {
    setBusy(true)
    setError(undefined)
    try {
      const now = await toggleInterest(event.id, event.interested)
      const delta = now === event.interested ? 0 : now ? 1 : -1
      onChange({ ...event, interested: now, interestCount: Math.max(0, event.interestCount + delta) })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button className={'btn' + (event.interested ? ' on' : '')} aria-pressed={event.interested} onClick={() => void toggle()} disabled={busy || !online || closed}>
        {busy && <span className="spinner" />} {event.interested ? 'Je suis intéressé(e) ✓' : 'Je suis intéressé(e)'}
      </button>
      {error && <ErrorBox message={error} />}
    </>
  )
}

/** Actions communes à la carte et au détail : intérêt, inscription (site extérieur), signalement. */
export function EventActions({ event, online, onChange }: { event: EventItem; online: boolean; onChange: (e: EventItem) => void }) {
  const [reporting, setReporting] = useState(false)
  const open = event.status === 'open' && !eventEnded(event)
  return (
    <>
      <div className="row nb-event-actions">
        {!event.mine && <InterestButton event={event} online={online} onChange={onChange} />}
        {open && event.signupUrl && <ExternalLinkButton url={event.signupUrl} label="S’inscrire" className="btn primary" />}
        {!event.mine && (
          <button className="btn" onClick={() => setReporting(true)}>
            Signaler
          </button>
        )}
      </div>
      {reporting && <ReportDialog target="event" targetId={event.id} what="cet événement" onClose={() => setReporting(false)} />}
    </>
  )
}

/** Date, lieu et organisateur : le même bloc dans la liste et dans le détail. */
export function EventFacts({ event }: { event: EventItem }) {
  const places = capacityText(event.capacity)
  return (
    <dl className="nb-dl nb-event-facts">
      <dt>Quand</dt>
      <dd>
        <strong>{formatEventDate(event.startsAt, event.endsAt)}</strong>
      </dd>
      <dt>Où</dt>
      <dd>
        <bdi>{event.place}</bdi>
      </dd>
      <dt>Organisé par</dt>
      <dd>{event.mine ? 'Vous' : <bdi>{event.organizerName}</bdi>}</dd>
      {places && (
        <>
          <dt>Places</dt>
          <dd>{places}</dd>
        </>
      )}
    </dl>
  )
}

export function EventStatusBadges({ event }: { event: EventItem }) {
  const info = eventStatusInfo(event)
  return (
    <span className="row nb-card-top">
      <span className={'badge ' + (info.tone === 'neutral' ? '' : info.tone)}>{info.label}</span>
      <span className="small muted">{event.distanceLabel}</span>
    </span>
  )
}

export function EventCard({ event, online, onOpen, onChange }: { event: EventItem; online: boolean; onOpen: (e: EventItem) => void; onChange: (e: EventItem) => void }) {
  return (
    <article className="card stack nb-event" aria-label={event.title}>
      <EventStatusBadges event={event} />
      <h3 style={{ margin: 0 }}>
        <button className="link-btn nb-mine-title nb-event-title" onClick={() => onOpen(event)}>
          <bdi>{event.title}</bdi>
        </button>
      </h3>
      <EventFacts event={event} />
      <p className="small muted" style={{ margin: 0 }}>
        {interestCountText(event.interestCount)}
      </p>
      <EventActions event={event} online={online} onChange={onChange} />
      <div className="row">
        <button className="btn ghost" onClick={() => onOpen(event)}>
          Voir les détails
        </button>
      </div>
    </article>
  )
}

/** Onglet « Événements » : rendez-vous près de chez vous, par date. Publier est réservé aux organisateurs validés. */
export function EventsTab({
  radius,
  online,
  organizer,
  onRadius,
  onOpen,
  onOrganizer,
  onNewEvent,
  onMine,
}: {
  radius: number
  online: boolean
  organizer: Loaded<OrganizerInfo | null>
  onRadius: (r: number) => void
  onOpen: (e: EventItem) => void
  onOrganizer: () => void
  onNewEvent: () => void
  onMine: () => void
}) {
  const { data, error, loading, reload, setData } = useLoad(() => listEvents({ radiusKm: radius }), String(radius))
  const events = useMemo(() => data ?? [], [data])
  const empty = emptyEventsText()
  const org = organizer.data
  const replace = (e: EventItem) => data && setData(data.map((x) => (x.id === e.id ? e : x)))

  return (
    <div className="stack nb-feed">
      <section className="card stack" aria-label="Événements près de chez vous">
        <h2>Événements près de chez vous</h2>
        <p style={{ margin: 0 }}>Ateliers, troc de plantes, visites de jardins. Ils sont publiés par des organisateurs vérifiés.</p>
        <div className="row nb-toolbar-row">
          <label className="row small" style={{ gap: 6 }}>
            <span>Distance</span>
            <select className="input nb-radius" value={radius} onChange={(e) => onRadius(Number(e.target.value))} aria-label="Distance de recherche">
              {RADII.map((r) => (
                <option key={r} value={r}>
                  jusqu’à {r} km
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Chargement des événements…" />}
      {data && events.length > 0 && (
        <ul className="nb-list" aria-label="Événements" aria-busy={loading}>
          {events.map((e) => (
            <li key={e.id}>
              <EventCard event={e} online={online} onOpen={onOpen} onChange={replace} />
            </li>
          ))}
        </ul>
      )}
      {data && events.length === 0 && !error && (
        <div className="card nb-empty">
          <h2>{empty.title}</h2>
          <p style={{ margin: 0 }}>{empty.hint}</p>
          {radius < RADII[RADII.length - 1] && (
            <div className="row">
              <button className="btn" onClick={() => onRadius(RADII[RADII.length - 1])}>
                Élargir à {RADII[RADII.length - 1]} km
              </button>
            </div>
          )}
        </div>
      )}
      {!online && <p className="small muted">Pas de réseau : la liste peut être dépassée.</p>}

      <section className="card stack" aria-label="Organiser un événement">
        <h2>Vous organisez un événement ?</h2>
        {organizer.error && <ErrorBox message={organizer.error} onRetry={organizer.reload} />}
        {!organizer.error && organizer.loading && !org && <Spinner label="Chargement…" />}
        {!organizer.error && organizer.data === null && (
          <>
            <p style={{ margin: 0 }}>Pour publier un événement, il faut être organisateur. Nous vérifions chaque demande.</p>
            <div className="row">
              <button className="btn primary" onClick={onOrganizer}>
                Devenir organisateur
              </button>
            </div>
          </>
        )}
        {org && !org.verified && (
          <>
            <p style={{ margin: 0 }}>
              Votre demande « <bdi>{org.name}</bdi> » est en cours d’examen. Vous pourrez publier dès qu’elle sera acceptée.
            </p>
            <div className="row">
              <button className="btn" onClick={onOrganizer}>
                Voir ma demande
              </button>
            </div>
          </>
        )}
        {org?.verified && (
          <>
            <p style={{ margin: 0 }}>
              Vous êtes organisateur : <bdi>{org.name}</bdi>.
            </p>
            <div className="row">
              <button className="btn primary" onClick={onNewEvent}>
                Publier un événement
              </button>
              <button className="btn" onClick={onMine}>
                Mes événements
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
