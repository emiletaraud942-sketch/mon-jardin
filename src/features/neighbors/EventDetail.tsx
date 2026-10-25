import { useState } from 'react'
import type { EventItem } from '../../lib/neighbors/types'
import { eventEnded, formatWhen } from '../../lib/neighbors/logic'
import { EventActions, EventFacts, EventStatusBadges } from './Events'

/** Détail d'un événement : toutes les informations, les mêmes actions que la carte. */
export function EventDetail({ event: first, online, onBack }: { event: EventItem; online: boolean; onBack: () => void }) {
  const [event, setEvent] = useState(first)
  return (
    <div className="stack nb-detail">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour aux événements
      </button>
      <article className="card stack">
        <EventStatusBadges event={event} />
        <h2 style={{ margin: 0 }}>
          <bdi>{event.title}</bdi>
        </h2>
        {event.status === 'cancelled' && <p className="alert" style={{ margin: 0 }}>Cet événement est annulé.</p>}
        {eventEnded(event) && event.status === 'open' && <p className="muted" style={{ margin: 0 }}>Cet événement est terminé.</p>}
        <EventFacts event={event} />
        {event.description && <p className="nb-body">{event.description}</p>}
        <EventActions event={event} online={online} onChange={setEvent} />
        {event.signupUrl && (
          <p className="small muted" style={{ margin: 0 }}>
            « S’inscrire » ouvre le site de l’organisateur. L’inscription se fait là-bas, pas ici.
          </p>
        )}
        {!event.mine && <p className="small muted" style={{ margin: 0 }}>« Je suis intéressé(e) » ne vous inscrit pas. C’est un simple compteur : l’organisateur ne voit pas votre nom.</p>}
      </article>
      <section className="card stack" aria-label="L’organisateur">
        <h3 style={{ margin: 0 }}>
          L’organisateur : <bdi>{event.organizerName}</bdi>
        </h3>
        {event.organizerDescription && <p className="nb-body">{event.organizerDescription}</p>}
        <p className="small muted" style={{ margin: 0 }}>
          Nous vérifions le nom de l’organisateur, pas ses événements. Publié {formatWhen(event.createdAt)}.
        </p>
      </section>
    </div>
  )
}
