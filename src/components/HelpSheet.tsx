import { useState } from 'react'
import { RAYONS_HELP, helpFor } from '../lib/help'
import { restartOnboarding, type Tab } from '../lib/ui'
import { LegalLinks } from '../features/legal/LegalLinks'
import { Modal } from './Modal'

/** Feuille d'aide du bouton « ? » : étapes de l'écran courant, explication des 4 rayons, retour à la visite. */
export function HelpSheet({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [view, setView] = useState<'ecran' | 'rayons'>('ecran')
  const help = helpFor(tab)
  return (
    <Modal title={view === 'ecran' ? `Aide : ${help.title}` : RAYONS_HELP.title} sheet onClose={onClose}>
      {view === 'ecran' ? (
        <div className="stack help-body">
          <button className="btn" onClick={() => setView('rayons')}>
            À quoi servent les 4 rayons ?
          </button>
          <ol className="help-steps">
            {help.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <button
            className="btn"
            onClick={() => {
              onClose()
              restartOnboarding()
            }}
          >
            Revoir la visite
          </button>
          <LegalLinks onOpen={onClose} />
        </div>
      ) : (
        <div className="stack help-body">
          <p style={{ margin: 0 }}>{RAYONS_HELP.intro}</p>
          <ul className="help-modes">
            {RAYONS_HELP.rayons.map((m) => (
              <li key={m.name}>
                <strong>{m.name}</strong> — {m.text}
              </li>
            ))}
          </ul>
          <p className="alert small" style={{ margin: 0 }}>
            {RAYONS_HELP.optional}
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            {RAYONS_HELP.account}
          </p>
          <button className="btn" onClick={() => setView('ecran')}>
            Retour à l’aide
          </button>
        </div>
      )}
    </Modal>
  )
}
