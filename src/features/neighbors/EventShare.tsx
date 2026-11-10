import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { downloadBlob } from '../../lib/backup'
import type { EventItem } from '../../lib/neighbors/types'
import { shareOrCopy, type ShareResult } from '../../lib/shareText'
import { showToast } from '../../lib/toast'

/**
 * Bouton qui partage un texte : feuille de partage du téléphone, sinon copie ; si la copie est refusée, le texte s'affiche à copier à la main.
 * Rien ne part tout seul. `getText` peut charger son module à la demande.
 */
export function ShareTextButton({
  label,
  ariaLabel,
  title,
  getText,
  messageFor,
  icon = 'share',
  className = 'btn',
}: {
  label: string
  ariaLabel?: string
  title: string
  getText: () => Promise<string>
  messageFor: (r: ShareResult) => string
  icon?: string
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ShareResult>()
  const [text, setText] = useState('')
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (result === 'manual') fieldRef.current?.select()
  }, [result])

  async function go() {
    if (busy) return
    setBusy(true)
    try {
      const t = await getText()
      setText(t)
      const r = await shareOrCopy(t, title)
      setResult(r)
      if (r === 'copied') showToast({ message: messageFor(r) })
    } finally {
      setBusy(false)
    }
  }
  const msg = result && result !== 'cancelled' && result !== 'copied' ? messageFor(result) : ''
  return (
    <>
      <button className={className} onClick={() => void go()} disabled={busy} aria-label={ariaLabel}>
        <Icon name={icon} /> {label}
      </button>
      {msg && (
        <p className="small nb-share-msg" role="status" style={{ margin: 0, flexBasis: '100%' }}>
          {msg}
        </p>
      )}
      {result === 'manual' && <textarea ref={fieldRef} className="input nb-share-text" readOnly rows={5} value={text} aria-label="Texte à copier" onFocus={(e) => e.currentTarget.select()} />}
    </>
  )
}

/** « Ajouter à mon calendrier » : télécharge un fichier .ics (deux rappels : la veille et une heure avant). Chargé à la demande. */
export function CalendarButton({ event }: { event: EventItem }) {
  const [error, setError] = useState<string>()
  async function go() {
    setError(undefined)
    const { buildEventIcs, eventIcsFilename } = await import('../../lib/neighbors/eventIcs')
    const text = buildEventIcs(event)
    if (!text) return setError('La date de cet événement est illisible : impossible de l’ajouter au calendrier.')
    downloadBlob(new Blob([text], { type: 'text/calendar;charset=utf-8' }), eventIcsFilename(event.title))
    showToast({ message: 'Rendez-vous enregistré. Ouvrez le fichier pour l’ajouter à votre agenda. Rappels : la veille et une heure avant.' })
  }
  return (
    <>
      <button className="btn" onClick={() => void go()} aria-label={`Ajouter à mon calendrier : ${event.title}`} data-event-action="calendar">
        <Icon name="calendar" /> Ajouter à mon calendrier
      </button>
      {error && (
        <p className="small alert" role="alert" style={{ margin: 0, flexBasis: '100%' }}>
          {error}
        </p>
      )}
    </>
  )
}

/** Les deux boutons d'un événement à venir : calendrier et partage. */
export function EventShareButtons({ event }: { event: EventItem }) {
  return (
    <div className="row nb-event-share">
      <CalendarButton event={event} />
      <ShareTextButton
        label="Partager"
        ariaLabel={`Partager cet événement : ${event.title}`}
        title={event.title}
        getText={async () => {
          const { buildEventShareText } = await import('../../lib/neighbors/eventShare')
          return buildEventShareText(event, typeof location === 'undefined' ? '' : location.origin)
        }}
        messageFor={(r) => (r === 'copied' ? 'Copié. Collez le texte dans un message.' : 'Copiez ce texte, puis collez-le dans un message.')}
      />
    </div>
  )
}

/** « Inviter une association ou une mairie à publier » : un texte court à envoyer soi-même. */
export function OrganizerInviteButton() {
  return (
    <ShareTextButton
      label="Inviter une association ou une mairie à publier"
      title="PermaJardin : publier vos rendez-vous"
      icon="users"
      getText={async () => {
        const { organizerInviteText } = await import('../../lib/neighbors/organizerInvite')
        return organizerInviteText(typeof location === 'undefined' ? '' : location.origin)
      }}
      messageFor={(r) => (r === 'copied' ? 'Texte copié. Collez-le dans un message à l’association ou à la mairie.' : 'Copiez ce texte, puis collez-le dans un message.')}
    />
  )
}
