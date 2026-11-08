import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { markTourSeen, TOUR_SLIDES } from '../../lib/featureTour'
import { useInertBehind } from '../../lib/inert'
import { tourOpen } from '../../lib/overlays'
import { useBackLayer } from '../../lib/ui'

/**
 * Visite des fonctions : six écrans, une phrase chacun. Passable à tout moment, rejouable depuis l'aide et Réglages.
 * S'ouvre seule une fois, après l'accueil (clé `pj.tourSeen`).
 */
export function Visite() {
  const ref = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(0)
  const last = i === TOUR_SLIDES.length - 1
  const slide = TOUR_SLIDES[i]
  const close = () => tourOpen.set(false)
  useInertBehind(true)
  useBackLayer(true, close)
  useEffect(() => markTourSeen(), [])
  useEffect(() => ref.current?.focus({ preventScroll: true }), [i])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="tf-overlay tour" role="dialog" aria-modal="true" aria-label="Visite des fonctions" data-feat="visite-fonctions" tabIndex={-1}>
      <div className="tour-card" ref={ref} tabIndex={-1}>
        <p className="tour-count" role="status">
          Écran {i + 1} sur {TOUR_SLIDES.length}
        </p>
        <span className="tour-dots" aria-hidden>
          {TOUR_SLIDES.map((s, k) => (
            <i key={s.id} className={k === i ? 'on' : undefined} />
          ))}
        </span>
        <h1>{slide.title}</h1>
        <span className="tour-demo" aria-hidden>
          <Icon name={slide.icon} size={26} />
          <span>{slide.word}</span>
        </span>
        <p className="tour-text">{slide.text}</p>
        <div className="tour-nav">
          <button className="btn tour-btn" disabled={i === 0} onClick={() => setI(i - 1)}>
            <Icon name="back" size={18} /> Précédent
          </button>
          {last ? (
            <button className="btn primary tour-btn" onClick={close}>
              Terminé
            </button>
          ) : (
            <button className="btn primary tour-btn" onClick={() => setI(i + 1)}>
              Suivant <Icon name="forward" size={18} />
            </button>
          )}
        </div>
        {!last && (
          <button className="btn ghost tour-skip" onClick={close}>
            Passer la visite
          </button>
        )}
      </div>
    </div>
  )
}
