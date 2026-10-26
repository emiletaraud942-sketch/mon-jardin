import { useEffect, useState } from 'react'
import { promptInstall, useInstallState } from '../lib/install'
import { showToast } from '../lib/toast'
import { setGuide, useUi } from '../lib/ui'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** Aide pour installer à la main (iPhone, iPad ou navigateur sans fenêtre d'installation). */
function InstallHelp({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  return (
    <Modal title="Installer l’appli" sheet onClose={onClose}>
      <div className="stack help-body">
        {ios ? (
          <ol className="help-steps">
            <li>
              Touchez <strong>Partager</strong> <span className="install-share"><Icon name="share" size={18} /></span> en bas de l’écran.
            </li>
            <li>
              Touchez <strong>Sur l’écran d’accueil</strong>.
            </li>
          </ol>
        ) : (
          <ol className="help-steps">
            <li>
              Ouvrez le menu du navigateur <strong>(⋮)</strong>.
            </li>
            <li>
              Touchez <strong>Installer l’application</strong> (et non « Ajouter un raccourci »).
            </li>
          </ol>
        )}
        <button className="btn" onClick={onClose}>
          J’ai compris
        </button>
      </div>
    </Modal>
  )
}

/** Bouton « Installer l’appli » : fenêtre du navigateur si elle existe, sinon aide. Rien si l’appli est déjà installée. */
export function InstallButton({ className = 'btn', label = 'Installer l’appli' }: { className?: string; label?: string }) {
  const state = useInstallState()
  const [help, setHelp] = useState(false)
  if (state === 'installed') return null
  const go = async () => {
    if (state !== 'can-prompt') return setHelp(true)
    const r = await promptInstall()
    if (r === 'accepted') showToast({ message: 'Installation en cours. Cherchez PermaJardin sur votre écran d’accueil.' })
    if (r === 'unavailable') setHelp(true)
  }
  return (
    <>
      <button className={className} onClick={() => void go()}>
        <Icon name="download" /> {label}
      </button>
      {help && <InstallHelp ios={state === 'ios-manual'} onClose={() => setHelp(false)} />}
    </>
  )
}

/** Carte des Réglages. */
export function InstallCard() {
  const state = useInstallState()
  if (state === 'installed') return null
  return (
    <div className="card">
      <h2>Installer l’appli</h2>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Elle s’ouvre comme une appli, depuis votre écran d’accueil.
        </p>
        <InstallButton />
      </div>
    </div>
  )
}

const phoneQuery = '(max-width: 760px)'

/** Ligne discrète sur téléphone, dans la carte de l’avancement. Fermable ; la fermeture est mémorisée. */
export function InstallHint() {
  const state = useInstallState()
  const { guide } = useUi()
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && matchMedia(phoneQuery).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const m = matchMedia(phoneQuery)
    const on = () => setPhone(m.matches)
    m.addEventListener?.('change', on)
    return () => m.removeEventListener?.('change', on)
  }, [])
  if (state === 'installed' || guide.installHidden || !phone) return null
  return (
    <div className="install-hint">
      <span className="small">Gardez l’appli sur votre téléphone.</span>
      <InstallButton className="btn small primary" label="Installer" />
      <button className="btn small ghost install-close" aria-label="Fermer cette proposition" onClick={() => setGuide({ installHidden: true })}>
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}
