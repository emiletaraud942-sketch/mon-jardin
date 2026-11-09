import { useEffect, useMemo, useRef } from 'react'
import { Icon } from '../../components/Icon'
import { SPECIES_BY_ID } from '../../data/species'
import { CYCLE_SENTENCE, FAMILY_EXPLAIN, ROTATION_CAUTION, rotationAdvice, type RotationZone } from '../../engine/rotation'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { addPicker, rotationOpen } from '../../lib/overlays'
import { useActiveGarden, useGardenPlants } from '../../lib/store'
import { useBackLayer } from '../../lib/ui'
import { RUN_DELAY_MS } from '../aide/ToutFaire'
import { groupPlants } from './groups'
import '../../styles/novice-pages.css'
import '../../styles/rotation.css'

export const ROTATION_TITLE = 'Rotation de mon potager'
export const EMPTY_TEXT = 'Ajoutez vos légumes pour voir quoi planter où l’an prochain.'
export const INTRO_TEXT = 'Changer de famille de légumes d’une année à l’autre garde la terre en bonne santé.'

const close = () => rotationOpen.set(false)

/** Un calque de Retour par écran : fermé puis rouvert dans le même tour, il réutilise son entrée d'historique. */
function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Une zone du potager : ce qui y pousse, ce qu'il ne faut pas y remettre tout de suite, et une suite possible. */
export function ZoneCard({ zone }: { zone: RotationZone }) {
  const lines = groupPlants(zone.plants)
  return (
    <section className="rot-zone" aria-labelledby={`${zone.id}-h`} data-zone={zone.id}>
      <h2 id={`${zone.id}-h`}>{zone.name}</h2>
      <ul className="rot-plants">
        {lines.map((l) => (
          <li key={l.key}>
            <strong>{l.count > 1 ? `${l.name}, ${l.count} pieds` : l.name}</strong>
            <span>
              {l.year} · {l.simple}
            </span>
          </li>
        ))}
      </ul>
      <p className="rot-last">{zone.last}</p>
      {zone.blocks.map((b) => (
        <div className="rot-block" key={b.family}>
          <Icon name="alert" size={22} />
          <div>
            <p>
              <strong>{b.text}</strong>
            </p>
            <p className="small">{b.same}</p>
          </div>
        </div>
      ))}
      {zone.next && (
        <p className="rot-next">
          <Icon name="sprout" size={20} />
          <span>{zone.next.text}</span>
        </p>
      )}
    </section>
  )
}

/** Le contenu de l'écran (sans le store) : l'état vide, ou une carte par zone. */
export function RotationBody({ zones, onAdd }: { zones: RotationZone[]; onAdd: () => void }) {
  return (
    <div className="tf-body rot-body">
      <p className="rot-intro">{INTRO_TEXT}</p>
      <p className="small muted rot-intro">{FAMILY_EXPLAIN}</p>
      {zones.length === 0 ? (
        <div className="rot-empty" role="status">
          <p>{EMPTY_TEXT}</p>
          <button className="btn primary" onClick={onAdd}>
            <Icon name="plus" size={18} /> Ajouter une plante
          </button>
        </div>
      ) : (
        <>
          {zones.map((z) => (
            <ZoneCard key={z.id} zone={z} />
          ))}
          <p className="small muted">{CYCLE_SENTENCE}</p>
        </>
      )}
      <p className="small muted rot-caution">{ROTATION_CAUTION}</p>
    </div>
  )
}

/** Rotation des cultures : par zone du potager, la dernière culture et ce qu'on évite d'y remettre trop tôt. */
export default function RotationScreen() {
  const garden = useActiveGarden()
  const plants = useGardenPlants(garden?.id)
  const ref = useRef<HTMLDivElement>(null)
  const today = useMemo(() => new Date(), [])
  const zones = useMemo(() => rotationAdvice(plants, SPECIES_BY_ID, today, garden), [plants, today, garden])

  const backRef = useRef(close)
  useInertBehind(true)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const addVeg = () => {
    close()
    window.setTimeout(() => addPicker.set({}), RUN_DELAY_MS)
  }

  return (
    <div ref={ref} className="tf-overlay rotation" role="dialog" aria-modal="true" aria-label={ROTATION_TITLE} data-feat="rotation" tabIndex={-1}>
      <Layer onBack={close} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={close}>
          <Icon name="back" size={18} /> Retour
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{ROTATION_TITLE}</h1>
      </header>
      <RotationBody zones={zones} onAdd={addVeg} />
    </div>
  )
}
