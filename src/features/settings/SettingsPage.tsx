import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SyncConflictError } from '../../lib/sync'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ErrorNote, TechDetails } from '../../components/ErrorNote'
import { Fold } from '../../components/Fold'
import { Icon } from '../../components/Icon'
import { Segmented } from '../../components/Segmented'
import { SavedNote, useFlash } from '../../components/useFlash'
import { backupCurrentState, canShareFile, exportCurrentState, lastExportAt, lastExportName, REMIND_EVERY_DAYS, saveBackupBlob, saveOutcomeText, shareFile, type SaveOutcome } from '../../lib/backup'
import { autoSyncMessage, autoSyncReconcile, autoSyncResolved, useAutoSyncState } from '../../lib/autoSync'
import { downloadFullBackup, estimateFullBackup, formatMo, FULL_EXTENSION, HEAVY_BACKUP_BYTES, isFullBackup, MESSAGE_TOO_HEAVY, readFullBackup, restorePhotos, type PhotoToRestore } from '../../lib/backupFull'
import { formatDay, frNumber } from '../../lib/format'
import { friendlyError, type FriendlyError } from '../../lib/http'
import { deletePhoto } from '../../lib/photos'
import { getLoadWarnings, getState, replaceData, setActiveGarden, setState, updateGarden, useGardenPlants, useStorageStatus, useStore } from '../../lib/store'
import { type StateData } from '../../lib/migrate'
import { readBackupFile } from '../../lib/security/import'
import { getTheme, setTheme, THEME_LABEL, type Theme } from '../../lib/theme'
import { getTextSize, setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, type TextSize } from '../../lib/textSize'
import { showToast } from '../../lib/toast'
import { restartOnboarding, setUi, useUi } from '../../lib/ui'
import { doyToLabel } from '../../lib/weather'
import { lidarMessage, setLidarEnabled, useLidarScene } from '../../lib/useLidar'
import { LIDAR_ATTRIBUTION } from '../../lib/lidar'
import type { Garden, SoilTexture } from '../../types'
import { GardenCreator } from './GardenCreator'
import { GardenDataBanner } from './GardenDataBanner'
import { InstallCard } from '../../components/InstallButton'
import { HelpSheet } from '../../components/HelpSheet'
import { StepButton } from '../../components/StepButton'
import { useProgress } from '../../components/useProgress'
import { InviteButton } from '../../components/InviteButton'
import { PrivacyCard } from './PrivacyCard'
import { hasConsent } from '../../lib/consent'
import { ConsentDialog } from '../legal/ConsentDialog'
import { LegalLinks } from '../legal/LegalLinks'
import { FAIL_HELP, missingSources } from './createGarden'
import { ScanCard } from '../scan/ScanCard'
import { removeGardenData, photosOf, restoreGardenData } from './gardenDelete'
import { uniqueGardenName } from './gardenName'
import { backupErrorNote, describeCounts, importQuestion } from './importSummary'
import { useRefreshGarden } from './useRefreshGarden'

const SOILS: [SoilTexture, string][] = [
  ['limoneux', 'Limoneux (équilibré)'],
  ['argileux', 'Argileux (lourd, colle aux bottes)'],
  ['sableux', 'Sableux (léger, sèche vite)'],
  ['calcaire', 'Calcaire (caillouteux, blanchâtre)'],
  ['humifere', 'Humifère (riche, sombre)'],
]

/** Supprime un jardin ; les photos ne sont effacées qu'une fois le délai d'annulation passé. */
export const UNDO_GARDEN_MS = 15000
function deleteGardenWithUndo(garden: Garden) {
  const { next, snapshot } = removeGardenData(getState(), garden.id)
  if (!snapshot) return
  setState(() => next)
  showToast({
    message: `Le jardin « ${garden.name} » est supprimé.`,
    actionLabel: 'Annuler',
    durationMs: UNDO_GARDEN_MS,
    onAction: () => setState((s) => restoreGardenData(s, snapshot)),
    onExpire: () => {
      const stillThere = new Set(getState().plants.flatMap((p) => p.photos))
      for (const id of photosOf(snapshot)) if (!stillThere.has(id)) void deletePhoto(id).catch(() => undefined)
    },
  })
}

function GardenInfo({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const gardens = useStore((s) => s.gardens)
  const { steps, refresh, busy } = useRefreshGarden(garden)
  const [name, setName] = useState(garden.name)
  const [nameSaved, flashName] = useFlash()
  const [soilSaved, flashSoil] = useFlash()
  const [deleting, setDeleting] = useState(false)
  useEffect(() => setName(garden.name), [garden.id, garden.name])

  function commitName() {
    const others = gardens.filter((g) => g.id !== garden.id).map((g) => g.name)
    const final = uniqueGardenName(name, others)
    setName(final)
    if (final !== garden.name) {
      updateGarden(garden.id, { name: final })
      flashName()
    }
  }

  const hasPhotos = plants.some((p) => p.photos.length > 0)
  const terrain = [garden.areaM2 ? `${frNumber(garden.areaM2, 0)} m²` : '', garden.altitudeM != null ? `altitude ${frNumber(garden.altitudeM, 0)} m` : ''].filter(Boolean).join(' · ')

  return (
    <Fold title="Mon jardin" open={missingSources(garden).length > 0}>
      <GardenDataBanner garden={garden} />
      <div className="grid cols-2">
        <label className="field">
          <span>
            Nom du jardin <SavedNote show={nameSaved} />
          </span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        </label>
        <label className="field">
          <span>
            Nature du sol <SavedNote show={soilSaved} />
          </span>
          <select
            className="input"
            value={garden.sol ?? ''}
            onChange={(e) => {
              updateGarden(garden.id, { sol: (e.target.value || undefined) as SoilTexture | undefined })
              flashSoil()
            }}
          >
            <option value="">Je ne sais pas</option>
            {SOILS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="list" style={{ marginTop: 12 }}>
        <li>Adresse : {garden.address}</li>
        <li>Mon terrain : {terrain || 'plan non trouvé'}</li>
        <li>Maisons voisines : {garden.buildings ? garden.buildings.length : 'non trouvées'}</li>
        <li>
          Gel : {garden.lastFrostDoy ? `dernières gelées vers le ${doyToLabel(garden.lastFrostDoy)}` : 'dates inconnues'}
          {garden.firstFrostDoy ? `, premières vers le ${doyToLabel(garden.firstFrostDoy)}` : ''}
        </li>
        <li>
          {plants.length} plante{plants.length > 1 ? 's' : ''}
        </li>
      </ul>
      <div className="stack" style={{ marginTop: 8 }}>
        <button className="btn" onClick={refresh} disabled={busy}>
          {busy ? <span className="spinner" /> : null} Mettre à jour les informations du terrain
        </button>
      </div>
      {steps && (
        <ul className="steps small" aria-live="polite">
          {steps.map((s) => (
            <li key={s.id}>
              {s.state === 'en-cours' ? <span className="spinner" /> : s.state === 'ok' ? '✓' : s.state === 'echec' ? '!' : '○'} {s.label}
              {s.state === 'echec' && <span className="muted"> : {FAIL_HELP[s.id]}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="danger-zone">
        <button className="btn danger" onClick={() => setDeleting(true)}>
          <Icon name="trash" size={16} /> Supprimer ce jardin
        </button>
      </div>
      {deleting && (
        <ConfirmModal
          title={`Supprimer « ${garden.name} » ?`}
          confirmLabel="Supprimer ce jardin"
          photosNote={hasPhotos}
          onBackup={() => exportCurrentState('permajardin-avant-suppression', false)}
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false)
            deleteGardenWithUndo(garden)
          }}
        >
          <p>
            Ce jardin et ses {plants.length} plante{plants.length > 1 ? 's' : ''} seront retirés de cet appareil. Vous aurez 15 secondes pour annuler.
          </p>
        </ConfirmModal>
      )}
    </Fold>
  )
}

/** Relief fin et arbres des environs (LiDAR HD de l'IGN) : réglage, actualisation et retour simple. */
function LidarCard({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const lidar = useLidarScene(garden, plants)
  const busy = lidar.status === 'loading'
  const message = lidar.enabled ? lidarMessage({ status: lidar.status }, lidar.trees.length) : ''
  return (
    <Fold title="Relief et arbres des environs">
      <label className="check-row">
        <input type="checkbox" checked={lidar.enabled} onChange={(e) => setLidarEnabled(e.target.checked)} />
        <span>Utiliser les arbres des environs (données IGN)</span>
      </label>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        Leur ombre compte dans « Où planter ? » et la vue 3D. Sans ces données, rien ne change.
      </p>
      {lidar.enabled && (
        <div className="stack" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => void lidar.refresh()} disabled={busy}>
            {busy ? <span className="spinner" /> : null} Actualiser le relief et les arbres
          </button>
          <p className="small muted" role="status" aria-live="polite" style={{ margin: 0 }}>
            {message}
            {lidar.status === 'ok' && lidar.terrainSource === 'lidar' ? ' Relief plus précis utilisé.' : ''}
          </p>
          {lidar.status === 'unavailable' && lidar.detail && <TechDetails detail={lidar.detail} />}
          {lidar.status === 'ok' && <p className="small muted" style={{ margin: 0 }}>{LIDAR_ATTRIBUTION}</p>}
        </div>
      )}
    </Fold>
  )
}

interface PendingImport {
  data: StateData
  warnings: string[]
  fileName: string
  /** Sauvegarde complète : photos à ranger avant de remplacer les données. */
  photos?: PhotoToRestore[]
  /** Photos du fichier qui n'étaient pas de vraies images. */
  skipped?: number
}

const countOf = (d: Pick<StateData, 'gardens' | 'plants'>) => ({ gardens: d.gardens.length, plants: d.plants.length })

function ImportDialog({ pending, onClose, onDone }: { pending: PendingImport; onClose: () => void; onDone: (msg: string) => void }) {
  const current = getState()
  const hasCurrent = current.gardens.length > 0 || current.plants.length > 0
  const hasPhotos = current.plants.some((p) => p.photos.length > 0)

  return (
    <ConfirmModal
      title="Reprendre cette sauvegarde ?"
      confirmLabel={hasCurrent ? 'Remplacer mes données' : 'Reprendre la sauvegarde'}
      tone={hasCurrent ? 'danger' : 'primary'}
      photosNote={hasCurrent && hasPhotos}
      onBackup={hasCurrent ? () => exportCurrentState('permajardin-avant-reprise', false) : undefined}
      onCancel={onClose}
      onConfirm={() => {
        void (async () => {
          let photoNote = ''
          if (pending.photos?.length) {
            try {
              const n = await restorePhotos(pending.photos)
              photoNote = ` ${n} photo${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}.`
            } catch {
              // Espace plein : on garde les données actuelles, rien n'est remplacé.
              onDone('Les photos n’ont pas pu être rangées : l’espace de cet appareil est plein. Rien n’a été remplacé.')
              return
            }
          }
          replaceData(pending.data)
          onDone(`Sauvegarde reprise : ${describeCounts(countOf(pending.data))}.${photoNote}`)
        })()
      }}
    >
      <p>
        <strong>{importQuestion(countOf(current), countOf(pending.data))}</strong>
      </p>
      <p className="small muted">Fichier : {pending.fileName}</p>
      {pending.photos && <p className="small muted">Cette sauvegarde contient aussi {pending.photos.length} photo{pending.photos.length > 1 ? 's' : ''}{pending.skipped ? ` (${pending.skipped} illisible${pending.skipped > 1 ? 's ont été écartées' : ' a été écartée'})` : ''}.</p>}
      {pending.warnings.length > 0 && (
        <div className="alert small">
          <strong>Le fichier a été corrigé en le lisant :</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {pending.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {hasCurrent && <p className="small muted">Vos données actuelles seront remplacées. Cela ne peut pas être annulé.</p>}
    </ConfirmModal>
  )
}

/** Où vivent les données : dit la vérité, en phrases courtes. */
const STORAGE_REFUSED = '⚠ Cet appareil refuse d’enregistrer vos données. Causes possibles : navigation privée, espace plein, réglage « effacer à la fermeture ».'
const STORAGE_AUTO = '✓ Vos données s’enregistrent toutes seules sur cet appareil, à chaque modification.'
const STORAGE_WHERE =
  'Vos données sont gardées dans ce navigateur, sur cet appareil. Elles ne passent pas toutes seules d’un navigateur ou d’un téléphone à l’autre. Pour les retrouver ailleurs, faites une sauvegarde ici, puis « Reprendre une sauvegarde » sur l’autre appareil.'

function Backup() {
  const [msg, setMsg] = useState<{ text?: string; error?: FriendlyError }>()
  const [pending, setPending] = useState<PendingImport>()
  const { persistent, savedAt, writeError } = useStorageStatus()
  const savedTime = savedAt ? new Date(savedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
  const storageLine = writeError ? STORAGE_REFUSED : savedAt ? `✓ Enregistré sur cet appareil à ${savedTime}.` : STORAGE_AUTO
  const [last, setLast] = useState(lastExportAt())
  const overdue = !last || Date.now() - last > REMIND_EVERY_DAYS * 86400000
  const warnings = useRef(getLoadWarnings()).current

  const [outcome, setOutcome] = useState<SaveOutcome>()
  const [lastName, setLastName] = useState(lastExportName())

  /** Range le résultat (menu « Partager » sur téléphone, sinon téléchargement) et dit où le retrouver. */
  function done(o: SaveOutcome, detail = '') {
    setOutcome(o)
    if (o.how !== 'annule') {
      setLast(Date.now())
      setLastName(o.name)
    }
    setMsg({ text: saveOutcomeText(o) + detail })
    if (o.how !== 'annule') showToast({ message: o.how === 'partage' ? 'Sauvegarde envoyée.' : 'Sauvegarde faite. Le fichier est dans vos téléchargements.' })
  }

  async function exportJson() {
    setMsg(undefined)
    setOutcome(undefined)
    try {
      done(await backupCurrentState('permajardin', { share: true }))
    } catch (e) {
      setMsg({ error: friendlyError(e) })
    }
  }

  const [busy, setBusy] = useState(false)
  const [est, setEst] = useState<{ photos: number; bytes: number; tooHeavy: boolean }>()
  useEffect(() => {
    let alive = true
    estimateFullBackup().then((e) => alive && setEst(e), () => undefined)
    return () => {
      alive = false
    }
    // Recalculé après chaque reprise ou sauvegarde : les photos de l'appareil ont pu changer.
  }, [msg?.text, pending])

  async function exportFull() {
    setBusy(true)
    setMsg(undefined)
    try {
      setOutcome(undefined)
      const out = await downloadFullBackup('permajardin-complet', { share: true })
      const photos = ` Elle contient ${out.photos} photo${out.photos > 1 ? 's' : ''}.`
      const missing = out.missing ? ` ${out.missing} photo${out.missing > 1 ? 's' : ''} introuvable${out.missing > 1 ? 's n’ont' : ' n’a'} pas pu être ajoutée${out.missing > 1 ? 's' : ''}.` : ''
      done(out.outcome, photos + missing)
    } catch (e) {
      setMsg({ error: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  async function importJson(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = '' // permet de reprendre le même fichier
    if (!file) return
    setMsg(undefined)
    if (await isFullBackup(file)) {
      setBusy(true)
      const full = await readFullBackup(file)
      setBusy(false)
      if (!full.ok) {
        setMsg({ error: backupErrorNote(full.error) })
        return
      }
      setPending({ data: full.data, warnings: full.warnings, fileName: file.name, photos: full.photos, skipped: full.skipped })
      return
    }
    // Limite de taille, clés dangereuses retirées, plafonds et validation : tout est dans readBackupFile.
    const r = await readBackupFile(file)
    if (!r.ok) {
      setMsg({ error: backupErrorNote(r.error) })
      return
    }
    setPending({ data: r.data, warnings: r.warnings, fileName: file.name })
  }

  return (
    <div className="card">
      <h2>Sauvegarde de mes données</h2>
      <p role="status" className={writeError ? 'warn-text' : 'small'}>{storageLine}</p>
      <p className="small">{STORAGE_WHERE}</p>
      <p>La sauvegarde est un fichier, rangé dans les « Téléchargements » de cet appareil.</p>
      <p className={overdue ? 'warn-text' : 'muted'}>
        {last ? `Dernière sauvegarde : ${formatDay(last, { year: true })}${lastName ? `, fichier « ${lastName} »` : ''}.` : 'Vous n’avez pas encore fait de sauvegarde.'}
        {overdue && ' Pensez à en faire une.'}
      </p>
      {warnings.length > 0 && <p className="alert small">Certaines données ont été corrigées au démarrage : {warnings.join(' ')}</p>}
      <div className="row">
        <button className="btn primary" onClick={() => void exportJson()} disabled={busy}>
          <Icon name="download" /> Faire une sauvegarde
        </button>
        <button className="btn" onClick={() => void exportFull()} disabled={busy || est?.photos === 0}>
          <Icon name="download" /> Sauvegarde avec photos{est && est.photos > 0 ? ` (${formatMo(est.bytes)})` : ''}
        </button>
        <label className="btn file-btn">
          <Icon name="upload" /> Reprendre une sauvegarde
          <input className="sr-only" type="file" accept={`application/json,.json,${FULL_EXTENSION}`} onChange={(e) => void importJson(e.target)} />
        </label>
      </div>
      {est?.tooHeavy && <p className="alert small">{MESSAGE_TOO_HEAVY(Math.round(est.bytes / (1024 * 1024)))}</p>}
      {est && !est.tooHeavy && est.bytes > HEAVY_BACKUP_BYTES && <p className="small muted">Le fichier avec photos est lourd ({formatMo(est.bytes)}) : faites-le avec du Wi-Fi et de la place libre sur le téléphone.</p>}
      {msg?.error && <ErrorNote error={msg.error} />}
      {msg?.text && (
        <p role="status" style={{ marginTop: 8 }}>
          {outcome?.how === 'annule' ? '' : '✓ '}
          {msg.text}
        </p>
      )}
      {outcome?.file && outcome.how !== 'partage' && (
        <div className="row" style={{ marginTop: 6 }}>
          {canShareFile(outcome.file) && (
            <button
              className="btn"
              onClick={async () => {
                const r = await shareFile(outcome.file!)
                if (r === 'partage') done({ ...outcome, how: 'partage' })
              }}
            >
              Partager
            </button>
          )}
          <button className="btn" onClick={async () => done(await saveBackupBlob(outcome.file!, outcome.name))}>
            Enregistrer sur cet appareil
          </button>
        </div>
      )}
      <details className="np-details">
        <summary>Détails</summary>
        <p className="small muted">Gardez-le en lieu sûr : ordinateur, clé USB, ou e-mail à vous-même.</p>
        <p className="small muted">La sauvegarde simple n’a pas les photos : elles restent sur cet appareil. « Sauvegarde avec photos » les met dans le fichier, qui est plus lourd. « Reprendre une sauvegarde » lit les deux.</p>
        {persistent === false && <p className="small muted">Si l’espace manque, cet appareil peut effacer vos données. Une sauvegarde les protège.</p>}
      </details>
      {pending && (
        <ImportDialog
          pending={pending}
          onClose={() => setPending(undefined)}
          onDone={(text) => {
            setPending(undefined)
            setMsg({ text })
            showToast({ message: text })
          }}
        />
      )}
    </div>
  )
}

type SyncModule = typeof import('../../lib/sync')
const syncConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY

function Sync() {
  // supabase-js est chargé à l'ouverture des Réglages seulement (pas au démarrage de l'appli).
  const [mod, setMod] = useState<SyncModule>()
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ text?: string; error?: FriendlyError }>()
  const [conflict, setConflict] = useState<SyncConflictError>()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState<() => void>()
  const [pulling, setPulling] = useState(false)
  const auto = useAutoSyncState()
  useEffect(() => {
    if (!syncConfigured) return
    let alive = true
    import('../../lib/sync')
      .then(async (m) => {
        if (!alive) return
        setMod(m)
        setUser(await m.currentUser())
      })
      .catch(() => alive && setMsg({ error: { message: 'Cette fonction n’a pas pu se charger. Vérifiez votre connexion, puis rechargez la page.' } }))
    return () => {
      alive = false
    }
  }, [])
  if (!syncConfigured) return null
  if (!mod) {
    return (
      <Fold title="Retrouver mes jardins sur un autre appareil">
        {msg?.error ? <ErrorNote error={msg.error} /> : <p className="muted"><span className="spinner" /> Chargement…</p>}
      </Fold>
    )
  }

  async function run(f: (m: SyncModule) => Promise<string | void>) {
    setBusy(true)
    setMsg(undefined)
    try {
      const ok = await f(mod!)
      if (ok) setMsg({ text: ok })
    } catch (e) {
      if ((e as Error).name === 'SyncConflictError') setConflict(e as SyncConflictError)
      else setMsg({ error: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }
  /** Première mise en ligne : rien n'est envoyé au serveur avant l'accord de l'utilisateur. */
  const withConsent = (action: () => void) => {
    if (hasConsent('sync')) action()
    else setAsking(() => action)
  }
  const push = (force = false) =>
    run(async (m) => {
      await m.pushSnapshot({ force })
      setConflict(undefined)
      autoSyncResolved()
      return 'Votre copie est en ligne.'
    })
  const pull = () =>
    run(async (m) => {
      setConflict(undefined)
      const done = await m.pullSnapshot()
      autoSyncResolved()
      return done ? 'Votre copie en ligne est reprise sur cet appareil.' : 'Il n’y a pas encore de copie en ligne.'
    })
  const hasPhotos = getState().plants.some((p) => p.photos.length > 0)

  return (
    <Fold title="Retrouver mes jardins sur un autre appareil">
      <p className="small muted">Connecté, vos jardins se mettent à jour en ligne tout seuls ; reprenez-les sur un autre appareil. Les photos ne sont pas copiées.</p>
      {user ? (
        <>
          <p>Connecté : {user.email}</p>
          <p className="small" role="status">{autoSyncMessage(auto)}</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => withConsent(() => void push())}>
              Mettre ma copie en ligne
            </button>
            <button className="btn" disabled={busy} onClick={() => setPulling(true)}>
              Reprendre la copie en ligne
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => run(async (m) => (await m.signOut(), setUser(null), 'Vous êtes déconnecté.'))}>
              Se déconnecter
            </button>
          </div>
          {(conflict || auto.status === 'conflit') && (
            <div className="alert small" role="alert" style={{ marginTop: 10 }}>
              <p>Une copie plus récente existe en ligne, faite depuis un autre appareil. Laquelle voulez-vous garder ?</p>
              <div className="row">
                <button className="btn" disabled={busy} onClick={() => setPulling(true)}>
                  Garder celle en ligne
                </button>
                <button className="btn" disabled={busy} onClick={() => push(true)}>
                  Garder celle de cet appareil
                </button>
                <button className="btn ghost" onClick={() => setConflict(undefined)}>
                  Plus tard
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <label className="field">
            <span>Votre adresse e-mail</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="votre@email.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="stack" style={{ marginTop: 8 }}>
            <button
              className="btn"
              disabled={busy || !email.includes('@')}
              onClick={() => withConsent(() => void run(async (m) => (await m.sendMagicLink(email), 'Un lien vous a été envoyé. Ouvrez-le sur cet appareil, avec le même programme internet.')))}
            >
              Recevoir un lien de connexion
            </button>
            {!email.includes('@') && <p className="small muted" style={{ margin: 0 }}>Écrivez votre adresse e-mail pour continuer.</p>}
          </div>
        </>
      )}
      {msg?.error && <ErrorNote error={msg.error} />}
      {msg?.text && (
        <p role="status" style={{ marginTop: 8 }}>
          ✓ {msg.text}
        </p>
      )}
      {pulling && (
        <ConfirmModal
          title="Reprendre la copie en ligne ?"
          confirmLabel="Remplacer par la copie en ligne"
          photosNote={hasPhotos}
          onBackup={() => exportCurrentState('permajardin-avant-reprise', false)}
          onCancel={() => setPulling(false)}
          onConfirm={() => {
            setPulling(false)
            void pull()
          }}
        >
          <p>Les jardins et plantes de cet appareil seront remplacés par ceux de la copie en ligne. Cela ne peut pas être annulé.</p>
        </ConfirmModal>
      )}
      {asking && (
        <ConsentDialog
          id="sync"
          onAccept={() => {
            const action = asking
            setAsking(undefined)
            action()
            autoSyncReconcile()
          }}
          onRefuse={() => setAsking(undefined)}
        />
      )}
    </Fold>
  )
}

function ReadingCard() {
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [size, setSizeState] = useState<TextSize>(getTextSize())
  const [saved, flash] = useFlash()
  return (
    <div className="card">
      <h2>Lecture et apparence</h2>
      <div className="stack" style={{ gap: 14 }}>
        <div className="stack">
          <strong id="textsize-label">
            Taille du texte <SavedNote show={saved} />
          </strong>
          <Segmented
            label="Taille du texte"
            value={size}
            options={TEXT_SIZES.map((t) => ({ id: t, label: TEXT_SIZE_LABEL[t] }))}
            onChange={(t) => {
              setTextSize(t)
              setSizeState(t)
              flash()
            }}
          />
        </div>
        <div className="stack">
          <strong>Couleurs</strong>
          <Segmented
            label="Couleurs"
            value={theme}
            options={(Object.keys(THEME_LABEL) as Theme[]).map((t) => ({ id: t, label: THEME_LABEL[t] }))}
            onChange={(t) => {
              setTheme(t)
              setThemeState(t)
              flash()
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** Changer de jardin, en créer un autre. */
function GardensCard({ garden, adding, setAdding, addRef }: { garden: Garden; adding: boolean; setAdding: (v: boolean) => void; addRef: React.RefObject<HTMLDivElement> }) {
  const gardens = useStore((s) => s.gardens)
  return (
    <div className="card" ref={addRef}>
      <h2>Mes jardins</h2>
      <ul className="list garden-list">
        {gardens.map((g) => (
          <li key={g.id}>
            <button className="btn garden-pick" aria-pressed={g.id === garden.id} onClick={() => g.id !== garden.id && setActiveGarden(g.id)}>
              <span style={{ flex: 1, textAlign: 'left' }}>{g.name}</span>
              {g.id === garden.id && <span className="muted small">affiché</span>}
            </button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 10 }}>
        {adding ? (
          <GardenCreator onDone={() => setAdding(false)} />
        ) : (
          <button className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Nouveau jardin
          </button>
        )}
      </div>
    </div>
  )
}

/** Prochaine étape conseillée (ex-carte « Conseil » de l'accueil) et aide (ex-lien « Besoin d'aide ? »). */
function AdviceCard({ garden }: { garden: Garden }) {
  const progress = useProgress(garden)
  const [help, setHelp] = useState(false)
  const tip = progress.next
  return (
    <div className="card">
      <h2>Conseil et aide</h2>
      <div className="stack">
        {tip && (
          <div className="next-step">
            <span className="small">
              <span className="muted">Conseil :</span> <strong>{tip.label}</strong>
            </span>
            <StepButton step={tip} garden={garden} />
          </div>
        )}
        <button className="btn" aria-haspopup="dialog" onClick={() => setHelp(true)}>
          Besoin d’aide ?
        </button>
      </div>
      {help && <HelpSheet tab="accueil" onClose={() => setHelp(false)} />}
    </div>
  )
}

/** Visite guidée et partage de l'appli. */
function TourCard() {
  return (
    <Fold title="La visite">
      <p className="small muted">Le guide en 5 étapes : adresse, terrain, plantes, entretien, voisins.</p>
      <div className="stack">
        <button className="btn" onClick={restartOnboarding}>
          Revoir la visite
        </button>
        <InviteButton className="btn" label="Faire connaître l’appli" copyLabel="Copier le lien de l’appli" />
      </div>
    </Fold>
  )
}

export function SettingsPage({ garden }: { garden: Garden }) {
  const { newGarden } = useUi()
  const [adding, setAdding] = useState(!!newGarden)
  const addRef = useRef<HTMLDivElement>(null)

  // Demande d'ouverture depuis le sélecteur d'en-tête ou le menu.
  useEffect(() => {
    if (!newGarden) return
    setAdding(true)
    setUi({ newGarden: undefined })
    addRef.current?.scrollIntoView({ block: 'start' })
  }, [newGarden])

  return (
    <div className="page">
      <h1>Mon compte et réglages</h1>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 12 }}>
          <GardensCard garden={garden} adding={adding} setAdding={setAdding} addRef={addRef} />
          <Backup />
          <GardenInfo garden={garden} />
          <LidarCard garden={garden} />
          <ScanCard garden={garden} />
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <AdviceCard garden={garden} />
          <ReadingCard />
          <TourCard />
          <InstallCard />
          <Sync />
          <PrivacyCard />
          <Fold title="Sources et licences">
              <ul className="list small">
                <li>Photo aérienne, plan, cadastre, maisons voisines et relief : © IGN – Géoplateforme, Licence Ouverte 2.0. Arbres des environs : © IGN – LiDAR HD, Licence Ouverte 2.0.</li>
                <li>Météo et historique du climat : Open-Meteo (CC BY 4.0, usage non commercial).</li>
                <li>Identification des plantes : Pl@ntNet (500 identifications gratuites par jour, partagées entre tous).</li>
                <li>Fiches des plantes, calendriers et voisinages : base PermaJardin. Ces conseils restent indicatifs.</li>
                <li>Distances de plantation : article 671 du Code civil. Des règles locales peuvent s’appliquer.</li>
              </ul>
          </Fold>
        </div>
      </div>
      <footer className="legal-footer">
        <LegalLinks />
      </footer>
    </div>
  )
}
