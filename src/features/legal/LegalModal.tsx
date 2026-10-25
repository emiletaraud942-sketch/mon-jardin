import { Modal } from '../../components/Modal'
import { DRAFT_NOTE, LEGAL_DOC, LEGAL_VERSION, formatLegalDate, isLegalReady, legalText, type LegalId } from '../../lib/legal'
import { closeLegal, useLegal } from '../../lib/ui'
import { LegalLink } from './LegalLinks'

/** Rendu React du document : aucun HTML injecté. */
export function LegalDocView({ id }: { id: LegalId }) {
  const doc = LEGAL_DOC[id]
  // Tant que l'éditeur n'a pas rempli ses informations, le texte est annoncé comme provisoire. Ensuite, plus rien à signaler.
  const provisional = !isLegalReady()
  return (
    <article className="legal-doc">
      <p className="legal-meta small muted">
        Version {LEGAL_VERSION} · Dernière mise à jour : {formatLegalDate()}
      </p>
      {provisional && (
        <p className="legal-draft small" role="note">
          {DRAFT_NOTE}
        </p>
      )}
      {doc.sections.map((s) => (
        <section key={s.titre}>
          <h3>{s.titre}</h3>
          {s.blocs.map((b, i) =>
            b.t === 'p' ? (
              <p key={i}>{legalText(b.text)}</p>
            ) : (
              <ul key={i}>
                {b.items.map((it) => (
                  <li key={it}>{legalText(it)}</li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
      <p className="small muted">
        Voir aussi : {id !== 'confidentialite' && <LegalLink id="confidentialite" />}
        {id !== 'mentions' && <LegalLink id="mentions" />}
        {id !== 'cgu' && <LegalLink id="cgu" />}
      </p>
    </article>
  )
}

/** Page légale ouverte (une seule à la fois), au-dessus de tout, avec ou sans jardin. */
export function LegalModal() {
  const id = useLegal()
  if (!id) return null
  return (
    <Modal key={id} title={LEGAL_DOC[id].titre} onClose={closeLegal}>
      <LegalDocView id={id} />
    </Modal>
  )
}
