import { useState } from 'react'
import { MODES_HELP, helpFor } from '../lib/help'
import { showFirstSteps, type Tab } from '../lib/ui'
import { LegalLinks } from '../features/legal/LegalLinks'
import { Modal } from './Modal'

/** Feuille d'aide du bouton « ? » : étapes de l'écran courant, explication des 3 modes, retour aux Premiers pas. */
export function HelpSheet({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [view, setView] = useState<'ecran' | 'modes'>('ecran')
  const help = helpFor(tab)
  return (
    <Modal title={view === 'ecran' ? `Aide : ${help.title}` : MODES_HELP.title} sheet onClose={onClose}>
      {view === 'ecran' ? (
        <div className="stack help-body">
          <button className="btn" onClick={() => setView('modes')}>
            À quoi servent les 3 modes ?
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
              showFirstSteps()
            }}
          >
            Revoir les premiers pas
          </button>
          <LegalLinks onOpen={onClose} />
        </div>
      ) : (
        <div className="stack help-body">
          <p style={{ margin: 0 }}>{MODES_HELP.intro}</p>
          <ul className="help-modes">
            {MODES_HELP.modes.map((m) => (
              <li key={m.name}>
                <strong>{m.name}</strong> — {m.text}
              </li>
            ))}
          </ul>
          <p className="alert small" style={{ margin: 0 }}>
            {MODES_HELP.optional}
          </p>
          <button className="btn" onClick={() => setView('ecran')}>
            Retour à l’aide
          </button>
        </div>
      )}
    </Modal>
  )
}
