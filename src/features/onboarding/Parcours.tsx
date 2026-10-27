import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { InstallButton } from '../../components/InstallButton'
import { Segmented } from '../../components/Segmented'
import { SpeciesPicker } from '../../components/SpeciesPicker'
import { orthoTextureUrl, type GeocodeResult } from '../../lib/ign'
import { frNumber } from '../../lib/format'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import { enableNotifications, notificationsSupported } from '../../lib/notify'
import { activeSteps, currentStep, stepAfter, stepBefore, stepStatus, STEP_TITLE, type OnboardingStepId } from '../../lib/onboarding'
import { updateGarden, useGardenPlants, useStore } from '../../lib/store'
import { getTextSize, setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, type TextSize } from '../../lib/textSize'
import { closeParcours, noteStep, noteWelcomed, setUi, startPlacing, useUi } from '../../lib/ui'
import type { Garden } from '../../types'
import { IdentifyDialog } from '../plants/IdentifyDialog'
import { openScan } from '../scan/scanUi'
import { AddressSearch } from '../settings/AddressSearch'
import { FAIL_HELP, INITIAL_STEPS, missingSources, type Step } from '../settings/createGarden'
import { isDemoGarden } from '../settings/demo'
import { DEFAULT_GARDEN_NAME, uniqueGardenName } from '../settings/gardenName'
import { StepList } from '../settings/GardenCreator'
import { useRefreshGarden } from '../settings/useRefreshGarden'
import { TechDetails } from '../../components/ErrorNote'
import { createDemoGarden, createRealGarden } from './create'
import { useOnboarding } from './useOnboarding'
import { Welcome } from './Welcome'

type Screen = 'welcome' | OnboardingStepId | 'fin'

/** Cadre commun : titre, phrase d'aide, contenu, un seul gros bouton « Continuer » et « Passer cette étape ». */
function Frame({
  title,
  lead,
  children,
  primary,
  secondary,
}: {
  title: string
  lead?: string
  children?: ReactNode
  primary: { label: string; onClick: () => void; disabled?: boolean }
  secondary?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  return (
    <>
      <div className="parcours-body stack" style={{ gap: 14 }}>
        <h1 tabIndex={-1} className="parcours-title">
          {title}
        </h1>
        {lead && <p className="parcours-lead">{lead}</p>}
        {children}
      </div>
      <div className="parcours-foot stack">
        <button className="btn primary big" onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </button>
        {secondary && (
          <button className="btn ghost big" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </button>
        )}
      </div>
    </>
  )
}

interface StepProps {
  garden?: Garden
  next: () => void
  skip: () => void
}

function BuildProgress({ steps }: { steps: Step[] }) {
  return (
    <div className="parcours-body stack" style={{ gap: 14 }}>
      <h1 tabIndex={-1} className="parcours-title">
        Je prépare votre jardin
      </h1>
      <p role="status" className="parcours-lead">
        <span className="spinner" /> Cela peut prendre une minute.
      </p>
      <StepList steps={steps} />
    </div>
  )
}

// ---------- 1. Mon adresse ----------
function AdresseStep({ garden, next, skip }: StepProps) {
  const real = !!garden && !isDemoGarden(garden)
  const [changing, setChanging] = useState(!real)
  const [place, setPlace] = useState<GeocodeResult>()
  const [steps, setSteps] = useState<Step[]>()
  const busy = useRef(false)

  async function run(f: () => Promise<unknown>) {
    if (busy.current) return
    busy.current = true
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })))
    try {
      await f()
    } finally {
      busy.current = false
    }
  }
  const onStep = (id: Step['id'], state: Step['state'], detail?: string) => setSteps((prev) => prev?.map((s) => (s.id === id ? { ...s, state, detail } : s)))

  if (steps) return <BuildProgress steps={steps} />

  if (real && !changing) {
    return (
      <Frame
        title="Votre adresse est enregistrée"
        lead={garden!.address}
        primary={{ label: 'Continuer', onClick: () => { noteStep('adresse', 'done'); next() } }}
        secondary={{ label: 'Utiliser une autre adresse', onClick: () => setChanging(true) }}
      />
    )
  }

  return (
    <Frame
      title="Où est votre jardin ?"
      lead="Tapez votre adresse, puis touchez-la dans la liste."
      primary={{
        label: 'Continuer',
        disabled: !place,
        onClick: () =>
          void run(async () => {
            await createRealGarden(place!, DEFAULT_GARDEN_NAME, onStep)
            noteStep('adresse', 'done')
            next()
          }).catch(() => setSteps(undefined)),
      }}
      secondary={
        garden
          ? { label: 'Passer cette étape', onClick: skip }
          : {
              label: 'Visiter un jardin d’exemple',
              onClick: () =>
                void run(async () => {
                  await createDemoGarden(onStep)
                  noteWelcomed()
                  closeParcours()
                }).catch(() => setSteps(undefined)),
            }
      }
    >
      <AddressSearch onSelect={setPlace} onClear={() => setPlace(undefined)} />
      {!place && <p className="small muted" style={{ margin: 0 }}>Choisissez votre adresse dans la liste pour continuer.</p>}
    </Frame>
  )
}

// ---------- 2. Mon terrain ----------
function TerrainStep({ garden, next, skip }: StepProps) {
  const gardens = useStore((s) => s.gardens)
  const [name, setName] = useState(garden?.name ?? '')
  const refresh = useRefreshGarden(garden ?? ({ id: '', name: '', address: '', center: { lon: 0, lat: 0 }, createdAt: '' } as Garden))
  useEffect(() => setName(garden?.name ?? ''), [garden?.id, garden?.name])
  if (!garden) return null
  const missing = missingSources(garden)
  const failedAgain = refresh.steps && !refresh.busy ? refresh.steps.filter((s) => s.state === 'echec') : []

  function commitName() {
    const final = uniqueGardenName(name, gardens.filter((g) => g.id !== garden!.id).map((g) => g.name))
    setName(final)
    if (final !== garden!.name) updateGarden(garden!.id, { name: final })
  }

  return (
    <Frame
      title={missing.length ? 'Il manque quelques informations' : 'Voici votre terrain'}
      lead={missing.length ? 'Ce n’est pas grave. Vous pouvez continuer ou réessayer.' : 'Vérifiez que c’est bien chez vous.'}
      primary={{ label: 'Continuer', onClick: () => { commitName(); noteStep('terrain', 'done'); next() } }}
      secondary={{ label: 'Passer cette étape', onClick: skip }}
    >
      <img className="terrain-photo" src={orthoTextureUrl(garden.center, 40, 640)} alt="Photo aérienne de votre terrain" width={640} height={640} />
      <ul className="list terrain-facts">
        <li>{garden.parcel?.length ? `Limites du terrain trouvées${garden.areaM2 ? ` : ${frNumber(garden.areaM2, 0)} m²` : ''}` : 'Limites du terrain : non trouvées'}</li>
        <li>{garden.buildings ? `Maisons voisines : ${garden.buildings.length}` : 'Maisons voisines : non trouvées'}</li>
        <li>{garden.terrain ? `Pente du terrain trouvée${garden.altitudeM != null ? ` (altitude ${frNumber(garden.altitudeM, 0)} m)` : ''}` : 'Pente du terrain : non trouvée'}</li>
      </ul>
      {missing.length > 0 && (
        <div className="alert small" role="status">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {missing.map((m) => (
              <li key={m}>{FAIL_HELP[m]}</li>
            ))}
          </ul>
          {failedAgain.length > 0 && (
            <div>
              Nouvel essai sans succès. Vérifiez votre connexion.
              <TechDetails detail={failedAgain.map((s) => `${s.label} : ${s.detail || 'sans réponse'}`).join(' · ')} />
            </div>
          )}
          <button className="btn" style={{ marginTop: 8 }} onClick={() => void refresh.refresh()} disabled={refresh.busy}>
            {refresh.busy ? <span className="spinner" /> : null} Réessayer
          </button>
        </div>
      )}
      <label className="field">
        <span>Nom du jardin</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} />
      </label>
    </Frame>
  )
}

// ---------- 3. Mes plantes ----------
function PlantesStep({ garden, next, skip }: StepProps) {
  const plants = useGardenPlants(garden?.id)
  const [picking, setPicking] = useState(false)
  const [identifying, setIdentifying] = useState(false)
  return (
    <>
      <Frame
        title="Quelles plantes avez-vous ?"
        lead="Choisissez une façon d’ajouter vos plantes. Vous pourrez en changer plus tard."
        primary={{ label: 'Continuer', onClick: () => { noteStep('plantes', 'done'); next() } }}
        secondary={{ label: 'J’en ajouterai plus tard', onClick: skip }}
      >
        <div className="choices">
          <button className="choice" onClick={() => openScan('menu')}>
            <Icon name="camera" size={26} />
            <span>
              <strong>Scanner mon jardin</strong>
              <span className="muted small">Marchez et filmez, on repère les plantes.</span>
            </span>
          </button>
          <button className="choice" onClick={() => setIdentifying(true)}>
            <Icon name="leaf" size={26} />
            <span>
              <strong>Photographier une plante</strong>
              <span className="muted small">On devine son nom à partir de la photo.</span>
            </span>
          </button>
          <button className="choice" onClick={() => setPicking(true)}>
            <Icon name="book" size={26} />
            <span>
              <strong>Choisir dans la liste</strong>
              <span className="muted small">146 plantes, avec une fiche pour chacune.</span>
            </span>
          </button>
        </div>
        {plants.length > 0 && (
          <p role="status" style={{ margin: 0 }}>
            ✓ {plants.length} plante{plants.length > 1 ? 's' : ''} dans votre jardin.
          </p>
        )}
      </Frame>
      {picking && (
        <SpeciesPicker
          title="Quelle plante ajouter ?"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false)
            startPlacing(s.id)
          }}
          onPickCustom={(name) => {
            setPicking(false)
            startPlacing(UNKNOWN_SPECIES_ID, { customName: name })
          }}
        />
      )}
      {identifying && <IdentifyDialog onClose={() => setIdentifying(false)} />}
    </>
  )
}

// ---------- 4. Mon entretien ----------
function EntretienStep({ next, skip }: StepProps) {
  const supported = notificationsSupported()
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied')
  const [size, setSize] = useState<TextSize>(getTextSize())
  return (
    <Frame
      title="Votre entretien"
      lead="Chaque semaine, l’appli dit quoi faire : tailler, arroser, récolter. Elle suit la météo."
      primary={{ label: 'Continuer', onClick: () => { noteStep('entretien', 'done'); next() } }}
      secondary={{ label: 'Passer cette étape', onClick: skip }}
    >
      <div className="card stack">
        <strong>Rappels</strong>
        {!supported ? (
          <p className="small muted" style={{ margin: 0 }}>Les rappels ne marchent pas sur cet appareil.</p>
        ) : perm === 'granted' ? (
          <p style={{ margin: 0 }}>✓ Les rappels sont activés.</p>
        ) : perm === 'denied' ? (
          <p className="small muted" style={{ margin: 0 }}>Les rappels sont bloqués. Autorisez les notifications dans les réglages de votre programme internet.</p>
        ) : (
          <button className="btn big" onClick={async () => setPerm((await enableNotifications()) ? 'granted' : 'denied')}>
            🔔 Activer les rappels
          </button>
        )}
      </div>
      <div className="card stack">
        <strong>Taille du texte</strong>
        <Segmented
          label="Taille du texte"
          value={size}
          options={TEXT_SIZES.map((t) => ({ id: t, label: TEXT_SIZE_LABEL[t] }))}
          onChange={(t) => {
            setTextSize(t)
            setSize(t)
          }}
        />
      </div>
    </Frame>
  )
}

// ---------- 5. Mes voisins ----------
function VoisinsStep({ skip }: StepProps) {
  return (
    <Frame
      title="Vos voisins"
      lead="Échangez des dons, des conseils et des rendez-vous près de chez vous. C’est facultatif."
      primary={{
        label: 'Découvrir',
        onClick: () => {
          noteStep('voisins', 'done')
          closeParcours({ to: 'voisins' })
        },
      }}
      secondary={{ label: 'Plus tard', onClick: skip }}
    >
      <p className="small muted" style={{ margin: 0 }}>Il faut un compte pour écrire. Vous restez libre de ne rien publier.</p>
    </Frame>
  )
}

// ---------- Fin ----------
function FinScreen({ onDone }: { onDone: () => void }) {
  return (
    <Frame title="Votre jardin est prêt" lead="Vous pouvez tout changer plus tard dans « Mon compte et réglages »." primary={{ label: 'Voir mes rayons', onClick: onDone }}>
      <div className="card stack">
        <strong>Gardez l’appli sur votre téléphone</strong>
        <p className="small muted" style={{ margin: 0 }}>Elle s’ouvre comme une appli, depuis votre écran d’accueil.</p>
        <InstallButton className="btn big" />
      </div>
    </Frame>
  )
}

/**
 * Parcours d'accueil en plein écran : bienvenue, puis 5 étapes (adresse, terrain, plantes, entretien, voisins) et un écran de fin.
 * Chaque étape se fait ou se passe ; l'avancement est enregistré (reprise possible depuis l'accueil).
 */
export function Parcours({ garden }: { garden?: Garden }) {
  const { parcours } = useUi()
  const { state, neighbors } = useOnboarding()
  const steps = activeSteps(neighbors)
  const initial = (): Screen => {
    if (!garden && !state.welcomed) return 'welcome'
    const want: Screen = parcours && parcours !== 'auto' ? parcours : currentStep(state, neighbors) ?? 'fin'
    if (!garden && want !== 'adresse') return 'adresse'
    return want === 'voisins' && !neighbors ? 'fin' : want
  }
  const [screen, setScreen] = useState<Screen>(initial)
  const bodyRef = useRef<HTMLDivElement>(null)

  // L'écran affiché est connu du reste de l'appli (placer une plante depuis « Mes plantes » valide l'étape).
  useEffect(() => {
    if (screen !== 'welcome' && parcours !== screen) setUi({ parcours: screen })
  }, [screen]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    bodyRef.current?.scrollTo?.(0, 0)
  }, [screen])

  const step = screen !== 'welcome' && screen !== 'fin' ? screen : undefined
  const after = (id: OnboardingStepId): Screen => stepAfter(id, neighbors) ?? 'fin'
  const next = () => step && setScreen(after(step))
  const skip = () => {
    if (!step) return
    noteStep(step, 'skipped')
    setScreen(after(step))
  }
  const back = () => {
    if (screen === 'welcome') return
    if (screen === 'fin') return setScreen(steps[steps.length - 1])
    const prev = stepBefore(screen, neighbors)
    if (prev) setScreen(prev)
    else if (garden) closeParcours()
    else setScreen('welcome')
  }
  const props: StepProps = { garden, next, skip }

  if (screen === 'welcome') {
    return (
      <Welcome
        onStart={() => {
          noteWelcomed()
          setScreen('adresse')
        }}
      />
    )
  }

  const n = step ? steps.indexOf(step) + 1 : steps.length
  return (
    <div className="parcours" ref={bodyRef}>
      <header className="parcours-head">
        <button className="btn ghost" onClick={back}>
          <Icon name="arrow-left" size={18} /> Retour
        </button>
        <span className="parcours-count" aria-live="polite">
          {step ? `Étape ${n} sur ${steps.length}` : 'C’est fini'}
        </span>
        {garden ? (
          <button className="btn ghost" onClick={() => closeParcours()} aria-label="Quitter la visite et revenir à l’accueil">
            <Icon name="x" size={18} /> Quitter
          </button>
        ) : (
          <span className="parcours-spacer" />
        )}
      </header>
      <ol className="stepbar" aria-label="Les étapes">
        {steps.map((id, k) => {
          const st = stepStatus(state, id)
          return (
            <li key={id} className={(id === step ? 'current ' : '') + st} aria-current={id === step ? 'step' : undefined}>
              <span className="sr-only">
                {STEP_TITLE[id]}
                {st === 'done' ? ' : fait' : st === 'skipped' ? ' : passée' : ''}
              </span>
              <i aria-hidden>{k + 1}</i>
            </li>
          )
        })}
      </ol>
      {screen === 'adresse' && <AdresseStep {...props} />}
      {screen === 'terrain' && <TerrainStep {...props} />}
      {screen === 'plantes' && <PlantesStep {...props} />}
      {screen === 'entretien' && <EntretienStep {...props} />}
      {screen === 'voisins' && <VoisinsStep {...props} />}
      {screen === 'fin' && <FinScreen onDone={() => closeParcours()} />}
    </div>
  )
}
