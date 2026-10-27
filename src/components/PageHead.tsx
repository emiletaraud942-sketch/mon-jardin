import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { setUi } from '../lib/ui'

/**
 * En-tête de page de la maquette Leafora : petite phrase grise, titre en serif, et à droite une pastille ronde.
 * Sur téléphone, il remplace la barre du haut (classe `.app.pagehead`). Par défaut la pastille ouvre « Mon compte et réglages ».
 * Sur grand écran la barre du haut reste : la pastille par défaut est masquée (`.pagehead-user`).
 * `compact` : même style, sur 52 px de haut (carte et Vue 3D, qui gardent leur espace). `onHelp` ajoute la pastille « ? » (aide de l'écran).
 * `current` : l'écran affiché est celui de la pastille (Réglages) : elle est pleine et ne fait rien de plus.
 */
export function PageHead({ kicker, title, action, big, compact, onHelp, current }: { kicker?: ReactNode; title: ReactNode; action?: ReactNode; big?: boolean; compact?: boolean; onHelp?: () => void; current?: boolean }) {
  const help = onHelp && (
    <button className="pagehead-btn pagehead-help" aria-label="Aide" aria-haspopup="dialog" onClick={onHelp}>
      <span aria-hidden>?</span>
    </button>
  )
  const user = (
    <button
      className="pagehead-btn pagehead-user"
      aria-label="Mon compte et réglages"
      aria-current={current ? 'page' : undefined}
      aria-pressed={current ? true : undefined}
      onClick={() => setUi({ tab: 'reglages' })}
    >
      <Icon name="user" size={22} />
    </button>
  )
  return (
    <header className={'pagehead' + (big ? ' big' : '') + (compact ? ' compact' : '')}>
      <div className="pagehead-text">
        {kicker && <p className="pagehead-kicker">{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {action ?? (onHelp ? <div className="pagehead-actions">{help}{user}</div> : user)}
    </header>
  )
}
