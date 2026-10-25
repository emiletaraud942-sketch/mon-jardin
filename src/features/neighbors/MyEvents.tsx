import { useMemo, useState } from 'react'
import { cancelEvent, listMyEvents, reopenEvent } from '../../lib/neighbors/api'
import { eventStatusInfo, formatEventDate, interestCountText } from '../../lib/neighbors/logic'
import type { EventItem } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { Confirm, ErrorBox, Spinner } from './common'
import { errorText, useLoad } from './hooks'

/** Mes événements : annuler ou rouvrir. Un événement annulé reste visible, marqué « Annulé ». */
export function MyEvents({ online, onBack, onNew }: { online: boolean; onBack: () => void; onNew: () => void }) {
  const { data, error, loading, reload } = useLoad(listMyEvents, 'mes-evenements')
  const events = useMemo(() => data ?? [], [data])
  const [busyId, setBusyId] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [cancelling, setCancelling] = useState<EventItem>()

  async function reopen(e: EventItem) {
    setBusyId(e.id)
    setActionError(undefined)
    try {
      await reopenEvent(e.id)
      showToast({ message: 'Événement rouvert.' })
      reload()
    } catch (err) {
      setActionError(errorText(err))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <div className="stack">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour aux événements
      </button>
      <section className="card stack" aria-label="Mes événements">
        <h2>Mes événements</h2>
        <div className="row">
          <button className="btn primary" onClick={onNew}>
            Publier un événement
          </button>
        </div>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {actionError && <ErrorBox message={actionError} />}
        {loading && !data && <Spinner label="Chargement de vos événements…" />}
        {data && events.length === 0 && !error && <p className="muted" style={{ margin: 0 }}>Vous n’avez pas encore publié d’événement.</p>}
      </section>
      <ul className="nb-list" aria-label="Mes événements">
        {events.map((e) => {
          const st = eventStatusInfo(e)
          const busy = busyId === e.id
          return (
            <li key={e.id} className="card stack nb-mine">
              <div className="row">
                <span className={'badge ' + (st.tone === 'neutral' ? '' : st.tone)}>{st.label}</span>
              </div>
              <strong className="nb-card-title">
                <bdi>{e.title}</bdi>
              </strong>
              <span>{formatEventDate(e.startsAt, e.endsAt)}</span>
              <span className="small muted">
                <bdi>{e.place}</bdi> · {interestCountText(e.interestCount)}
              </span>
              <div className="row">
                {st.canCancel && (
                  <button className="btn small tall" disabled={busy || !online} onClick={() => setCancelling(e)}>
                    Annuler l’événement
                  </button>
                )}
                {st.canReopen && (
                  <button className="btn small tall" disabled={busy || !online} onClick={() => void reopen(e)}>
                    Rouvrir
                  </button>
                )}
                {busy && <span className="spinner" />}
              </div>
            </li>
          )
        })}
      </ul>
      {cancelling && (
        <Confirm
          title="Annuler cet événement ?"
          confirmLabel="Annuler l’événement"
          danger
          onClose={() => setCancelling(undefined)}
          onConfirm={async () => {
            await cancelEvent(cancelling.id)
            showToast({ message: 'Événement annulé.' })
            reload()
          }}
        >
          <p style={{ margin: 0 }}>
            « <bdi>{cancelling.title}</bdi> » reste visible, marqué « Annulé ». Vous pourrez le rouvrir.
          </p>
        </Confirm>
      )}
    </div>
  )
}
