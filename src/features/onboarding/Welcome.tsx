import { useState } from 'react'
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

/** Jardin stylisé : décor seulement. */
function Leaves() {
  return (
    <svg className="welcome-art" viewBox="0 0 200 160" aria-hidden="true" focusable="false">
      <circle className="ill-tree-shade" cx="100" cy="86" r="62" />
      <g transform="translate(100 130)">
        {[-38, -14, 14, 38].map((a) => (
          <path key={a} className="ill-tree" transform={`rotate(${a})`} d="M0 0C-26-34-24-76 0-118C24-76 26-34 0 0Z" />
        ))}
      </g>
      <rect className="ill-house" x="64" y="124" width="72" height="22" rx="10" />
    </svg>
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
        <img src="/icon.svg" alt="" width={56} height={56} className="welcome-logo" />
        <Leaves />
        <p className="welcome-kicker">{slide.kicker}</p>
        <h1 tabIndex={-1}>{slide.title}</h1>
        <p className="welcome-text">{slide.text}</p>
        <div className="welcome-dots" role="group" aria-label="Écrans de bienvenue">
          {SLIDES.map((s, k) => (
            <button key={s.title} className="dot-btn" aria-label={`Écran ${k + 1} sur ${SLIDES.length}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
              <i />
            </button>
          ))}
        </div>
      </div>
      <div className="parcours-foot stack">
        <button className="btn primary big" onClick={onStart}>
          Commencer
        </button>
        {i < SLIDES.length - 1 && (
          <button className="btn big" onClick={() => setI(i + 1)}>
            Suivant
          </button>
        )}
        <button className="btn ghost big" onClick={() => void demo()}>
          Visiter un jardin d’exemple
        </button>
        <p className="muted small legal-accept">
          Gratuit, sans compte. En continuant, vous acceptez les <LegalLink id="cgu" label="conditions d’utilisation" /> et la <LegalLink id="confidentialite" label="politique de confidentialité" />.
        </p>
      </div>
    </div>
  )
}
