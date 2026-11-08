import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** Carte repliée : un titre, et le détail seulement à la demande (écrans chargés, public novice). */
export function Fold({ title, children, open, className, feat }: { title: ReactNode; children: ReactNode; open?: boolean; className?: string; feat?: string }) {
  return (
    <div className={'card fold' + (className ? ' ' + className : '')} data-feat={feat}>
      <details open={open}>
        <summary>
          <h2>{title}</h2>
          <span className="fold-chev" aria-hidden>
            <Icon name="chevron" size={20} />
          </span>
        </summary>
        <div className="fold-body">{children}</div>
      </details>
    </div>
  )
}
