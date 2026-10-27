import { useEffect, useState } from 'react'
import { Fold } from '../../components/Fold'
import { Icon } from '../../components/Icon'
import { TechDetails } from '../../components/ErrorNote'
import { Modal } from '../../components/Modal'
import { formatDay } from '../../lib/format'
import { exportCurrentState } from '../../lib/backup'
import { showToast } from '../../lib/toast'
import { eraseAllData, type EraseReport } from '../../lib/security/erase'
import { ERASE_LEVELS, availableLevels, canErase, levelToRemote, remoteLeftOnline, type EraseLevel } from '../../lib/security/eraseLevels'
import { DATA_INVENTORY, PERMISSIONS } from '../../lib/security/inventory'
import { consentDate, hasConsent, revokeConsent, useConsents, type ConsentId } from '../../lib/consent'
import { neighborsEnabled } from '../../lib/neighbors/enabled'
import { neighborsVapidPublic } from '../../lib/neighbors/env'
import { NETWORK_INFO } from '../../lib/legal'
import { LegalLink } from '../legal/LegalLinks'

const syncConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY
const voisinsConfigured = neighborsEnabled

const STEP_LABEL: Record<string, string> = {
  remote: 'Copie en ligne',
  indexeddb: 'Jardins, plantes et photos de cet appareil',
  localstorage: 'Réglages et météo gardée en mémoire',
  caches: 'Images de carte gardées en mémoire',
  signout: 'Connexion',
}

function EraseDialog({ onClose }: { onClose: () => void }) {
  const [level, setLevel] = useState<EraseLevel>('device')
    const [hasSync, setHasSync] = useState(false)
  const [hasNeighbors, setHasNeighbors] = useState(false)
  const [delNeighbors, setDelNeighbors] = useState(false)
  const [sure, setSure] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<EraseReport>()

  useEffect(() => {
    let alive = true
    if (syncConfigured)
      import('../../lib/sync')
        .then((m) => m.currentUser())
        .then((u) => alive && setHasSync(!!u))
        .catch(() => {})
    if (voisinsConfigured)
      import('../../lib/neighbors/api')
        .then((m) => m.getSession())
        .then((x) => alive && setHasNeighbors(!!x))
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const levels = availableLevels(hasSync)

  async function run() {
    setBusy(true)
    try {
      // Entraide d'abord : il faut encore être connecté. Un échec arrête tout, rien n'est effacé.
      if (hasNeighbors && delNeighbors) {
        try {
          const api = await import('../../lib/neighbors/api')
          await api.deleteMyAccount()
        } catch (e) {
          showToast({ message: 'Votre compte d’entraide n’a pas pu être supprimé. Rien n’a été effacé. Réessayez dans un instant.', tone: 'error' })
          console.warn('Compte d’entraide non supprimé', e)
          return
        }
      }
      const r = await eraseAllData({ remote: levelToRemote(level) })
      // L'écran Réglages disparaît dès que le dernier jardin est effacé : le résultat passe par un message qui survit.
      const failed = r.steps.filter((s) => !s.ok).map((s) => STEP_LABEL[s.id] ?? s.id)
      const left = remoteLeftOnline(level, hasSync, hasNeighbors, delNeighbors)
      const done = [level === 'snapshot' ? 'copie en ligne supprimée' : '', level === 'account' ? 'compte de synchronisation supprimé' : '', hasNeighbors && delNeighbors ? 'compte d’entraide supprimé' : '']
        .filter(Boolean)
        .join(', ')
      showToast({
        message: r.ok
          ? `Tout est effacé de cet appareil${done ? ` (${done})` : ''}.${left.length ? ` Restent en ligne : ${left.join(', ')}.` : ''}`
          : `Effacement incomplet : ${failed.join(', ')}. Réessayez, ou videz les données du site dans les réglages du programme internet.`,
        tone: r.ok ? 'info' : 'error',
      })
      setReport(r)
    } finally {
      setBusy(false)
    }
  }

  if (report) {
    return (
      <Modal title={report.ok ? 'Tout est effacé' : 'Effacement incomplet'} onClose={() => location.replace(location.pathname)}>
        <ul className="steps">
          {report.steps.map((s) => (
            <li key={s.id}>
              <span aria-hidden>{s.ok ? '✓' : '!'}</span>
              <span>
                {STEP_LABEL[s.id] ?? s.id} : {s.ok ? 'effacé' : 'pas effacé'}
                {s.error && <TechDetails detail={s.error} />}
              </span>
            </li>
          ))}
        </ul>
        {report.manual.map((m) => (
          <p key={m} className="muted small">
            {m}
          </p>
        ))}
        <button className="btn primary" onClick={() => location.replace(location.pathname)}>
          Recommencer à zéro
        </button>
      </Modal>
    )
  }

  return (
    <Modal title="Effacer toutes mes données ?" onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          Vos jardins, plantes, photos et réglages seront retirés de cet appareil. <strong>Cela ne peut pas être annulé.</strong>
        </p>
        <p className="alert small" style={{ margin: 0 }}>La sauvegarde simple n’a pas les photos (« Sauvegarde avec photos » dans Réglages).</p>
        <button
          className="btn"
          onClick={() => {
            exportCurrentState('permajardin-avant-effacement')
            setBackedUp(true)
          }}
        >
          <Icon name="download" /> Faire d’abord une sauvegarde
        </button>
        {backedUp && (
          <p className="small" role="status" style={{ margin: 0 }}>
            ✓ Sauvegarde faite. Elle est dans vos téléchargements.
          </p>
        )}
        {levels.length > 1 && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: '8px 0 0' }}>
            <legend><strong>Que supprimer en ligne ?</strong></legend>
            {ERASE_LEVELS.map((l) => (
              <label key={l.id} className="check-row">
                <input type="radio" name="erase-level" checked={level === l.id} onChange={() => setLevel(l.id)} />
                <span>
                  <strong>{l.label}</strong>
                  <span className="muted small" style={{ display: 'block' }}>{l.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {hasNeighbors && (
          <div className="stack">
            <p style={{ margin: 0 }}>
              <strong>Entraide :</strong> vos annonces et votre compte restent en ligne si vous ne les supprimez pas ici.
            </p>
            <label className="check-row">
              <input type="checkbox" checked={delNeighbors} onChange={(e) => setDelNeighbors(e.target.checked)} />
              Supprimer aussi mon compte d’entraide, mes annonces, photos et messages
            </label>
          </div>
        )}
        <label className="check-row sure-row">
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
          <span>
            <strong>Oui, je veux tout effacer.</strong>
            {level === 'account' && ' Mon compte de synchronisation et mon e-mail seront aussi supprimés.'}
          </span>
        </label>
        <div className="row confirm-actions">
          <button className="btn" onClick={onClose} autoFocus>
            Annuler
          </button>
          <button className="btn danger-solid" disabled={!canErase(level, sure, sure, busy)} onClick={run}>
            {busy ? <span className="spinner" /> : <Icon name="trash" size={16} />} Tout effacer
          </button>
        </div>
        {!sure && <p className="small muted" style={{ margin: 0 }}>Cochez la case pour pouvoir effacer.</p>}
      </div>
    </Modal>
  )
}

const CONSENT_ROWS: { id: ConsentId; label: string; visible: boolean }[] = [
  { id: 'plantnet', label: 'Envoyer mes photos à Pl@ntNet pour reconnaître une plante', visible: true },
  { id: 'sync', label: 'Mettre une copie de mes jardins en ligne', visible: syncConfigured },
  { id: 'voisins', label: 'Entraide entre voisins', visible: voisinsConfigured },
  { id: 'notifications', label: 'Alertes de nouveaux messages sur cet appareil', visible: voisinsConfigured && !!neighborsVapidPublic },
]

/** Retirer une autorisation. Pour les alertes (et pour l'entraide, dont elles dépendent), l'appareil est aussi désabonné : sinon il en recevrait encore. */
async function withdraw(id: ConsentId) {
  if (id === 'notifications' || (id === 'voisins' && hasConsent('notifications'))) {
    try {
      const api = await import('../../lib/neighbors/api')
      await api.disablePushOnThisDevice()
    } catch {
      revokeConsent('notifications')
    }
  }
  if (id !== 'notifications') revokeConsent(id)
}

function Consents() {
  const granted = useConsents()
  return (
    <div className="consents">
      <h3>Ce que j’ai autorisé</h3>
      <ul className="list">
        {CONSENT_ROWS.filter((r) => r.visible).map((r) => (
          <li key={r.id} className="consent-row">
            <div>
              <strong>{r.label}</strong>
              <div className="muted small">
                {granted[r.id] ? `Autorisé${consentDate(r.id) ? ` le ${formatDay(consentDate(r.id)!, { year: true })}` : ''}` : 'Pas encore autorisé. On vous le demandera avant le premier envoi.'}
              </div>
            </div>
            {granted[r.id] && (
              <button className="btn small" onClick={() => void withdraw(r.id)} aria-label={`Ne plus autoriser : ${r.label}`}>
                Ne plus autoriser
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">« Ne plus autoriser » n’efface aucune donnée.</p>
    </div>
  )
}

export function PrivacyCard() {
  const [erasing, setErasing] = useState(false)
  return (
    <Fold title="Vie privée et données">
      <p>Vos données restent sur cet appareil. Rien n’est envoyé sans votre accord, sauf la carte et la météo.</p>
      <Consents />
      <details className="np-details">
        <summary>Détails</summary>
        <p className="small muted">{NETWORK_INFO}</p>
        <p className="small">
          Texte complet : <LegalLink id="confidentialite" label="politique de confidentialité" />.
        </p>
        <details>
          <summary>Quelles données, où, pour qui ?</summary>
          <ul className="list small">
            {DATA_INVENTORY.map((d) => (
              <li key={d.id}>
                <strong>{d.donnee}</strong>
                <div>
                  Stockée : {d.stockage}.{' '}
                  {d.destinataires.length > 0 ? `Envoyée à : ${d.destinataires.join(', ')}.` : 'Jamais envoyée à un tiers.'}
                </div>
                <div className="muted">
                  {d.finalite} Durée : {d.duree}. Effacement : {d.effacement}
                </div>
              </li>
            ))}
          </ul>
        </details>
        <details style={{ marginTop: 8 }}>
          <summary>Ce que l’appli peut demander à votre appareil</summary>
          <ul className="list small">
            {PERMISSIONS.map((p) => (
              <li key={p.permission}>
                <strong>{p.permission}</strong> — {p.ou}. {p.pourquoi}
                <div className="muted">Si vous refusez : {p.siRefusee}</div>
              </li>
            ))}
          </ul>
        </details>
      </details>
      <div className="danger-zone">
        <button className="btn danger" onClick={() => setErasing(true)}>
          <Icon name="trash" size={16} /> Effacer toutes mes données
        </button>
      </div>
      {erasing && <EraseDialog onClose={() => setErasing(false)} />}
    </Fold>
  )
}
