import { useEffect, useMemo, useState } from 'react'
import '../../styles/novice-pages.css'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { SPECIES_BY_ID } from '../../data/species'
import { createPost } from '../../lib/neighbors/api'
import { CONDUCT_RULES, categoryRequired } from '../../lib/neighbors/logic'
import { NEIGHBORS_LIMITS, POST_CATEGORIES, POST_CATEGORY_LABELS, POST_KINDS, POST_KIND_LABELS, type Post, type PostCategory, type PostKind } from '../../lib/neighbors/types'
import { showToast } from '../../lib/toast'
import { ErrorBox } from './common'
import { errorText } from './hooks'
import { acceptConduct, conductAccepted } from './prefs'

const HINTS: Record<PostKind, { title: string; body: string }> = {
  don: { title: 'Ex. : boutures de menthe à donner', body: 'Quantité, où et quand passer en parler…' },
  echange: { title: 'Ex. : plants de tomates contre aromatiques', body: 'Ce que vous offrez, ce que vous cherchez.' },
  pret: { title: 'Ex. : prête sécateur et échenilloir', body: 'Durée du prêt, état du matériel.' },
  question: { title: 'Ex. : quelle plante pour un mur à l’ombre ?', body: 'Décrivez le lieu : exposition, sol, place.' },
  cherche: { title: 'Ex. : je cherche une bêche à emprunter', body: 'Ce qu’il vous faut, pour quand, et où.' },
}

export function PostForm({ online, initialKind, pseudo, where, onPublished, onCancel }: { online: boolean; initialKind?: PostKind; pseudo?: string; where?: string; onPublished: (p: Post) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<PostKind>(initialKind ?? 'don')
  const [category, setCategory] = useState<PostCategory>()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [speciesId, setSpeciesId] = useState<string>()
  const [photo, setPhoto] = useState<File>()
  const [picking, setPicking] = useState(false)
  const [step, setStep] = useState<'edit' | 'recap'>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : undefined), [photo])
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl])
  const species = speciesId ? SPECIES_BY_ID[speciesId] : undefined
  const needCategory = categoryRequired(kind)
  const canContinue = !!title.trim() && (!needCategory || !!category)

  async function publish() {
    setBusy(true)
    setError(undefined)
    try {
      const post = await createPost({ kind, category, title, body, speciesId, photo })
      acceptConduct()
      showToast({ message: 'Annonce publiée.' })
      onPublished(post)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  if (step === 'recap') {
    return (
      <section className="card stack" aria-label="Récapitulatif">
        <h2>Vérifiez votre annonce</h2>
        <dl className="np-recap">
          <dt>Type d’annonce</dt>
          <dd>{POST_KIND_LABELS[kind]}</dd>
          {category && (
            <>
              <dt>Catégorie</dt>
              <dd>{POST_CATEGORY_LABELS[category]}</dd>
            </>
          )}
          <dt>Titre</dt>
          <dd>
            <bdi>{title.trim()}</bdi>
          </dd>
          {body.trim() && (
            <>
              <dt>Détails</dt>
              <dd>{body.trim()}</dd>
            </>
          )}
          {species && (
            <>
              <dt>Plante</dt>
              <dd>{species.nomCommun}</dd>
            </>
          )}
          {previewUrl && (
            <>
              <dt>Photo</dt>
              <dd>
                <img className="photo-thumb" src={previewUrl} alt="Photo choisie" />
              </dd>
            </>
          )}
          <dt>Vu par vos voisins</dt>
          <dd>
            {pseudo ? <bdi>{pseudo}</bdi> : 'Votre pseudo'}
            {where ? `, ${where}` : ''}
          </dd>
          <dt>Visible pendant</dt>
          <dd>{NEIGHBORS_LIMITS.postLifetimeDays} jours</dd>
        </dl>
        {!conductAccepted() && (
          <div className="stack">
            <strong>En publiant, vous acceptez ces règles :</strong>
            <ul className="nb-rules">
              {CONDUCT_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <ErrorBox message={error} />}
        {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour publier.</p>}
        <div className="row">
          <button className="btn primary" onClick={() => void publish()} disabled={busy || !online}>
            {busy && <span className="spinner" />} Publier maintenant
          </button>
          <button className="btn" onClick={() => setStep('edit')} disabled={busy}>
            Modifier
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (canContinue && !busy) setStep('recap')
        }}
      >
        <h2>Nouvelle annonce</h2>
        <fieldset className="nb-fieldset">
          <legend>Que voulez-vous faire ?</legend>
          <div className="nb-chips">
            {POST_KINDS.map((k) => (
              <button key={k} type="button" className={'btn small tall' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {POST_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="nb-fieldset">
          <legend>{needCategory ? 'Que cherchez-vous ?' : 'Catégorie (facultatif)'}</legend>
          <div className="nb-chips">
            {POST_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={'btn small tall' + (category === c.id ? ' on' : '')}
                aria-pressed={category === c.id}
                onClick={() => setCategory(category === c.id && !needCategory ? undefined : c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Titre ({title.trim().length}/{NEIGHBORS_LIMITS.titleMax})</span>
          <input className="input" value={title} maxLength={NEIGHBORS_LIMITS.titleMax} placeholder={HINTS[kind].title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>
            Description, facultatif ({body.length}/{NEIGHBORS_LIMITS.bodyMax})
          </span>
          <textarea className="input" rows={5} value={body} maxLength={NEIGHBORS_LIMITS.bodyMax} placeholder={HINTS[kind].body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="stack">
          <strong>Plante concernée (facultatif)</strong>
          <div className="row">
            <button type="button" className="btn" onClick={() => setPicking(true)}>
              {species ? species.nomCommun : 'Choisir une plante'}
            </button>
            {species && (
              <button type="button" className="btn ghost" onClick={() => setSpeciesId(undefined)} aria-label="Retirer la plante">
                Retirer
              </button>
            )}
          </div>
        </div>
        <div className="stack">
          <strong>Photo (facultatif)</strong>
          <label className="btn np-photo-btn">
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            📷 {photo ? 'Changer la photo' : 'Ajouter une photo'}
          </label>
          {previewUrl && (
            <div className="row">
              <img className="photo-thumb" src={previewUrl} alt="Aperçu de la photo choisie" />
              <button type="button" className="btn ghost" onClick={() => setPhoto(undefined)}>
                Retirer la photo
              </button>
            </div>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Le lieu de la photo est effacé avant l’envoi.
          </p>
        </div>
        <p className="alert info small" style={{ margin: 0 }}>
          L’annonce montre votre pseudo et votre quartier. Elle disparaît après {NEIGHBORS_LIMITS.postLifetimeDays} jours.
        </p>
        {error && <ErrorBox message={error} />}
        {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau : reconnectez-vous pour publier.</p>}
        <div className="row">
          <button className="btn primary" type="submit" disabled={!canContinue || busy}>
            Voir le récapitulatif
          </button>
          {!title.trim() && <span className="small muted">Écrivez un titre pour continuer.</span>}
          {title.trim() && needCategory && !category && <span className="small muted">Choisissez ce que vous cherchez.</span>}
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
        </div>
      </form>
      {picking && (
        <SpeciesPicker
          title="Plante concernée"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setSpeciesId(s.id)
            setPicking(false)
          }}
        />
      )}
    </>
  )
}
