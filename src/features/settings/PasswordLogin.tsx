import type { User } from '@supabase/supabase-js'
import { useState } from 'react'
import { friendlyError } from '../../lib/http'

/**
 * « Se connecter avec un mot de passe » : pour retrouver ses jardins en un geste après un effacement des données du navigateur
 * (Firefox remplit l'adresse et le mot de passe). Le code par e-mail reste possible.
 */
export function PasswordLogin({ onSignedIn, initialEmail = '' }: { onSignedIn: (u: User) => void | Promise<void>; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const m = await import('../../lib/sync')
      const user = await m.signInWithPassword(email, password)
      setPassword('')
      await onSignedIn(user)
    } catch (err) {
      setError(friendlyError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="np-details password-login" data-feat="connexion-mot-de-passe">
      <summary>Se connecter avec un mot de passe</summary>
      <form className="stack" style={{ marginTop: 8 }} onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span>Adresse e-mail</span>
          <input className="input" type="email" name="username" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input className="input" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={busy || !email.includes('@') || !password}>
          {busy && <span className="spinner" />} Me connecter
        </button>
        {error && <p className="alert error small" role="alert" style={{ margin: 0 }}>{error}</p>}
      </form>
    </details>
  )
}

/** « Choisir un mot de passe » (compte déjà connecté) : la prochaine reconnexion tient en un geste. */
export function SetPassword({ email }: { email?: string | null }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>()
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const m = await import('../../lib/sync')
      await m.setAccountPassword(password)
      setPassword('')
      setMsg({ ok: 'Mot de passe enregistré. Vous pourrez vous reconnecter avec, ou avec un code.' })
    } catch (err) {
      setMsg({ error: friendlyError(err).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="np-details set-password" data-feat="choisir-mot-de-passe">
      <summary>Choisir un mot de passe (pour se reconnecter en un geste)</summary>
      <form className="stack" style={{ marginTop: 8 }} onSubmit={(e) => void submit(e)}>
        <p className="small muted" style={{ margin: 0 }}>Utile si les données de votre navigateur sont effacées : le gestionnaire de mots de passe de Firefox le remplit. Le code par e-mail reste possible.</p>
        <input type="text" name="username" autoComplete="username" value={email ?? ''} readOnly hidden />
        <label className="field">
          <span>Nouveau mot de passe (8 caractères au moins)</span>
          <input className="input" type="password" name="new-password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn" type="submit" disabled={busy || password.length < 8}>
          {busy && <span className="spinner" />} Enregistrer le mot de passe
        </button>
        {msg?.ok && <p role="status" style={{ margin: 0 }}>✓ {msg.ok}</p>}
        {msg?.error && <p className="alert error small" role="alert" style={{ margin: 0 }}>{msg.error}</p>}
      </form>
    </details>
  )
}
