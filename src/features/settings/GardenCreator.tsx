import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../components/useMedia'
import type { GeocodeResult } from '../../lib/ign'
import { addGarden, addPlant, getState } from '../../lib/store'
import { uid } from '../../lib/geo'
import { showFirstSteps } from '../../lib/ui'
import type { Garden } from '../../types'
import { AddressSearch } from './AddressSearch'
import { buildGarden, FAIL_HELP, INITIAL_STEPS, type Step } from './createGarden'
import { DEFAULT_GARDEN_NAME, uniqueGardenName } from './gardenName'
import { DEMO_PLACE, demoPlants } from '../../data/demo'
import { TechDetails } from '../../components/ErrorNote'
import { DEMO_GARDEN_NAME } from './demo'

const ICON: Record<Step['state'], string> = { attente: '○', 'en-cours': '…', ok: '✓', echec: '!' }

interface Built {
  garden: Garden
  demo: boolean
  place: GeocodeResult
  name: string
}

function StepList({ steps, withHelp }: { steps: Step[]; withHelp?: boolean }) {
  return (
    <ul className="steps" aria-live="polite">
      {steps.map((s) => (
        <li key={s.id} style={{ alignItems: 'flex-start' }}>
          <span className="step-icon" style={{ color: s.state === 'echec' ? 'var(--danger)' : 'var(--accent)' }} aria-label={s.state === 'ok' ? 'réussi' : s.state === 'echec' ? 'manquant' : undefined}>
            {s.state === 'en-cours' ? <span className="spinner" /> : ICON[s.state]}
          </span>
          <span style={{ minWidth: 0 }}>
            {s.label}
            {s.state === 'ok' && s.detail && <span className="muted small"> : {s.detail}</span>}
            {s.state === 'echec' && withHelp && (
              <span className="small" style={{ display: 'block' }}>
                {FAIL_HELP[s.id]}
                {s.detail && <TechDetails detail={s.detail} />}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Création d'un jardin en trois temps : adresse, récupération des informations, écran de résultat.
 * Le jardin n'est ajouté à l'appli qu'au clic sur « Voir mon jardin » : l'utilisateur voit d'abord ce qui manque.
 * Avec `allowDemo` (premier écran), on choisit d'abord entre « Entrer mon adresse » et « Visiter un jardin d'exemple ».
 */
export function GardenCreator({ onDone, allowDemo }: { onDone?: () => void; allowDemo?: boolean }) {
  const mobile = useIsMobile()
  const [place, setPlace] = useState<GeocodeResult>()
  const [name, setName] = useState(DEFAULT_GARDEN_NAME)
  const [steps, setSteps] = useState<Step[]>()
  const [built, setBuilt] = useState<Built>()
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'choose' | 'address'>(allowDemo ? 'choose' : 'address')
  const [renaming, setRenaming] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    if (built) heading.current?.focus()
  }, [built])

  async function create(p: GeocodeResult, gardenName: string, demo = false) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setBuilt(undefined)
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })))
    try {
      const finalName = uniqueGardenName(gardenName, getState().gardens.map((g) => g.name))
      const garden = await buildGarden(p, finalName, (id, state, detail) => setSteps((prev) => prev?.map((s) => (s.id === id ? { ...s, state, detail } : s))))
      setBuilt({ garden, demo, place: p, name: finalName })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function proceed() {
    if (!built) return
    addGarden(built.garden)
    if (built.demo) for (const pl of demoPlants(built.garden)) addPlant({ ...pl, id: uid() })
    // Nouveau jardin : on ouvre « Mon jardin » avec la checklist « Premiers pas » (une fois ; la modélisation reste facultative).
    showFirstSteps({ open: false })
    onDone?.()
    // L'écran de création était peut-être défilé : le nouvel écran repart du haut.
    requestAnimationFrame(() => window.scrollTo(0, 0))
  }

  // ---- Écran de résultat ----
  if (built && steps) {
    const failed = steps.filter((s) => s.state === 'echec')
    return (
      <div className="stack" style={{ gap: 12 }}>
        <h2 ref={heading} tabIndex={-1} style={{ marginBottom: 0 }}>
          {failed.length === 0 ? 'Votre jardin est prêt' : 'Il manque quelques informations'}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {built.name}
          {built.demo ? '' : ` · ${built.place.label}`}
        </p>
        <StepList steps={steps} withHelp />
        {failed.length > 0 && <p className="alert small">Ce n’est pas grave : vous pouvez continuer. Un bouton « Réessayer » restera sur la carte tant qu’il manque quelque chose.</p>}
        <div className="row">
          <button className="btn primary big" onClick={proceed}>
            Voir mon jardin
          </button>
          {failed.length > 0 && (
            <button className="btn big" disabled={busy} onClick={() => create(built.place, built.name, built.demo)}>
              Réessayer
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---- Récupération en cours ----
  if (busy && steps) {
    return (
      <div className="stack">
        <p role="status">
          <span className="spinner" /> Je prépare votre jardin… Cela peut prendre une minute.
        </p>
        <StepList steps={steps} />
      </div>
    )
  }

  // ---- Premier choix ----
  if (stage === 'choose') {
    return (
      <div className="stack choose-start" style={{ gap: 12 }}>
        <button className="btn primary big" onClick={() => setStage('address')}>
          Entrer mon adresse
        </button>
        <button className="btn big" onClick={() => create(DEMO_PLACE, DEMO_GARDEN_NAME, true)}>
          Visiter un jardin d’exemple
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Le jardin d’exemple se visite sans donner d’adresse. Vous pourrez créer le vôtre ensuite.
        </p>
      </div>
    )
  }

  // ---- Saisie de l'adresse ----
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p style={{ margin: 0 }}>Tapez votre adresse, puis touchez-la dans la liste.</p>
      <AddressSearch onSelect={setPlace} onClear={() => setPlace(undefined)} autoFocus={!mobile} />
      {place && (
        <>
          {renaming ? (
            <label className="field">
              <span>Nom du jardin</span>
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName((n) => n.trim() || DEFAULT_GARDEN_NAME)} />
            </label>
          ) : (
            <p className="row" style={{ margin: 0 }}>
              <span>
                Nom du jardin : <strong>{name}</strong>
              </span>
              <button className="btn small ghost link-btn" onClick={() => setRenaming(true)}>
                Changer le nom
              </button>
            </p>
          )}
          <button className="btn primary big" onClick={() => create(place, name)}>
            Créer mon jardin
          </button>
        </>
      )}
      {allowDemo && !place && (
        <button className="btn ghost link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setStage('choose')}>
          ← Retour
        </button>
      )}
    </div>
  )
}
