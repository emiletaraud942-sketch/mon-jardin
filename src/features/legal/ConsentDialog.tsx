import { Modal } from '../../components/Modal'
import { CONSENT_TEXT } from '../../lib/legal'
import { grantConsent, type ConsentId } from '../../lib/consent'
import { LegalLink } from './LegalLinks'

/** Demande de consentement avant un envoi vers un service extérieur. Refus : `onRefuse`, rien n'est envoyé. */
export function ConsentDialog({ id, onAccept, onRefuse }: { id: ConsentId; onAccept: () => void; onRefuse: () => void }) {
  const t = CONSENT_TEXT[id]
  return (
    <Modal title={t.titre} onClose={onRefuse}>
      <div className="stack consent-body">
        {t.paragraphes.map((x) => (
          <p key={x} style={{ margin: 0 }}>
            {x}
          </p>
        ))}
        <p className="small" style={{ margin: 0 }}>
          Pour en savoir plus : <LegalLink id="confidentialite" label="politique de confidentialité" />.
        </p>
        <div className="row consent-actions">
          <button className="btn" onClick={onRefuse}>
            Non merci
          </button>
          <button
            className="btn primary"
            onClick={() => {
              grantConsent(id)
              onAccept()
            }}
          >
            {t.accepter}
          </button>
        </div>
      </div>
    </Modal>
  )
}
