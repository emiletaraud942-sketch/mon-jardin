import { useState } from 'react'
import { promptInstall, useInstallState } from '../lib/install'
import { showToast } from '../lib/toast'
import { Fold } from './Fold'
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
    <Fold title="Installer l’appli">
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Elle s’ouvre comme une appli, depuis votre écran d’accueil.
        </p>
        <InstallButton />
      </div>
    </Fold>
  )
}
