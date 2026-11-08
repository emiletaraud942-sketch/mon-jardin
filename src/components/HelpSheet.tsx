import { useState } from 'react'
import { HELP_EXTRA, RAYONS_HELP, helpExtraNow, helpFor, type HelpExtra } from '../lib/help'
import { lostSheet, toutFaire } from '../lib/overlays'
import { restartOnboarding, type Tab } from '../lib/ui'
import { LegalLinks } from '../features/legal/LegalLinks'
import { Icon } from './Icon'
import { Modal } from './Modal'

/**
 * Feuille d'aide du bouton « Aide » : « Tout ce que je peux faire », étapes de l'écran courant (ou du scanner, des photos du jardin,
 * de la promenade), explication des 4 parties de l’appli, retour à la visite.
 */
export function HelpSheet({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [view, setView] = useState<'ecran' | 'rayons'>('ecran')
  const [extra] = useState<HelpExtra | undefined>(() => (typeof document === 'undefined' ? undefined : helpExtraNow()))
  const help = extra ? HELP_EXTRA[extra] : helpFor(tab)
  return (
    <Modal title={view === 'ecran' ? `Aide : ${help.title}` : RAYONS_HELP.title} sheet feat="help" onClose={onClose}>
      {view === 'ecran' ? (
        <div className="stack help-body">
          <button
            className="btn primary help-all"
            onClick={() => {
              onClose()
              window.setTimeout(() => toutFaire.set(true), 160)
            }}
          >
            <Icon name="list" /> Tout ce que je peux faire
          </button>
          <ol className="help-steps">
            {help.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <button className="btn" onClick={() => setView('rayons')}>
            À quoi servent les 4 parties de l’appli ?
          </button>
          <button
            className="btn"
            onClick={() => {
              onClose()
              window.setTimeout(() => lostSheet.set(true), 160)
            }}
          >
            <Icon name="help" /> Je suis perdu
          </button>
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
