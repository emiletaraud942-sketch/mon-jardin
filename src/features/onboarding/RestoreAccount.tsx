import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { autoSyncReconcile } from '../../lib/autoSync'
import { hasConsent } from '../../lib/consent'
import { friendlyError } from '../../lib/http'
import { CODE_HINT, CODE_SENT, NOTHING_ONLINE, RESTORED } from '../../lib/loginText'
import { getState, subscribeStore } from '../../lib/store'
import { noteWelcomed, setUi } from '../../lib/ui'
import { ConsentDialog } from '../legal/ConsentDialog'

/** Attend que les jardins repris de la copie en ligne arrivent (ou renonce après `ms`). */
function waitForGardens(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (getState().gardens.length > 0) return resolve(true)
    const timer = setTimeout(() => (off(), resolve(false)), ms)
    const off = subscribeStore(() => {
      if (getState().gardens.length > 0) {
        clearTimeout(timer)
        off()
        resolve(true)
      }
    })
  })
}

/**
 * « J'ai déjà un compte » (écran de bienvenue d'un appareil neuf) : adresse e-mail, code reçu, puis les jardins en ligne sont repris.
 * Le code se saisit ici, dans l'appli : un lien ouvert dans Safari ne connecterait pas l'appli épinglée sur iPhone.
 */
export function RestoreAccount({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [codeFor, setCodeFor] = useState<string>()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()
  const [asking, setAsking] = useState<() => void>()
  const digits = code.replace(/\D/g, '')

  async function run(f: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await f()
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setBusy(false)
    }
  }
  const send = (to: string) =>
    run(async () => {
      const m = await import('../../lib/sync')
      await m.sendLoginCode(to)
      setCodeFor(to.trim())
      setCode('')
    })
  const withConsent = (action: () => void) => (hasConsent('sync') ? action() : setAsking(() => action))
  const verify = () =>
    run(async () => {
      const m = await import('../../lib/sync')
      await m.verifyLoginCode(codeFor!, code)
      autoSyncReconcile()
      const got = await waitForGardens(10_000)
      if (got) {
        noteWelcomed()
        setUi({ tab: 'accueil' })
        setDone(RESTORED)
      } else setDone(NOTHING_ONLINE)
    })

  return (
    <Modal title="Retrouver mes jardins" onClose={onClose} sheet>
      <div className="stack">
        {done ? (
          <>
            <p role="status" style={{ margin: 0 }}>✓ {done}</p>
            <button className="btn primary" onClick={onClose}>Continuer</button>
          </>
        ) : codeFor ? (
          <>
            <p role="status" style={{ margin: 0 }}>{CODE_SENT}</p>
            <p className="small muted" style={{ margin: 0 }}>Adresse : {codeFor}. {CODE_HINT}</p>
            <label className="field">
              <span>Code reçu par e-mail</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={14}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && digits.length >= 6 && !busy && void verify()}
              />
            </label>
            <button className="btn primary" disabled={busy || digits.length < 6} onClick={() => void verify()}>
              {busy && <span className="spinner" />} Me connecter
            </button>
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => withConsent(() => void send(codeFor))}>Renvoyer un code</button>
              <button className="btn ghost" disabled={busy} onClick={() => (setCodeFor(undefined), setError(undefined))}>Changer d’adresse</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0 }}>Entrez l’adresse e-mail de votre compte. Nous vous envoyons un code à saisir ici.</p>
            <label className="field">
              <span>Votre adresse e-mail</span>
              <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="votre@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn primary" disabled={busy || !email.includes('@')} onClick={() => withConsent(() => void send(email))}>
              {busy && <span className="spinner" />} Recevoir un code par e-mail
            </button>
          </>
        )}
        {error && <p className="alert error small" role="alert" style={{ margin: 0 }}>{error}</p>}
      </div>
      {asking && (
        <ConsentDialog
          id="sync"
          onAccept={() => {
            const action = asking
            setAsking(undefined)
            action()
          }}
          onRefuse={() => setAsking(undefined)}
        />
      )}
    </Modal>
  )
}
