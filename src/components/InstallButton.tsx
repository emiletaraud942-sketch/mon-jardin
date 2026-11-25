import { lazy, Suspense, useState } from 'react'
import { promptInstall, useInstallState } from '../lib/install'
import { showToast } from '../lib/toast'
import { Fold } from './Fold'
import { Icon } from './Icon'
// L'aide d'installation (étapes iPhone, Firefox, autres) n'est lue qu'au besoin : chargée à la demande.
const InstallHelp = lazy(() => import('./InstallHelp').then((m) => ({ default: m.InstallHelp })))

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
      {help && (
        <Suspense fallback={null}>
          <InstallHelp ios={state === 'ios-manual'} onClose={() => setHelp(false)} />
        </Suspense>
      )}
    </>
  )
}

/** Carte des Réglages. */
export function InstallCard() {
  const state = useInstallState()
  if (state === 'installed') return null
  return (
    <Fold title="Installer l’appli" feat="installer">
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          Elle s’ouvre comme une appli, depuis votre écran d’accueil.
        </p>
        <InstallButton />
      </div>
    </Fold>
  )
}
