import { useState } from 'react'
import { Blob, PlantPot } from '../../components/illustrations'
import { noteWelcomed, setUi } from '../../lib/ui'
import { INITIAL_STEPS, type Step } from '../settings/createGarden'
import { StepList } from '../settings/GardenCreator'
import { createDemoGarden } from './create'
import { RestoreAccount } from './RestoreAccount'
import { TextSizeButton } from '../../components/TextSizeButton'

const syncConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

const WELCOME = { title: 'PermaJardin', kicker: 'Votre jardin, pas à pas', text: 'Voyez votre jardin, placez vos plantes et sachez quoi faire chaque semaine.' }

/** Décor de bienvenue : grande forme sauge et plantes en pot. Boîte de 390 × 300 px, comme la maquette. */
function Art() {
  return (
    <div className="welcome-art" aria-hidden="true">
      <Blob size={280} height={240} className="wa-blob" />
      <PlantPot size={240} className="wa-p1" />
      <PlantPot size={170} tilts={[-30, -8, 12, 34]} className="wa-p2" />
    </div>
  )
}

/** Un seul écran de bienvenue : « Commencer » (étape 1) en grand ; « Visiter un jardin d'exemple » et « J'ai déjà un compte » plus discrets. */
export function Welcome({ onStart }: { onStart: () => void }) {
  const [steps, setSteps] = useState<Step[]>()
  const [restoring, setRestoring] = useState(false)
  async function demo() {
    setSteps(INITIAL_STEPS.map((s) => ({ ...s })))
    try {
      await createDemoGarden((id, state, detail) => setSteps((prev) => prev?.map((s) => (s.id === id ? { ...s, state, detail } : s))))
      noteWelcomed()
      setUi({ tab: 'accueil' })
    } catch {
      setSteps(undefined)
    }
  }

  if (steps) {
    return (
      <div className="parcours">
        <div className="parcours-body stack" style={{ gap: 14 }}>
          <p role="status">
            <span className="spinner" /> Je prépare le jardin d’exemple…
          </p>
          <StepList steps={steps} />
        </div>
      </div>
    )
  }

  return (
    <div className="parcours welcome">
      <div className="parcours-body welcome-body">
        <TextSizeButton />
        <h1 tabIndex={-1}>{WELCOME.title}</h1>
        <p className="welcome-kicker">{WELCOME.kicker}</p>
        <Art />
        <p className="welcome-text">{WELCOME.text}</p>
      </div>
      <div className="parcours-foot">
        <button className="btn primary big" onClick={onStart}>
          Commencer
        </button>
        <button className="btn ghost" onClick={() => void demo()}>
          Visiter un jardin d’exemple
        </button>
        {syncConfigured && (
          <button className="btn ghost" onClick={() => setRestoring(true)}>
            J’ai déjà un compte
          </button>
        )}
      </div>
      {restoring && <RestoreAccount onClose={() => setRestoring(false)} />}
    </div>
  )
}
