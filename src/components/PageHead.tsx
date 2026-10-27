import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { setUi } from '../lib/ui'

/**
 * En-tête de page de la maquette Leafora : petite phrase grise, titre en serif, et à droite une pastille ronde.
 * Sur téléphone, il remplace la barre du haut (classe `.app.pagehead`). Par défaut la pastille ouvre « Mon compte et réglages ».
 * Sur grand écran la barre du haut reste : la pastille par défaut est masquée (`.pagehead-user`).
 */
export function PageHead({ kicker, title, action, big }: { kicker?: ReactNode; title: ReactNode; action?: ReactNode; big?: boolean }) {
  return (
    <header className={'pagehead' + (big ? ' big' : '')}>
      <div className="pagehead-text">
        {kicker && <p className="pagehead-kicker">{kicker}</p>}
        <h1>{title}</h1>
      </div>
      {action ?? (
        <button className="pagehead-btn pagehead-user" aria-label="Mon compte et réglages" onClick={() => setUi({ tab: 'reglages' })}>
          <Icon name="user" size={22} />
        </button>
      )}
    </header>
  )
}
