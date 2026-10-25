import { InviteButton } from '../../components/InviteButton'
import { formatWhen } from '../../lib/neighbors/logic'
import { badgeLabel, newsLines, type NewsTarget } from '../../lib/neighbors/news'
import type { NewsData } from '../../lib/neighbors/newsLoad'
import { ErrorBox, Spinner } from './common'
import type { Loaded } from './hooks'

/** Premier écran de l'entraide : ce qui est arrivé depuis la dernière visite. Chaque ligne mène à la bonne liste. */
export function Nouveautes({ news, onGo, onNew }: { news: Loaded<NewsData>; onGo: (t: NewsTarget) => void; onNew: () => void }) {
  const { data, error, loading, reload } = news
  const lines = data ? newsLines(data) : []
  return (
    <div className="stack nb-news">
      <section className="card stack" aria-label="Nouveautés">
        <h2>Nouveautés près de chez vous</h2>
        {error && <ErrorBox message={error} onRetry={reload} />}
        {loading && !data && <Spinner label="Recherche des nouveautés…" />}
        {data && lines.length > 0 && (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {data.since ? `Dernière visite : ${formatWhen(data.since)}.` : 'Première visite : voici ce qui vous attend.'}
            </p>
            <ul className="nb-list" aria-label="Nouveautés">
              {lines.map((l) => (
                <li key={l.id}>
                  <button className="nb-card nb-news-line" onClick={() => onGo(l.target)}>
                    <span className="nb-news-count" aria-hidden="true">
                      {badgeLabel(l.count)}
                    </span>
                    <strong>
                      {l.count} {l.text}
                    </strong>
                    <span className="nb-news-go" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {data && lines.length === 0 && (
          <p style={{ margin: 0 }}>
            {data.since ? 'Rien de nouveau depuis votre dernière visite.' : 'Bienvenue ! Dès la prochaine visite, vous verrez ici ce qui est nouveau.'}
          </p>
        )}
        <div className="row">
          <button className="btn primary" onClick={onNew}>
            Publier une annonce
          </button>
          <button className="btn" onClick={() => onGo({ section: 'fil', kind: 'all' })}>
            Voir toutes les annonces
          </button>
        </div>
      </section>
      <section className="card stack" aria-label="Inviter un voisin">
        <h2>Inviter un voisin</h2>
        <p style={{ margin: 0 }}>Plus il y a de jardiniers, plus il y a de dons et d’échanges. Vous choisissez qui reçoit le message.</p>
        <InviteButton label="Inviter un voisin" copyLabel="Copier le lien pour inviter un voisin" />
      </section>
    </div>
  )
}
