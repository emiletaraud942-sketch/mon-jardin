import { useIsFirefoxAndroid } from '../lib/install'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** Aide pour installer à la main (iPhone, iPad ou navigateur sans fenêtre d'installation). */
export function InstallHelp({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  const firefox = useIsFirefoxAndroid()
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
        ) : firefox ? (
          <>
            <ol className="help-steps">
              <li>
                Ouvrez le menu de Firefox <strong>(⋮)</strong>.
              </li>
              <li>
                Touchez <strong>Installer</strong>, puis confirmez.
              </li>
            </ol>
            <p className="small muted" style={{ margin: 0 }}>
              Pas de « Installer » ? Rafraîchissez la page, puis rouvrez le menu. « Ajouter à l’écran d’accueil » ne crée qu’un raccourci avec la barre de Firefox. Une fois installée, l’appli s’ouvre en plein écran.
            </p>
          </>
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

