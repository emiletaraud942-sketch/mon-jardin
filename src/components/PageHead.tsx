import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { toutFaire } from '../lib/overlays'
import { setUi } from '../lib/ui'

/**
 * En-tête de page de la maquette Leafora : petite phrase grise, titre en serif, et à droite une pastille ronde.
 * Sur téléphone, il remplace la barre du haut (classe `.app.pagehead`). Par défaut la pastille ouvre « Mon compte et réglages ».
 * Sur grand écran la barre du haut reste : la pastille par défaut est masquée (`.pagehead-user`).
 * `compact` : même style, sur 52 px de haut (carte et Vue 3D, qui gardent leur espace). `onHelp` ajoute la pastille « ? » (aide de l'écran).
 * `current` : l'écran affiché est celui de la pastille (Réglages) : elle est pleine et ne fait rien de plus.
 * `home` : le logo de l'appli, à gauche du titre, ramène à l'accueil (comme le logo de la barre du haut sur ordinateur).
 * Chaque bouton rond porte un mot sous son icône (« Tout », « Aide », « Compte ») : on n'a pas à deviner à quoi il sert.
 */
export function PageHead({ kicker, title, action, big, compact, onHelp, current, home }: { kicker?: ReactNode; title: ReactNode; action?: ReactNode; big?: boolean; compact?: boolean; onHelp?: () => void; current?: boolean; home?: boolean }) {
  const tout = (
    <button className="pagehead-btn pagehead-tout" aria-label="Tout ce que je peux faire" aria-haspopup="dialog" onClick={() => toutFaire.set(true)}>
      <Icon name="list" size={22} />
      <span className="pagehead-label" aria-hidden>
        Tout
      </span>
    </button>
  )
  const help = onHelp && (
    <button className="pagehead-btn pagehead-help" aria-label="Aide" aria-haspopup="dialog" onClick={onHelp}>
      <Icon name="help" size={22} />
      <span className="pagehead-label" aria-hidden>
        Aide
      </span>
    </button>
  )
  const user = (
    <button
      className="pagehead-btn pagehead-user"
      aria-label="Compte et réglages"
      aria-current={current ? 'page' : undefined}
      aria-pressed={current ? true : undefined}
      onClick={() => setUi({ tab: 'reglages' })}
    >
      <Icon name="user" size={22} />
      <span className="pagehead-label" aria-hidden>
        Compte
      </span>
    </button>
  )
  return (
    <header className={'pagehead' + (big ? ' big' : '') + (compact ? ' compact' : '')}>
      <div className="pagehead-lead">
        {home && (
          <button className="pagehead-logo" aria-label="Accueil : que voulez-vous faire ?" onClick={() => setUi({ tab: 'accueil' })}>
            <img src="/icon.svg" alt="" width={34} height={34} />
          </button>
        )}
        <div className="pagehead-text">
          {kicker && <p className="pagehead-kicker">{kicker}</p>}
          <h1>{title}</h1>
        </div>
      </div>
      {action ?? <div className="pagehead-actions">{tout}{help}{user}</div>}
    </header>
  )
}
