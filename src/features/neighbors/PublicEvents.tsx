import { listPublicEvents, NeighborsError, type PublicEvent } from '../../lib/neighbors/api'
import { isValidCoord, roundCell } from '../../lib/neighbors/cell'
import { formatEventDate } from '../../lib/neighbors/logic'
import type { Garden } from '../../types'
import { Spinner } from './common'
import { useLoad } from './hooks'

/** Combien d'événements montrer d'emblée ; les autres sont dans un repli. */
export const PUBLIC_EVENTS_SHOWN = 3

export const PUBLIC_EVENTS_TITLE = 'Événements près de chez vous'
export const PUBLIC_EVENTS_NOTE = 'Visibles sans compte. Pour en savoir plus, vous inscrire ou dire que vous êtes intéressé(e), connectez-vous ci-dessus.'
export const PUBLIC_EVENTS_EMPTY = 'Aucun événement annoncé près de chez vous pour le moment.'
export const PUBLIC_EVENTS_ERROR = 'Les événements ne sont pas disponibles pour le moment.'

function Row({ event }: { event: PublicEvent }) {
  return (
    <li className="card stack nb-event" aria-label={event.title}>
      <h3 style={{ margin: 0 }}>
        <bdi>{event.title}</bdi>
      </h3>
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
        <dd>
          <bdi>{event.organizerName}</bdi>
        </dd>
      </dl>
    </li>
  )
}

/** Liste des événements vus sans compte (présentation seule : ni réseau ni état, testable en rendu serveur). */
export function PublicEventsList({ events }: { events: PublicEvent[] }) {
  const first = events.slice(0, PUBLIC_EVENTS_SHOWN)
  const rest = events.slice(PUBLIC_EVENTS_SHOWN)
  return (
    <section className="stack" data-feat="evenements" aria-labelledby="nb-public-events">
      <h2 id="nb-public-events">{PUBLIC_EVENTS_TITLE}</h2>
      <p className="small muted" style={{ margin: 0 }}>
        {PUBLIC_EVENTS_NOTE}
      </p>
      {events.length === 0 ? (
        <p style={{ margin: 0 }}>{PUBLIC_EVENTS_EMPTY}</p>
      ) : (
        <>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {first.map((e, i) => (
              <Row key={`${e.startsAt}|${e.title}|${i}`} event={e} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="np-details">
              <summary>
                Voir {rest.length === 1 ? 'l’autre événement' : `les ${rest.length} autres événements`}
              </summary>
              <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {rest.map((e, i) => (
                  <Row key={`${e.startsAt}|${e.title}|${i + PUBLIC_EVENTS_SHOWN}`} event={e} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Événements près du jardin, avant même de se connecter. Seule la grande cellule (≈ 5 km) du jardin part vers le serveur de l'entraide
 * (jamais l'adresse ni la position exacte), et seulement après l'accord « entraide » : cet écran n'est montré qu'à ce moment.
 * Base pas encore mise à jour (migration v10) ou pas de position valide : rien n'est affiché, sans message.
 */
export function PublicEvents({ garden, online }: { garden: Garden; online: boolean }) {
  const { lat, lon } = garden.center
  const valid = isValidCoord(lat, lon)
  const cell = valid ? roundCell(lat, lon, 'large') : { lat: 0, lon: 0 }
  const state = useLoad<PublicEvent[] | null>(
    async () => {
      try {
        return await listPublicEvents(lat, lon)
      } catch (e) {
        if (e instanceof NeighborsError && e.code === 'not_open') return null
        throw e
      }
    },
    `${cell.lat}|${cell.lon}`,
    valid && online,
  )
  if (!valid || !online) return null
  if (state.loading && state.data === undefined) return <Spinner label="Recherche des événements…" />
  if (state.error) {
    return (
      <p className="small muted" role="status" style={{ margin: 0 }}>
        {PUBLIC_EVENTS_ERROR}{' '}
        <button className="btn ghost small" onClick={state.reload}>
          Réessayer
        </button>
      </p>
    )
  }
  if (state.data === null || state.data === undefined) return null
  return <PublicEventsList events={state.data} />
}
