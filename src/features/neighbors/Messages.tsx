import { useEffect, useMemo, useRef, useState } from 'react'
import { blockUser, listMessages, listThreads, markThreadRead, sendMessage } from '../../lib/neighbors/api'
import { formatWhen, sameIds } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS, type Message, type Thread } from '../../lib/neighbors/types'
import { notifyNewsChanged } from '../../lib/neighbors/news'
import { showToast } from '../../lib/toast'
import { Confirm, ErrorBox, ReportDialog, Spinner } from './common'
import { errorText, useLoad, usePolling } from './hooks'

export const POLL_MS = 30_000

export function ThreadList({ online, unread, onOpen }: { online: boolean; unread?: Record<string, number>; onOpen: (t: Thread) => void }) {
  const { data, error, loading, reload, setData } = useLoad(listThreads, 'threads')
  usePolling(
    () => {
      // Actualisation silencieuse : on ne remplace la liste que si elle a changé.
      listThreads()
        .then((next) => {
          if (!data || !sameIds(data, next) || next.some((t, i) => t.lastMessageAt !== data[i]?.lastMessageAt)) setData(next)
        })
        .catch(() => undefined)
    },
    POLL_MS,
  )
  const threads = useMemo(() => data ?? [], [data])
  return (
    <div className="stack">
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Chargement des conversations…" />}
      {data && threads.length === 0 && !error && (
        <div className="card nb-empty">
          <h2>Aucune conversation</h2>
          <p style={{ margin: 0 }}>Ouvrez une annonce et touchez « Écrire en privé » pour demander ou proposer quelque chose. Vos échanges restent privés.</p>
        </div>
      )}
      <ul className="nb-list" aria-label="Conversations">
        {threads.map((t) => (
          <li key={t.id}>
            <button className="nb-card" onClick={() => onOpen(t)}>
              <strong className="nb-card-title">
                <bdi>{t.otherPseudo}</bdi>
                {(unread?.[t.id] ?? 0) > 0 && <span className="badge count nb-unread"> {unread?.[t.id]} à lire</span>}
              </strong>
              <span className="small muted">Dernier message {formatWhen(t.lastMessageAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {!online && <p className="small muted">Pas de réseau : la liste peut être dépassée.</p>}
    </div>
  )
}

/** `draft` : message proposé (modifiable) quand on arrive depuis « J’ai ce qu’il cherche ». */
export function ThreadView({ thread, postTitle, draft, online, onBack }: { thread: Thread; postTitle?: string; draft?: string; online: boolean; onBack: () => void }) {
  const { data, error, loading, reload, setData } = useLoad(() => listMessages(thread.id), thread.id)
  const messages = useMemo(() => data ?? [], [data])
  const [text, setText] = useState(draft ?? '')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string>()
  const [dialog, setDialog] = useState<{ k: 'report-person' } | { k: 'report-msg'; id: string } | { k: 'block' }>()
  const endRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  // Message proposé : on l'amène à l'écran, sans ouvrir le clavier.
  useEffect(() => {
    if (draft) draftRef.current?.scrollIntoView?.({ block: 'center' })
  }, [draft])

  usePolling(() => {
    listMessages(thread.id)
      .then((next) => {
        if (!data || !sameIds(data, next)) setData(next)
      })
      .catch(() => undefined)
  }, POLL_MS)

  const lastId = messages[messages.length - 1]?.id
  // La conversation est ouverte : tout ce qui s'affiche est lu. Un échec n'est pas grave (le compteur sera juste un peu trop haut).
  useEffect(() => {
    if (!data) return
    markThreadRead(thread.id)
      .then(() => notifyNewsChanged())
      .catch(() => undefined)
  }, [thread.id, lastId, !!data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [lastId])

  async function send() {
    if (!text.trim() || busy) return
    setBusy(true)
    setSendError(undefined)
    try {
      const m = await sendMessage(thread.id, text)
      setData([...messages, m])
      setText('')
    } catch (e) {
      setSendError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack nb-thread">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour
      </button>
      <div className="card stack">
        <h2 style={{ margin: 0 }}>
          <bdi>{thread.otherPseudo}</bdi>
        </h2>
        <div className="row">
          <button className="btn small tall" onClick={() => setDialog({ k: 'report-person' })}>
            Signaler
          </button>
          <button className="btn small tall danger" onClick={() => setDialog({ k: 'block' })}>
            Ne plus voir cette personne
          </button>
        </div>
        {postTitle && <p className="small muted" style={{ margin: 0 }}>À propos de : <bdi>{postTitle}</bdi></p>}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data && <Spinner label="Chargement des messages…" />}
        {data && messages.length === 0 && <p className="muted" style={{ margin: 0 }}>Pas encore de message. Présentez-vous et dites ce qui vous intéresse.</p>}
        <ul className="nb-msgs" aria-label="Messages" aria-live="polite">
          {messages.map((m: Message) => (
            <li key={m.id} className={'nb-msg' + (m.mine ? ' mine' : '')}>
              <p className="nb-body" style={{ margin: 0 }}>{m.body}</p>
              <span className="small muted">
                {formatWhen(m.createdAt)}
                {!m.mine && (
                  <>
                    {' · '}
                    <button className="link-btn" onClick={() => setDialog({ k: 'report-msg', id: m.id })}>
                      Signaler
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <label className="field">
          <span className="sr-only">Votre message</span>
          <textarea ref={draftRef} className="input" rows={draft ? 4 : 2} maxLength={NEIGHBORS_LIMITS.messageMax} placeholder="Votre message" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {draft && text === draft && <p className="small muted" style={{ margin: 0 }}>Message proposé. Vous pouvez le changer avant de l’envoyer.</p>}
        {sendError && <ErrorBox message={sendError} />}
        <button className="btn primary" type="submit" disabled={!text.trim() || busy || !online}>
          {busy && <span className="spinner" />} Envoyer
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Pas d’adresse, de téléphone ni de vente dans les messages.
        </p>
      </form>

      {dialog?.k === 'report-person' && <ReportDialog target="profile" targetId={thread.otherId} what={thread.otherPseudo} onClose={() => setDialog(undefined)} />}
      {dialog?.k === 'report-msg' && <ReportDialog target="message" targetId={dialog.id} what="ce message" onClose={() => setDialog(undefined)} />}
      {dialog?.k === 'block' && (
        <Confirm
          title={`Ne plus voir ${thread.otherPseudo} ?`}
          confirmLabel="Ne plus voir cette personne"
          danger
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await blockUser(thread.otherId)
            showToast({ message: `Vous ne verrez plus ${thread.otherPseudo}.` })
            onBack()
          }}
        >
          <p style={{ margin: 0 }}>La conversation disparaît de votre liste. Vous pourrez changer d’avis dans l’onglet Profil.</p>
        </Confirm>
      )}
    </div>
  )
}
