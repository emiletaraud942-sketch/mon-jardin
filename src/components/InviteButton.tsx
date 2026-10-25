import { useRef, useState } from 'react'
import { browserInviteEnv, canShareInvite, inviteMessage, inviteUrl, runInvite, type InviteResult } from '../lib/invite'
import { showToast } from '../lib/toast'
import { Icon } from './Icon'

/**
 * Bouton « inviter » : feuille de partage du téléphone, sinon copie du lien. Rien ne part tout seul.
 * `label` s'affiche quand le partage existe, `copyLabel` quand le bouton copie le lien.
 */
export function InviteButton({ label, copyLabel, className = 'btn' }: { label: string; copyLabel: string; className?: string }) {
  const [result, setResult] = useState<InviteResult>()
  const [busy, setBusy] = useState(false)
  const fieldRef = useRef<HTMLInputElement>(null)
  const share = canShareInvite()
  const env = browserInviteEnv()

  async function go() {
    if (busy) return
    setBusy(true)
    const r = await runInvite(browserInviteEnv())
    setBusy(false)
    setResult(r)
    if (r === 'copied') showToast({ message: inviteMessage(r) })
    if (r === 'manual') setTimeout(() => fieldRef.current?.select(), 0)
  }

  return (
    <div className="stack invite">
      <button className={className} onClick={() => void go()} disabled={busy}>
        <Icon name="users" /> {share ? label : copyLabel}
      </button>
      {result && result !== 'cancelled' && (
        <p className="small invite-msg" role="status" style={{ margin: 0 }}>
          {inviteMessage(result)}
        </p>
      )}
      {result === 'manual' && <input ref={fieldRef} className="input" readOnly value={inviteUrl(env.origin)} aria-label="Lien de l’appli" onFocus={(e) => e.currentTarget.select()} />}
    </div>
  )
}
