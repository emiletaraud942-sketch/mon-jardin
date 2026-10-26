import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { SyncConflictError } from '../../lib/sync'
import { ConfirmModal } from '../../components/ConfirmModal'
import { ErrorNote } from '../../components/ErrorNote'
import { Icon } from '../../components/Icon'
import { Segmented } from '../../components/Segmented'
import { SavedNote, useFlash } from '../../components/useFlash'
import { exportCurrentState, lastExportAt, REMIND_EVERY_DAYS } from '../../lib/backup'
import { formatDay, frNumber } from '../../lib/format'
import { friendlyError, type FriendlyError } from '../../lib/http'
import { deletePhoto } from '../../lib/photos'
import { getLoadWarnings, getState, replaceData, setState, updateGarden, useGardenPlants, useStorageStatus, useStore } from '../../lib/store'
import { type StateData } from '../../lib/migrate'
import { readBackupFile } from '../../lib/security/import'
import { getTheme, setTheme, THEME_LABEL, type Theme } from '../../lib/theme'
import { getTextSize, setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, type TextSize } from '../../lib/textSize'
import { showToast } from '../../lib/toast'
import { setUi, useUi } from '../../lib/ui'
import { doyToLabel } from '../../lib/weather'
import type { Garden, SoilTexture } from '../../types'
import { GardenCreator } from './GardenCreator'
import { GardenDataBanner } from './GardenDataBanner'
import { InstallCard } from '../../components/InstallButton'
import { PrivacyCard } from './PrivacyCard'
import { hasConsent } from '../../lib/consent'
import { ConsentDialog } from '../legal/ConsentDialog'
import { LegalLinks } from '../legal/LegalLinks'
import { FAIL_HELP } from './createGarden'
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
    <div className="card">
      <h2>Mon jardin</h2>
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
    </div>
  )
}

interface PendingImport {
  data: StateData
  warnings: string[]
  fileName: string
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
        replaceData(pending.data)
        onDone(`Sauvegarde reprise : ${describeCounts(countOf(pending.data))}.`)
      }}
    >
      <p>
        <strong>{importQuestion(countOf(current), countOf(pending.data))}</strong>
      </p>
      <p className="small muted">Fichier : {pending.fileName}</p>
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

function Backup() {
  const [msg, setMsg] = useState<{ text?: string; error?: FriendlyError }>()
  const [pending, setPending] = useState<PendingImport>()
  const { persistent } = useStorageStatus()
  const [last, setLast] = useState(lastExportAt())
  const overdue = !last || Date.now() - last > REMIND_EVERY_DAYS * 86400000
  const warnings = useRef(getLoadWarnings()).current

  function exportJson() {
    exportCurrentState()
    setLast(Date.now())
    setMsg({ text: 'Sauvegarde faite. Le fichier est dans vos téléchargements.' })
    showToast({ message: 'Sauvegarde faite. Le fichier est dans vos téléchargements.' })
  }

  async function importJson(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = '' // permet de reprendre le même fichier
    if (!file) return
    setMsg(undefined)
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
      <p>
        La sauvegarde est un fichier. Il est enregistré dans les « Téléchargements » de cet appareil. Gardez-le en lieu sûr : sur un ordinateur, une clé USB, ou envoyé à
        vous-même par e-mail.
      </p>
      <p className="small muted">Les photos ne sont pas dans la sauvegarde. Elles restent seulement sur cet appareil.</p>
      <p className={overdue ? 'warn-text' : 'muted'}>
        {last ? `Dernière sauvegarde : ${formatDay(last, { year: true })}.` : 'Vous n’avez pas encore fait de sauvegarde.'}
        {overdue && ' Pensez à en faire une.'}
      </p>
      {persistent === false && <p className="small muted">Si l’espace manque, cet appareil peut effacer vos données. Une sauvegarde les protège.</p>}
      {warnings.length > 0 && <p className="alert small">Certaines données ont été corrigées au démarrage : {warnings.join(' ')}</p>}
      <div className="row">
        <button className="btn primary" onClick={exportJson}>
          <Icon name="download" /> Faire une sauvegarde
        </button>
        <label className="btn file-btn">
          <Icon name="upload" /> Reprendre une sauvegarde
          <input className="sr-only" type="file" accept="application/json,.json" onChange={(e) => void importJson(e.target)} />
        </label>
      </div>
      {msg?.error && <ErrorNote error={msg.error} />}
      {msg?.text && (
        <p role="status" style={{ marginTop: 8 }}>
          ✓ {msg.text}
        </p>
      )}
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
      <div className="card">
        <h2>Retrouver mes jardins sur un autre appareil</h2>
        {msg?.error ? <ErrorNote error={msg.error} /> : <p className="muted"><span className="spinner" /> Chargement…</p>}
      </div>
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
      return 'Votre copie est en ligne.'
    })
  const pull = () =>
    run(async (m) => {
      setConflict(undefined)
      return (await m.pullSnapshot()) ? 'Votre copie en ligne est reprise sur cet appareil.' : 'Il n’y a pas encore de copie en ligne.'
    })
  const hasPhotos = getState().plants.some((p) => p.photos.length > 0)

  return (
    <div className="card">
      <h2>Retrouver mes jardins sur un autre appareil</h2>
      <p className="small muted">Vous mettez une copie de vos jardins en ligne, puis vous la reprenez sur un autre téléphone ou ordinateur. Les photos ne sont pas copiées.</p>
      {user ? (
        <>
          <p>Connecté : {user.email}</p>
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
          {conflict && (
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
                  Annuler
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
          }}
          onRefuse={() => setAsking(undefined)}
        />
      )}
    </div>
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
      <h1>Réglages et sauvegarde</h1>
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 12 }}>
          <Backup />
          <GardenInfo garden={garden} />
          <ScanCard garden={garden} />
          <div className="card" ref={addRef}>
            <h2>Ajouter un autre jardin</h2>
            {adding ? (
              <GardenCreator onDone={() => setAdding(false)} />
            ) : (
              <button className="btn" onClick={() => setAdding(true)}>
                <Icon name="plus" /> Nouveau jardin
              </button>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <ReadingCard />
          <InstallCard />
          <Sync />
          <PrivacyCard />
          <div className="card">
            <details>
              <summary>
                <h2 style={{ display: 'inline' }}>Sources et licences</h2>
              </summary>
              <ul className="list small">
                <li>Photo aérienne, plan, cadastre, maisons voisines et relief : © IGN – Géoplateforme, Licence Ouverte 2.0.</li>
                <li>Météo et historique du climat : Open-Meteo (CC BY 4.0, usage non commercial).</li>
                <li>Identification des plantes : Pl@ntNet (500 identifications gratuites par jour, partagées entre tous).</li>
                <li>Fiches des plantes, calendriers et voisinages : base PermaJardin. Ces conseils restent indicatifs.</li>
                <li>Distances de plantation : article 671 du Code civil. Des règles locales peuvent s’appliquer.</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
      <footer className="legal-footer">
        <LegalLinks />
      </footer>
    </div>
  )
}
