import { useEffect, useMemo, useState } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { addReply, blockUser, deleteReply, getPhotoUrl, listReplies, openThread } from '../../lib/neighbors/api'
import { formatWhen, offerMessage } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS, type Post, type Reply, type Thread } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { openSpecies } from '../../lib/ui'
import { CategoryBadge, Confirm, ErrorBox, KindBadge, ReportDialog, Spinner } from './common'
import { errorText, useLoad } from './hooks'

type Dialog = { k: 'report-post' } | { k: 'report-reply'; reply: Reply } | { k: 'block'; id: string; pseudo: string } | { k: 'delete-reply'; reply: Reply }

export function PostDetail({ post, online, onBack, onChat }: { post: Post; online: boolean; onBack: () => void; onChat: (t: Thread, post: Post, draft?: string) => void }) {
  const [photo, setPhoto] = useState<string | null>()
  const [dialog, setDialog] = useState<Dialog>()
  const [chatBusy, setChatBusy] = useState(false)
  const [error, setError] = useState<string>()
  const species = post.speciesId ? SPECIES_BY_ID[post.speciesId] : undefined
  const isQuestion = post.kind === 'question'
  const isRequest = post.kind === 'cherche'

  useEffect(() => {
    let alive = true
    let url: string | null = null
    setPhoto(undefined)
    if (post.photoPath) {
      void getPhotoUrl(post.photoPath).then((u) => {
        url = u
        if (alive) setPhoto(u)
        else if (u) URL.revokeObjectURL(u)
      })
    } else setPhoto(null)
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url) // URL blob: libérée au démontage ou au changement d'annonce
    }
  }, [post.photoPath])

  const replies = useLoad(() => listReplies(post.id), post.id, isQuestion)
  const replyList = useMemo(() => replies.data ?? [], [replies.data])

  async function chat(prefill?: string) {
    setChatBusy(true)
    setError(undefined)
    try {
      onChat(await openThread(post.authorId, post.id), post, prefill)
    } catch (e) {
      setError(errorText(e))
      setChatBusy(false)
    }
  }

  return (
    <div className="stack nb-detail">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour aux annonces
      </button>
      <article className="card stack">
        <div className="row">
          <KindBadge kind={post.kind} />
          <CategoryBadge category={post.category} />
          <span className="small muted">{post.distanceLabel}</span>
          {post.status !== 'open' && <span className="badge warn">{post.status === 'closed' ? 'Terminée' : 'Masquée'}</span>}
        </div>
        <h2 style={{ margin: 0 }}>
          <bdi>{post.title}</bdi>
        </h2>
        <p className="small muted" style={{ margin: 0 }}>
          {post.mine ? 'Vous' : <bdi>{post.authorPseudo}</bdi>} · {formatWhen(post.createdAt)}
        </p>
        {post.photoPath && photo === undefined && <Spinner label="Chargement de la photo…" />}
        {photo && <img className="nb-photo" src={photo} alt={`Photo de l’annonce : ${post.title}`} />}
        {post.photoPath && photo === null && <p className="small muted">La photo n’a pas pu être chargée.</p>}
        {post.body && <p className="nb-body">{post.body}</p>}
        {species && (
          <p style={{ margin: 0 }}>
            Espèce : <strong>{species.nomCommun}</strong>{' '}
            <button className="link-btn" onClick={() => openSpecies(species.id)}>
              Voir la fiche
            </button>
          </p>
        )}
        {error && <ErrorBox message={error} />}
        {!post.mine && isRequest && (
          <p className="small muted" style={{ margin: 0 }}>
            Cette demande n’a pas de réponses publiques. Répondez en privé.
          </p>
        )}
        {!post.mine ? (
          <div className="row">
            {isRequest && post.status === 'open' && (
              <button className="btn primary" onClick={() => void chat(offerMessage(post))} disabled={chatBusy || !online}>
                {chatBusy && <span className="spinner" />} J’ai ce qu’il cherche
              </button>
            )}
            <button className={'btn' + (isRequest && post.status === 'open' ? '' : ' primary')} onClick={() => void chat()} disabled={chatBusy || !online}>
              {chatBusy && !isRequest && <span className="spinner" />} Écrire en privé
            </button>
            <button className="btn" onClick={() => setDialog({ k: 'report-post' })}>
              Signaler
            </button>
            <button className="btn danger" onClick={() => setDialog({ k: 'block', id: post.authorId, pseudo: post.authorPseudo })}>
              Ne plus voir cette personne
            </button>
          </div>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            C’est votre annonce. Terminez-la ou supprimez-la dans l’onglet « Mes annonces ».
          </p>
        )}
      </article>

      {isQuestion && (
        <section className="card stack" aria-label="Réponses">
          <h3 style={{ margin: 0 }}>Réponses</h3>
          {replies.error && <ErrorBox message={replies.error} onRetry={replies.reload} />}
          {replies.loading && !replies.data && <Spinner label="Chargement des réponses…" />}
          {replies.data && replyList.length === 0 && <p className="muted" style={{ margin: 0 }}>Pas encore de réponse. Soyez le premier à aider.</p>}
          <ul className="nb-replies">
            {replyList.map((r) => (
              <li key={r.id}>
                <p className="small muted" style={{ margin: 0 }}>
                  <strong>{r.mine ? 'Vous' : <bdi>{r.authorPseudo}</bdi>}</strong> · {formatWhen(r.createdAt)}
                </p>
                <p className="nb-body">{r.body}</p>
                <div className="row">
                  {!r.mine && (
                    <button className="btn small tall" onClick={() => setDialog({ k: 'report-reply', reply: r })}>
                      Signaler
                    </button>
                  )}
                  {!r.mine && (
                    <button className="btn small tall danger" onClick={() => setDialog({ k: 'block', id: r.authorId, pseudo: r.authorPseudo })}>
                      Ne plus voir cette personne
                    </button>
                  )}
                  {(r.mine || post.mine) && (
                    <button className="btn small tall" onClick={() => setDialog({ k: 'delete-reply', reply: r })}>
                      Supprimer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {post.status === 'open' ? (
            <ReplyForm
              postId={post.id}
              online={online}
              onAdded={(r) => {
                replies.setData([...replyList, r])
              }}
            />
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              Cette question est terminée. On ne peut plus répondre.
            </p>
          )}
        </section>
      )}

      {dialog?.k === 'report-post' && <ReportDialog target="post" targetId={post.id} what="cette annonce" onClose={() => setDialog(undefined)} />}
      {dialog?.k === 'report-reply' && <ReportDialog target="reply" targetId={dialog.reply.id} what="cette réponse" onClose={() => setDialog(undefined)} />}
      {dialog?.k === 'block' && (
        <Confirm
          title={`Ne plus voir ${dialog.pseudo} ?`}
          confirmLabel="Ne plus voir cette personne"
          danger
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await blockUser(dialog.id)
            showToast({ message: `Vous ne verrez plus ${dialog.pseudo}.` })
            onBack()
          }}
        >
          <p style={{ margin: 0 }}>Vous ne verrez plus ses annonces ni ses messages, et cette personne ne verra plus les vôtres. Vous pourrez changer d’avis dans l’onglet Profil.</p>
        </Confirm>
      )}
      {dialog?.k === 'delete-reply' && (
        <Confirm
          title="Supprimer cette réponse ?"
          confirmLabel="Supprimer"
          danger
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await deleteReply(dialog.reply.id)
            replies.setData(replyList.filter((x) => x.id !== dialog.reply.id))
          }}
        >
          <p style={{ margin: 0 }}>La réponse disparaît pour tout le monde.</p>
        </Confirm>
      )}
    </div>
  )
}

function ReplyForm({ postId, online, onAdded }: { postId: string; online: boolean; onAdded: (r: Reply) => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim() || busy) return
        setBusy(true)
        setError(undefined)
        try {
          onAdded(await addReply(postId, text))
          setText('')
        } catch (err) {
          setError(errorText(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="field">
        <span>Votre réponse</span>
        <textarea className="input" rows={3} maxLength={NEIGHBORS_LIMITS.bodyMax} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {error && <ErrorBox message={error} />}
      <button className="btn primary" type="submit" disabled={!text.trim() || busy || !online}>
        {busy && <span className="spinner" />} Répondre
      </button>
    </form>
  )
}
