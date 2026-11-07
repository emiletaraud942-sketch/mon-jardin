import { useEffect, useState } from 'react'
import { sendLoginCode, verifyLoginCode } from '../../lib/neighbors/api'
import { CODE_HINT, CODE_SENT, RESEND_AFTER_S, STAY_LOGGED } from '../../lib/loginText'
import { isEmailLike } from '../../lib/neighbors/logic'
import { ErrorBox } from './common'
import { errorText } from './hooks'

const NO_PASSWORD = 'Pas de mot de passe : un code arrive par e-mail, à saisir ici. Vos voisins ne voient jamais votre adresse.'

/**
 * Connexion par CODE reçu par e-mail, saisi dans l'appli : un lien ouvert dans Safari ne connecterait pas l'appli épinglée sur iPhone.
 * Une fois le code accepté, la session reste ouverte sur cet appareil ; l'écran change tout seul (`onSessionChange`).
 */
export function SignIn({ online }: { online: boolean }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const digits = code.replace(/\D/g, '')

  useEffect(() => {
    if (!resendAt) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [resendAt])

  async function send(to: string) {
    setBusy(true)
    setError(undefined)
    try {
      await sendLoginCode(to)
      setSentTo(to.trim())
      setCode('')
      setNow(Date.now())
      setResendAt(Date.now() + RESEND_AFTER_S * 1000)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (!sentTo) return
    setBusy(true)
    setError(undefined)
    try {
      await verifyLoginCode(sentTo, code)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (digits.length >= 6 && !busy) void verify()
        }}
      >
        <h2>Regardez vos e-mails</h2>
        <p style={{ margin: 0 }}>
          {CODE_SENT} Adresse : <strong>{sentTo}</strong>.
        </p>
        <label className="field">
          <span>Code reçu par e-mail</span>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={14}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        {error && <ErrorBox message={error} />}
        <button className="btn primary" type="submit" disabled={busy || !online || digits.length < 6}>
          {busy && <span className="spinner" />} Me connecter
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          {CODE_HINT} {STAY_LOGGED}
        </p>
        <div className="row">
          <button className="btn" type="button" onClick={() => void send(sentTo)} disabled={busy || !online || now < resendAt}>
            {now < resendAt ? `Renvoyer un code (${Math.ceil((resendAt - now) / 1000)} s)` : 'Renvoyer un code'}
          </button>
          <button className="btn ghost" type="button" onClick={() => (setSentTo(undefined), setCode(''), setError(undefined))}>
            Changer d’adresse
          </button>
        </div>
      </form>
    )
  }
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (isEmailLike(email) && !busy) void send(email)
      }}
    >
      <h2>Votre adresse e-mail</h2>
      <p style={{ margin: 0 }}>{NO_PASSWORD}</p>
      <label className="field">
        <span>Adresse e-mail</span>
        <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="votre@email.fr" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && <ErrorBox message={error} />}
      {!online && <p className="small warn-text" style={{ margin: 0 }}>Pas de réseau. Reconnectez-vous pour recevoir le code.</p>}
      <button className="btn primary" type="submit" disabled={busy || !online || !isEmailLike(email)}>
        {busy && <span className="spinner" />} Recevoir un code par e-mail
      </button>
    </form>
  )
}
