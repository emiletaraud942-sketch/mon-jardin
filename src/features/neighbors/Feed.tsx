import { useMemo } from 'react'
import { SPECIES_BY_ID } from '../../data/species'
import { listPosts } from '../../lib/neighbors/api'
import { CATEGORY_FILTERS, KIND_FILTERS, RADII, categoryOption, emptyFeedText, formatWhen, kindOption, parseCategoryFilter, type CategoryFilter, type KindFilter } from '../../lib/neighbors/logic'
import type { Post, PostKind } from '../../lib/neighbors/types'
import { CategoryBadge, ErrorBox, KindBadge, Spinner } from './common'
import { useLoad } from './hooks'
import { PlantScene } from '../../components/illustrations'

export function PostCard({ post, onOpen }: { post: Post; onOpen: (p: Post) => void }) {
  const species = post.speciesId ? SPECIES_BY_ID[post.speciesId] : undefined
  return (
    <button className="nb-card" onClick={() => onOpen(post)} aria-label={`${post.title}, ${post.distanceLabel}`}>
      <span className="row nb-card-top">
        <KindBadge kind={post.kind} />
        <CategoryBadge category={post.category} />
        <span className="small muted">{post.distanceLabel}</span>
        {post.photoPath && <span className="badge">📷 Photo</span>}
      </span>
      <strong className="nb-card-title">
        <bdi>{post.title}</bdi>
      </strong>
      {species && <span className="small muted">{species.nomCommun}</span>}
      <span className="small muted">
        {post.mine ? 'Vous' : <bdi>{post.authorPseudo}</bdi>} · {formatWhen(post.createdAt)}
      </span>
    </button>
  )
}

export function Feed({
  kind,
  category,
  radius,
  online,
  onKind,
  onCategory,
  onRadius,
  onOpen,
  onNew,
}: {
  kind: KindFilter
  category: CategoryFilter
  radius: number
  online: boolean
  onKind: (k: KindFilter) => void
  onCategory: (c: CategoryFilter) => void
  onRadius: (r: number) => void
  onOpen: (p: Post) => void
  onNew: (kind?: PostKind) => void
}) {
  const key = `${kind}|${category}|${radius}`
  const { data, error, loading, reload } = useLoad(() => listPosts({ kind: kindOption(kind), category: categoryOption(category), radiusKm: radius }), key)
  const empty = emptyFeedText(kind, category)
  const posts = useMemo(() => data ?? [], [data])

  return (
    <div className="stack nb-feed">
      <div className="nb-toolbar">
        <div className="nb-chips" role="group" aria-label="Type d’annonce">
          {KIND_FILTERS.map((f) => (
            <button key={f.id} className={'btn small tall' + (kind === f.id ? ' on' : '')} aria-pressed={kind === f.id} onClick={() => onKind(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="row small nb-cat-row" style={{ gap: 6 }}>
          <span>Catégorie</span>
          <select className="input nb-cat" value={category} onChange={(e) => onCategory(parseCategoryFilter(e.target.value))} aria-label="Catégorie d’annonce">
            {CATEGORY_FILTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
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
          <span className="spacer" />
          <button className="btn primary" onClick={() => onNew(kind === 'cherche' ? 'cherche' : undefined)}>
            {kind === 'cherche' ? 'Je cherche quelque chose' : 'Publier une annonce'}
          </button>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner label="Chargement des annonces…" />}
      {data && (
        <ul className="nb-list" aria-label="Annonces" aria-busy={loading}>
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {data && posts.length === 0 && !error && (
        <div className="card nb-empty">
          <PlantScene size={104} variant="house" />
          <h2>{empty.title}</h2>
          <p style={{ margin: 0 }}>{empty.hint}</p>
          {kind === 'all' && category === 'all' && (
            <ul className="nb-ideas">
              <li>Don de boutures, de graines ou de surplus du potager.</li>
              <li>Prêt d’un outil : sécateur, bêche, broyeur.</li>
              <li>Échange de plants contre d’autres plants.</li>
              <li>Une question : quelle plante pour un coin à l’ombre ?</li>
              <li>Une demande : « Je cherche une bêche à emprunter. »</li>
            </ul>
          )}
          <div className="row">
            <button className="btn primary" onClick={() => onNew(kind === 'cherche' ? 'cherche' : undefined)}>
              {kind === 'cherche' ? 'Je cherche quelque chose' : 'Publier une annonce'}
            </button>
            {radius < RADII[RADII.length - 1] && (
              <button className="btn" onClick={() => onRadius(RADII[RADII.length - 1])}>
                Élargir à {RADII[RADII.length - 1]} km
              </button>
            )}
            {category !== 'all' && (
              <button className="btn" onClick={() => onCategory('all')}>
                Toutes les catégories
              </button>
            )}
            {kind !== 'all' && (
              <button className="btn" onClick={() => onKind('all')}>
                Tout voir
              </button>
            )}
          </div>
        </div>
      )}
      {!online && <p className="small muted">Pas de réseau : la liste peut être dépassée.</p>}
    </div>
  )
}
