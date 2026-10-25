import { useMemo, useState } from 'react'
import { useConsents } from '../../lib/consent'
import { disablePushOnThisDevice, enablePushOnThisDevice, getNotificationPrefs, isDeviceRegistered, saveNotificationPrefs, type NotificationPrefs } from '../../lib/neighbors/api'
import { currentSubscription, detectPushSupport, PERMISSION_TEXT, pushEnvFromWindow, readPermission, SUPPORT_TEXT, toDeviceRow, type PermissionState } from '../../lib/neighbors/push'
import { showToast } from '../../lib/toast'
import { ConsentDialog } from '../legal/ConsentDialog'
import { ErrorBox, Spinner } from './common'
import { errorText, useLoad } from './hooks'

/** Mot court pour l'état de l'autorisation du programme internet. */
const PERMISSION_WORD: Record<PermissionState, string> = {
  granted: 'Accordée',
  denied: 'Refusée',
  default: 'Pas encore demandée',
  unsupported: 'Non proposée',
}

interface DeviceState {
  /** Le navigateur est abonné ET le serveur connaît l'appareil. */
  active: boolean
  prefs: NotificationPrefs | null
}

async function loadDevice(canPush: boolean): Promise<DeviceState> {
  const row = canPush ? toDeviceRow(await currentSubscription()) : null
  const [registered, prefs] = await Promise.all([row ? isDeviceRegistered(row.endpoint) : Promise.resolve(false), getNotificationPrefs()])
  return { active: !!row && registered, prefs }
}

/** Écran « Mes notifications » du Profil : activer les alertes sur cet appareil, choisir ce qu'on reçoit, se désabonner. */
export function Notifications({ online, onBack }: { online: boolean; onBack: () => void }) {
  const support = useMemo(() => detectPushSupport(pushEnvFromWindow()), [])
  const consents = useConsents()
  const [permission, setPermission] = useState<PermissionState>(readPermission)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [note, setNote] = useState<string>()
  // Sans clé d'alerte (fonction non ouverte), on n'interroge même pas la base.
  const state = useLoad(() => loadDevice(support.ok), 'notifications', support.ok || support.reason !== 'not-configured')
  const prefs = state.data?.prefs ?? null
  const active = state.data?.active ?? false

  async function start() {
    setBusy(true)
    setError(undefined)
    setNote(undefined)
    try {
      await enablePushOnThisDevice()
      showToast({ message: 'Alertes activées sur cet appareil.' })
      state.reload()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setPermission(readPermission())
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(undefined)
    setNote(undefined)
    const reachedServer = await disablePushOnThisDevice()
    showToast({ message: 'Alertes arrêtées sur cet appareil.' })
    if (!reachedServer) setNote('Pas de réseau pour prévenir le serveur. Il oubliera cet appareil tout seul.')
    setPermission(readPermission())
    state.reload()
    setBusy(false)
  }

  async function toggleMessages(checked: boolean) {
    const before = state.data
    const next: NotificationPrefs = { messages: checked, nouveautes: prefs?.nouveautes ?? false, evenements: prefs?.evenements ?? false }
    if (before) state.setData({ ...before, prefs: next })
    setError(undefined)
    try {
      await saveNotificationPrefs(next)
      showToast({ message: checked ? 'Vous serez prévenu des nouveaux messages.' : 'Vous ne serez plus prévenu des nouveaux messages.' })
    } catch (e) {
      if (before) state.setData(before)
      setError(errorText(e))
    }
  }

  return (
    <div className="stack">
      <button className="btn ghost nb-back" onClick={onBack}>
        ‹ Retour au profil
      </button>

      <section className="card stack" aria-label="Alertes sur cet appareil">
        <h2>Mes notifications</h2>
        <p style={{ margin: 0 }}>Une alerte vous prévient d’un nouveau message privé, même quand l’appli est fermée. Elle ne montre jamais le texte du message.</p>
        {!support.ok && (
          <p className="alert info" role="status" style={{ margin: 0 }}>
            {SUPPORT_TEXT[support.reason]}
          </p>
        )}
        {support.ok && (
          <>
            {state.loading && !state.data && <Spinner label="Chargement…" />}
            {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
            {state.data && (
              <ul className="list nb-state">
                <li>
                  Autorisation du programme internet : <strong>{PERMISSION_WORD[permission]}</strong>
                </li>
                <li>
                  Alertes sur cet appareil : <strong>{active ? 'Activées' : 'Pas activées'}</strong>
                </li>
              </ul>
            )}
            <p className="small muted" style={{ margin: 0 }}>
              {PERMISSION_TEXT[permission]}
            </p>
            {error && <ErrorBox message={error} />}
            {note && (
              <p className="small" role="status" style={{ margin: 0 }}>
                {note}
              </p>
            )}
            <div className="row">
              {state.data && !active && permission !== 'denied' && (
                <button className="btn primary tall" disabled={!online || busy} onClick={() => (consents.notifications ? void start() : setAsking(true))}>
                  {busy && <span className="spinner" />} Activer les alertes sur cet appareil
                </button>
              )}
              {state.data && active && (
                <button className="btn tall" disabled={busy} onClick={() => void stop()}>
                  {busy && <span className="spinner" />} Se désabonner de cet appareil
                </button>
              )}
            </div>
            {!online && (
              <p className="small muted" style={{ margin: 0 }}>
                Pas de réseau. Réessayez quand vous serez connecté.
              </p>
            )}
          </>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          Sans alerte, le nombre de nouveaux messages s’affiche quand vous ouvrez l’appli.
        </p>
      </section>

      {state.data && (
        <section className="card stack" aria-label="Ce que je veux recevoir">
          <h3 style={{ margin: 0 }}>Ce que je veux recevoir</h3>
          <label className="check-row">
            <input type="checkbox" checked={prefs?.messages === true} disabled={!online} onChange={(e) => void toggleMessages(e.target.checked)} />
            <span>Quand je reçois un nouveau message privé</span>
          </label>
          <p className="small muted" style={{ margin: 0 }}>
            Ce choix vaut pour tous vos appareils. Rien n’est envoyé si la case est décochée.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            D’autres alertes viendront plus tard, comme les nouveautés et les événements. Elles seront décochées au départ.
          </p>
        </section>
      )}

      {asking && (
        <ConsentDialog
          id="notifications"
          onRefuse={() => setAsking(false)}
          onAccept={() => {
            setAsking(false)
            void start()
          }}
        />
      )}
    </div>
  )
}
