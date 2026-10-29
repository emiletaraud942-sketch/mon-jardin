import { useMemo, useState } from 'react'
import { SPECIES_BY_ID, matchesSpecies } from '../../data/species'
import { PlantScene } from '../../components/illustrations'
import { getMyGardenShare, listGardenShares, openThread, saveMyGardenShare, stopGardenShare } from '../../lib/neighbors/api'
import { cuttingRequestText, formatWhen, sameSpecies, speciesToShare } from '../../lib/neighbors/logic'
import type { GardenShare, PostKind, Thread } from '../../lib/neighbors/types'
import { useGardenPlants } from '../../lib/store'
import type { Garden } from '../../types'
import { ErrorBox, Spinner } from './common'
import { errorText, useLoad } from './hooks'

const speciesName = (id: string) => SPECIES_BY_ID[id]?.nomCommun ?? id

const WHAT_IS_SHARED = 'Les voisins voient la liste de vos plantes, par exemple : pommier, romarin.'
const NEVER_SHARED = 'Jamais où elles sont, ni combien, ni vos photos, ni votre adresse.'
const OPTIONAL = 'C’est facultatif. Vous pouvez arrêter quand vous voulez.'
const NOTHING_TO_SHARE = 'Placez d’abord une plante dans votre jardin pour pouvoir le montrer.'
const TOUCH_TO_ASK = 'Touchez une plante pour demander une bouture. Un message est préparé, vous pouvez le changer.'
const NOBODY_YET = 'Aucun voisin ne montre encore son jardin. Soyez le premier, ou publiez une demande.'

interface Props {
  garden: Garden
  online: boolean
  onChat: (thread: Thread, draft: string) => void
  onNew: (kind?: PostKind) => void
}

/** « Jardins » : montrer ce que j'ai dans mon jardin (facultatif) et voir ce que les voisins montrent, pour demander une bouture. */
export function Gardens({ garden, online, onChat, onNew }: Props) {
  const plants = useGardenPlants(garden.id)
  const mine = useLoad(getMyGardenShare, 'mine')
  const others = useLoad(listGardenShares, 'others')
  const toShare = useMemo(() => speciesToShare(plants, (id) => !!SPECIES_BY_ID[id]), [plants])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [asking, setAsking] = useState<string>()

  async function share() {
    setBusy(true)
    setError(undefined)
    try {
      mine.setData(await saveMyGardenShare(toShare))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function stop() {
    setBusy(true)
    setError(undefined)
    try {
      await stopGardenShare()
      mine.setData(null)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  async function ask(s: GardenShare, speciesId: string) {
    setAsking(`${s.userId}|${speciesId}`)
    setError(undefined)
    try {
      onChat(await openThread(s.userId), cuttingRequestText(speciesName(speciesId), s.pseudo))
    } catch (e) {
      setError(errorText(e))
      setAsking(undefined)
    }
  }

  const list = useMemo(() => {
    const q = query.trim()
    const all = others.data ?? []
    if (!q) return all.map((s) => ({ share: s, shown: s.species }))
    return all
      .map((s) => ({ share: s, shown: s.species.filter((id) => (SPECIES_BY_ID[id] ? matchesSpecies(SPECIES_BY_ID[id], q) : id.includes(q.toLowerCase()))) }))
      .filter((x) => x.shown.length > 0)
  }, [others.data, query])

  const sharing = mine.data
  const changed = !!sharing && !sameSpecies(sharing.species, toShare)

  return (
    <div className="stack nb-gardens">
      <section className="card stack" aria-label="Mon jardin pour les voisins">
        <h2 style={{ margin: 0 }}>Montrer ce que j’ai dans mon jardin</h2>
        {mine.error && <ErrorBox message={mine.error} onRetry={mine.reload} />}
        {mine.loading && mine.data === undefined && <Spinner label="Chargement…" />}
        {mine.data === null && (
          <>
            <p style={{ margin: 0 }}>{WHAT_IS_SHARED}</p>
            <p className="small muted" style={{ margin: 0 }}>
              {NEVER_SHARED} {OPTIONAL}
            </p>
            {toShare.length > 0 ? (
              <p className="small" style={{ margin: 0 }}>
                Liste montrée : {toShare.map(speciesName).join(', ')}.
              </p>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                {NOTHING_TO_SHARE}
              </p>
            )}
            <div className="row">
              <button className="btn primary" disabled={!online || busy || toShare.length === 0} onClick={share}>
                {busy && <span className="spinner" />} Montrer mon jardin
              </button>
            </div>
          </>
        )}
        {sharing && (
          <>
            <p style={{ margin: 0 }} role="status">
              Votre jardin est visible : {sharing.species.length} plante{sharing.species.length > 1 ? 's' : ''} différente{sharing.species.length > 1 ? 's' : ''}.
            </p>
            {changed && (
              <p className="alert small" style={{ margin: 0 }}>
                Votre jardin a changé depuis le dernier envoi.
              </p>
            )}
            <div className="row">
              {changed && (
                <button className="btn primary" disabled={!online || busy} onClick={share}>
                  Mettre à jour la liste
                </button>
              )}
              <button className="btn" disabled={!online || busy} onClick={stop}>
                Ne plus montrer mon jardin
              </button>
            </div>
          </>
        )}
      </section>

      {error && <ErrorBox message={error} />}

      <section className="stack" aria-label="Jardins des voisins">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Chez mes voisins</h2>
          <button className="btn small" onClick={() => onNew('cherche')}>
            Publier une demande de bouture
          </button>
        </div>
        {others.error && <ErrorBox message={others.error} onRetry={others.reload} />}
        {others.loading && !others.data && <Spinner label="Chargement des jardins…" />}
        {others.data && others.data.length > 0 && (
          <>
            <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Quelle plante cherchez-vous ?" aria-label="Chercher une plante chez les voisins" />
            <p className="small muted" style={{ margin: 0 }}>
              {TOUCH_TO_ASK}
            </p>
            <ul className="nb-list" aria-label="Jardins des voisins">
              {list.map(({ share: s, shown }) => (
                <li key={s.userId} className="card stack nb-garden">
                  <span className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong>
                      <bdi>{s.pseudo}</bdi>
                    </strong>
                    <span className="small muted">Mis à jour {formatWhen(s.updatedAt)}</span>
                  </span>
                  <span className="nb-chips" role="group" aria-label={`Plantes de ${s.pseudo}`}>
                    {shown.map((id) => (
                      <button key={id} className="btn small tall" disabled={!online || asking === `${s.userId}|${id}`} aria-label={`Demander une bouture de ${speciesName(id)} à ${s.pseudo}`} onClick={() => ask(s, id)}>
                        {speciesName(id)}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            {list.length === 0 && <p className="muted">Aucun voisin n’a cette plante pour l’instant.</p>}
          </>
        )}
        {others.data && others.data.length === 0 && !others.error && (
          <div className="card nb-empty">
            <PlantScene size={104} variant="house" />
            <p style={{ margin: 0 }}>{NOBODY_YET}</p>
          </div>
        )}
      </section>
      {!online && <p className="small muted">Pas de réseau : la liste peut être dépassée.</p>}
    </div>
  )
}
