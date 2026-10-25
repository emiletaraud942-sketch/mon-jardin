import { useMemo, useState } from 'react'
import { closePost, deletePost, listMyPosts, reopenPost } from '../../lib/neighbors/api'
import { formatWhen, postStatusInfo } from '../../lib/neighbors/logic'
import type { Post } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { CategoryBadge, Confirm, ErrorBox, KindBadge, Spinner } from './common'
import { errorText, useLoad } from './hooks'

export function MyPosts({ online, onOpen, onNew }: { online: boolean; onOpen: (p: Post) => void; onNew: () => void }) {
  const { data, error, loading, reload } = useLoad(listMyPosts, 'mine')
  const posts = useMemo(() => data ?? [], [data])
  const [busyId, setBusyId] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [deleting, setDeleting] = useState<Post>()

  async function change(p: Post, fn: (id: string) => Promise<void>, done: string) {
    setBusyId(p.id)
    setActionError(undefined)
    try {
      await fn(p.id)
      showToast({ message: done })
      reload()
    } catch (e) {
      setActionError(errorText(e))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && <ErrorBox message={actionError} />}
      {loading && !data && <Spinner label="Chargement de vos annonces…" />}
      {data && posts.length === 0 && !error && (
        <div className="card nb-empty">
          <h2>Vous n’avez pas d’annonce</h2>
          <p style={{ margin: 0 }}>Donnez un surplus, prêtez un outil, cherchez quelque chose ou posez une question.</p>
          <div className="row">
            <button className="btn primary" onClick={onNew}>
              Publier une annonce
            </button>
          </div>
        </div>
      )}
      <ul className="nb-list" aria-label="Mes annonces">
        {posts.map((p) => {
          const st = postStatusInfo(p)
          const busy = busyId === p.id
          return (
            <li key={p.id} className="card stack nb-mine">
              <div className="row">
                <KindBadge kind={p.kind} />
                <CategoryBadge category={p.category} />
                <span className={'badge ' + (st.tone === 'neutral' ? '' : st.tone)}>{st.label}</span>
              </div>
              <button className="link-btn nb-mine-title" onClick={() => onOpen(p)}>
                <bdi>{p.title}</bdi>
              </button>
              <span className="small muted">Publiée {formatWhen(p.createdAt)}</span>
              <div className="row">
                {st.canClose && (
                  <button className="btn small tall" disabled={busy || !online} onClick={() => void change(p, closePost, 'Annonce terminée.')}>
                    Terminer l’annonce
                  </button>
                )}
                {st.canReopen && (
                  <button className="btn small tall" disabled={busy || !online} onClick={() => void change(p, reopenPost, 'Annonce rouverte.')}>
                    Rouvrir
                  </button>
                )}
                <button className="btn small tall danger" disabled={busy || !online} onClick={() => setDeleting(p)}>
                  Supprimer
                </button>
                {busy && <span className="spinner" />}
              </div>
            </li>
          )
        })}
      </ul>
      {deleting && (
        <Confirm
          title="Supprimer cette annonce ?"
          confirmLabel="Supprimer"
          danger
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await deletePost(deleting.id)
            showToast({ message: 'Annonce supprimée.' })
            reload()
          }}
        >
          <p style={{ margin: 0 }}>« <bdi>{deleting.title}</bdi> » et sa photo seront supprimées. Cela ne rend pas votre limite du jour.</p>
        </Confirm>
      )}
    </div>
  )
}
