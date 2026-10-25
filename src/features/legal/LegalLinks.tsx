import { LEGAL_LINK_LABEL, type LegalId } from '../../lib/legal'
import { openLegal } from '../../lib/ui'

const ORDER: LegalId[] = ['confidentialite', 'mentions', 'cgu']

/** Bouton qui ressemble à un lien et ouvre une page légale. */
export function LegalLink({ id, label, onOpen }: { id: LegalId; label?: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      className="legal-link"
      onClick={() => {
        onOpen?.()
        openLegal(id)
      }}
    >
      {label ?? LEGAL_LINK_LABEL[id]}
    </button>
  )
}

/** « Confidentialité · Mentions légales · Conditions d'utilisation ». */
export function LegalLinks({ onOpen }: { onOpen?: () => void }) {
  return (
    <nav className="legal-links" aria-label="Informations légales">
      {ORDER.map((id) => (
        <span key={id} className="legal-links-item">
          <LegalLink id={id} onOpen={onOpen} />
        </span>
      ))}
    </nav>
  )
}
