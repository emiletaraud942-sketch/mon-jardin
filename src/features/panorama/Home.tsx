import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import { PlantScene } from '../../components/illustrations'
import { getPhoto } from '../../lib/photos'
import { useAutoSyncState } from '../../lib/autoSync'
import { FEATURES } from '../../lib/features'
import { setActiveGarden, useStore } from '../../lib/store'
import type { Garden } from '../../types'
import { canAddPoint, MAX_BYTES, MAX_POINTS, photoDateLabel, pointName, refusalMessage, sizeLabel } from './geometry'
import { metaBytes, noteBytes, panoramasOf, pointBytes } from './panoData'
import { closePanorama, openPanorama } from './panoUi'
import { tourOrder } from './tour'

interface Info {
  url?: string
  bytes: number
}

/** Ce que font (et ne font pas) ces photos, pour ne pas les confondre avec « Scanner mon jardin ». */
const NOT_A_SCAN = 'Ces photos ne reconnaissent pas les plantes toutes seules. Pour trouver le nom d’une plante, utilisez « Identifier une plante par photo », ou « Scanner mon jardin » puis « Filmer en marchant ».'

/**
 * Points dont aucune photo n'est sur CE téléphone (données arrivées par la copie en ligne, photos pas encore reçues ou jamais envoyées).
 * Propose de les récupérer et dit pourquoi si ce n'est pas possible.
 */
function MissingPhotos({ count }: { count: number }) {
  const [state, setState] = useState<{ busy: boolean; text?: string }>({ busy: false })
  async function fetchThem() {
    setState({ busy: true })
    try {
      const sync = await import('../../lib/sync')
      if (!sync.syncAvailable()) return setState({ busy: false, text: 'La copie en ligne n’est pas disponible dans cette version de l’appli.' })
      if (!(await sync.currentUser())) return setState({ busy: false, text: 'Connectez-vous d’abord (Réglages > « Retrouver mes jardins sur un autre appareil »).' })
      const r = await sync.syncPhotos()
      const parts: string[] = []
      if (r.downloaded > 0) parts.push(`${r.downloaded} photo${r.downloaded > 1 ? 's reçues' : ' reçue'}.`)
      if (r.failed > 0) parts.push(`${r.failed} n’ont pas pu être reçues : réessayez avec une bonne connexion.`)
      if (r.skipped > 0) parts.push(`${r.skipped} sont restées sur l’autre téléphone (trop lourdes ou plus de place en ligne).`)
      if (parts.length === 0) parts.push('Rien à recevoir : ces photos n’ont jamais été envoyées en ligne. Ouvrez l’appli sur le téléphone qui les a prises, connecté à la copie en ligne : elles partiront toutes seules.')
      setState({ busy: false, text: parts.join(' ') })
    } catch (e) {
      setState({ busy: false, text: `Impossible pour le moment (${e instanceof Error ? e.message.replace(/\.$/, '') : 'erreur inconnue'}).` })
    }
  }
  return (
    <div className="alert warn small" role="status" data-feat="photos-manquantes">
      <p style={{ margin: 0 }}>
        {count === 1 ? 'Les photos d’un point de vue ne sont pas sur ce téléphone.' : `Les photos de ${count} points de vue ne sont pas sur ce téléphone.`} Les photos voyagent par la copie en ligne, seulement si elle est activée sur les deux téléphones.
      </p>
      <button className="btn small" disabled={state.busy} onClick={() => void fetchThem()} style={{ marginTop: 8 }}>
        {state.busy ? 'Recherche…' : 'Récupérer mes photos'}
      </button>
      {state.text && <p style={{ margin: '8px 0 0' }}>{state.text}</p>}
    </div>
  )
}

const SYNC_CONFIGURED = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

/** Prévient, tant que la copie en ligne n'est pas active, que ces photos ne sont que sur ce téléphone (un seul geste pour les protéger). */
function PhotosOnlyHere() {
  const auto = useAutoSyncState()
  if (!SYNC_CONFIGURED || auto.status !== 'inactif') return null
  return (
    <div className="alert warn small" role="status" data-feat="photos-seulement-ici">
      <p style={{ margin: 0 }}>
        <strong>Ces photos ne sont que sur ce téléphone.</strong> Si vous l’effacez ou le changez, elles seront perdues. Avec la copie en ligne (gratuite, avec votre e-mail), elles sont sauvegardées toutes seules.
      </p>
      <button
        className="btn small primary"
        style={{ marginTop: 8 }}
        onClick={() => {
          closePanorama()
          FEATURES.find((f) => f.id === 'synchro')?.run()
        }}
      >
        Les sauvegarder en ligne
      </button>
    </div>
  )
}

/** Liste des points de vue du jardin, ou explication quand il n'y en a pas encore. */
export function Home({ garden }: { garden: Garden }) {
  const points = panoramasOf(garden)
  // Des points de vue peuvent exister dans UN AUTRE jardin de ce téléphone (la liste n'affiche que le jardin ouvert).
  const allGardens = useStore((st) => st.gardens)
  const others = useMemo(() => allGardens.filter((g) => g.id !== garden.id && (g.panoramas?.length ?? 0) > 0), [allGardens, garden.id])
  const [info, setInfo] = useState<Record<string, Info>>({})
  const [refusal, setRefusal] = useState('')
  const key = points.map((p) => p.id + p.shots.map((s) => s.photoId).join('')).join('|')

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const next: Record<string, Info> = {}
      for (const p of points) {
        const bytes = await pointBytes(p) // le poids noté s'il existe, sinon lecture des photos
        // Point ancien : on note son poids une fois, le plafond se calcule ensuite sans relire les photos.
        if (p.bytes === undefined) noteBytes(garden.id, p.id, bytes)
        let url: string | undefined
        for (const s of p.shots) {
          const blob = await getPhoto(s.photoId)
          if (blob) {
            url = URL.createObjectURL(blob)
            urls.push(url)
            break
          }
        }
        next[p.id] = { url, bytes }
      }
      if (!cancelled) setInfo(next)
    })()
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  // Le plafond se calcule tout de suite avec le poids noté à la prise ; les points anciens attendent la lecture.
  const total = useMemo(() => {
    const { total: known, missing } = metaBytes(points)
    return known + missing.reduce((s, p) => s + (info[p.id]?.bytes ?? 0), 0)
  }, [points, info])

  function start(mode: 'guide' | 'import') {
    const ok = canAddPoint(points.length, total)
    if (!ok.ok) {
      setRefusal(refusalMessage(ok.reason))
      return
    }
    setRefusal('')
    openPanorama('place', { mode })
  }

  return (
    <div className="pano-page">
      <div className="pano-bar">
        <button className="btn pano-pill" onClick={closePanorama}>
          <Icon name="back" size={18} /> Fermer
        </button>
        <h2 className="pano-h">Photos du jardin</h2>
      </div>
      <div className="pano-scroll stack">
        {points.length === 0 && others.length > 0 && (
          <div className="alert warn small" role="status" data-feat="photos-autre-jardin">
            <p style={{ margin: 0 }}>Vos points de vue en photos sont dans un autre jardin de ce téléphone :</p>
            {others.map((g) => (
              <button key={g.id} className="btn small" style={{ marginTop: 8, marginRight: 8 }} onClick={() => setActiveGarden(g.id)}>
                Ouvrir « {g.name} » ({g.panoramas!.length} point{g.panoramas!.length > 1 ? 's' : ''})
              </button>
            ))}
          </div>
        )}
        {points.length === 0 ? (
          <div className="pano-empty">
            <PlantScene size={96} variant="house" />
            <p className="pano-lead">Promenez-vous dans votre jardin avec de vraies photos.</p>
            <ol className="pano-steps">
              <li>Choisissez un endroit du jardin.</li>
              <li>Tournez sur vous-même : l’appli prend 8 à 12 photos.</li>
              <li>Retrouvez-les ici et sur la carte. Les noms de vos plantes s’affichent dessus.</li>
            </ol>
            <p className="small muted">Vous aviez déjà pris des photos et la liste est vide ? Une reprise de la copie en ligne a pu les remplacer : dans Réglages, Sauvegarde, touchez « Voir ce que contiennent les copies de sécurité » puis « Remettre ce qui manque ».</p>
          </div>
        ) : (
          <ul className="pano-list" aria-label="Points de vue">
            {points.map((p, i) => (
              <li key={p.id} className="pano-card">
                <button className="pano-card-main" onClick={() => openPanorama('view', { pointId: p.id, back: 'home' })} aria-label={`Voir ${pointName(i).toLowerCase()}`}>
                  <span className="pano-thumb">{info[p.id]?.url ? <img src={info[p.id].url} alt="" /> : <Icon name="camera" size={24} />}</span>
                  <span className="pano-card-text">
                    <strong>{pointName(i)}</strong>
                    <span className="small muted">
                      {photoDateLabel(p.takenAt)} · {p.kind === 'import' ? 'photo large' : `${p.shots.length} photo${p.shots.length > 1 ? 's' : ''}`}
                      {info[p.id] ? ` · ${sizeLabel(info[p.id].bytes)}` : ''}
                    </span>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {points.length > 0 && <PhotosOnlyHere />}
        {points.length > 0 && Object.keys(info).length > 0 && points.some((p) => info[p.id] && !info[p.id].url) && (
          <MissingPhotos count={points.filter((p) => info[p.id] && !info[p.id].url).length} />
        )}
        {refusal && (
          <p className="alert warn small" role="alert">
            {refusal}
          </p>
        )}
        {tourOrder(points).length >= 2 && (
          <button className="btn primary big" data-feat="pano-visite" onClick={() => openPanorama('view', { pointId: tourOrder(points)[0], back: 'home', tour: true })}>
            <Icon name="forward" /> Lancer la visite
          </button>
        )}
        <button className={'btn big' + (tourOrder(points).length >= 2 ? '' : ' primary')} onClick={() => start('guide')}>
          <Icon name="camera" /> Prendre un point de vue
        </button>
        <details className="np-details pano-more">
          <summary>Plus d’options et d’infos</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => start('import')}>
              <Icon name="upload" /> Importer un panorama
            </button>

            <p className="small pano-note">{NOT_A_SCAN}</p>
            <p className="small muted pano-foot">
              {points.length > 0 && (
                <>
                  {points.length} point{points.length > 1 ? 's' : ''} sur {MAX_POINTS} · {sizeLabel(total)} sur {sizeLabel(MAX_BYTES)}.
                  <br />
                </>
              )}
              Ces photos restent sur ce téléphone, sauf si vous activez la copie en ligne : elles partent alors avec vos jardins (80 Mo au plus). Elles ne sont pas dans la sauvegarde simple ; la « Sauvegarde avec photos » (Réglages) les contient.
            </p>
          </div>
        </details>
      </div>
    </div>
  )
}
