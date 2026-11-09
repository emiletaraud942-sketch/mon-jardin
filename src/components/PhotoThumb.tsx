import { useEffect, useState } from 'react'
import { getPhoto } from '../lib/photos'
import { Modal } from './Modal'

/** URL d'objet d'une photo stockée ; révoquée au démontage, y compris si la lecture finit après coup. */
export function usePhotoUrl(id: string): { url?: string; missing: boolean } {
  const [state, setState] = useState<{ url?: string; missing: boolean }>({ missing: false })
  useEffect(() => {
    let alive = true
    let u: string | undefined
    setState({ missing: false })
    getPhoto(id).then(
      (b) => {
        if (!alive) return
        if (b) setState({ url: (u = URL.createObjectURL(b)), missing: false })
        else setState({ missing: true })
      },
      () => alive && setState({ missing: true }),
    )
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  return state
}

function PhotoModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { url, missing } = usePhotoUrl(id)
  return (
    <Modal title="Photo" onClose={onClose}>
      {url ? <img className="photo-large" src={url} alt="Photo de la plante, en grand" /> : missing ? <p className="muted">Photo introuvable sur cet appareil.</p> : <span className="spinner" />}
    </Modal>
  )
}

/** Miniature d'une photo. Avec `zoomable`, un appui l'affiche en grand. */
export function PhotoThumb({ id, zoomable }: { id: string; zoomable?: boolean }) {
  const { url, missing } = usePhotoUrl(id)
  const [open, setOpen] = useState(false)
  if (!url) return <div className={'photo-thumb' + (missing ? ' missing' : '')} title={missing ? 'Photo absente de cet appareil' : undefined} />
  const img = <img className="photo-thumb" src={url} alt="" />
  if (!zoomable) return img
  return (
    <>
      <button type="button" className="photo-btn" aria-label="Voir la photo en grand" onClick={() => setOpen(true)}>
        {img}
      </button>
      {open && <PhotoModal id={id} onClose={() => setOpen(false)} />}
    </>
  )
}
