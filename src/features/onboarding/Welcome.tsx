import { useState } from 'react'
import { Blob, HouseGarden, LeafSprig, PlantPot } from '../../components/illustrations'
import { LegalLink } from '../legal/LegalLinks'
import { noteWelcomed, setUi } from '../../lib/ui'
import { INITIAL_STEPS, type Step } from '../settings/createGarden'
import { StepList } from '../settings/GardenCreator'
import { createDemoGarden } from './create'

const SLIDES = [
  { title: 'PermaJardin', kicker: 'Votre jardin, pas à pas', text: 'Voyez votre jardin, placez vos plantes et sachez quoi faire chaque semaine.' },
  { title: 'Vos plantes, au mètre près', kicker: 'Une carte à vous', text: 'Touchez la carte ou scannez le jardin. Voyez aussi l’ombre en 3D.' },
  { title: 'Un rappel chaque semaine', kicker: 'Tailler, arroser, récolter', text: 'L’appli suit la météo et la saison. Elle vous dit quoi faire.' },
]

/** Décor de bienvenue : grande forme sauge et plantes en pot (change à chaque écran). Boîte de 390 × 300 px, comme la maquette. */
function Art({ i }: { i: number }) {
  return (
    <div className="welcome-art" aria-hidden="true">
      {i === 1 ? (
        <>
          <Blob size={280} height={240} className="wa-blob" />
          <HouseGarden size={280} className="wa-house" />
        </>
      ) : i === 2 ? (
        <>
          <Blob size={280} height={240} className="wa-blob" />
          <PlantPot size={200} tilts={[-44, -20, 0, 20, 44]} className="wa-p3" />
          <LeafSprig size={56} className="wa-leaf" />
        </>
      ) : (
        <>
          <Blob size={280} height={240} className="wa-blob" />
          <PlantPot size={240} className="wa-p1" />
          <PlantPot size={170} tilts={[-30, -8, 12, 34]} className="wa-p2" />
        </>
      )}
    </div>
  )
}

/** Trois écrans de bienvenue, puis « Commencer » (étape 1) ou « Visiter un jardin d'exemple ». */
export function Welcome({ onStart }: { onStart: () => void }) {
  const [i, setI] = useState(0)
  const [steps, setSteps] = useState<Step[]>()
  const slide = SLIDES[i]

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
        <h1 tabIndex={-1}>{slide.title}</h1>
        <p className="welcome-kicker">{slide.kicker}</p>
        <Art i={i} />
        <p className="welcome-text">{slide.text}</p>
        <div className="welcome-dots" role="group" aria-label="Écrans de bienvenue">
          {SLIDES.map((s, k) => (
            <button key={s.title} className="dot-btn" aria-label={`Écran ${k + 1} sur ${SLIDES.length}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
              <i />
            </button>
          ))}
        </div>
        {i < SLIDES.length - 1 && (
          <button className="welcome-next" onClick={() => setI(i + 1)}>
            Suivant
          </button>
        )}
        <p className="muted small legal-accept">
          Gratuit, sans compte. En continuant, vous acceptez les <LegalLink id="cgu" label="conditions d’utilisation" /> et la <LegalLink id="confidentialite" label="politique de confidentialité" />.
        </p>
      </div>
      <div className="parcours-foot">
        <button className="btn primary big" onClick={onStart}>
          Commencer
        </button>
        <button className="btn ghost big" onClick={() => void demo()}>
          Visiter un jardin d’exemple
        </button>
      </div>
    </div>
  )
}
