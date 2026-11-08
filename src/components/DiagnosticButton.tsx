import { useState } from 'react'
import { APP_COMMIT, APP_VERSION } from '../lib/appVersion'
import { downloadJson } from '../lib/backup'
import { isoDate } from '../lib/dates'
import { buildDiagnostic, getErrors } from '../lib/diagnostics'
import { STATE_VERSION } from '../lib/migrate'
import { getState } from '../lib/store'
import { getTextSize } from '../lib/textSize'
import { getTheme } from '../lib/theme'
import { Icon } from './Icon'

const mo = (n: number) => Math.round((n / (1024 * 1024)) * 10) / 10

/** « Exporter un diagnostic » : fichier local avec les dernières erreurs. Rien n'est envoyé, aucune donnée personnelle. */
export function DiagnosticButton({ className = 'btn' }: { className?: string }) {
  const [msg, setMsg] = useState('')
  async function run() {
    setMsg('')
    try {
      let storage: { usedMo: number; quotaMo: number; persistent?: boolean } | undefined
      try {
        const e = await navigator.storage?.estimate?.()
        const persistent = await navigator.storage?.persisted?.()
        if (e?.quota !== undefined && e.usage !== undefined) storage = { usedMo: mo(e.usage), quotaMo: mo(e.quota), persistent }
      } catch {
        /* estimation indisponible */
      }
      const s = getState()
      const report = buildDiagnostic({
        now: new Date(),
        userAgent: navigator.userAgent,
        language: navigator.language,
        online: navigator.onLine,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
        appVersion: APP_VERSION,
        appCommit: APP_COMMIT,
        stateVersion: STATE_VERSION,
        counts: { jardins: s.gardens.length, plantes: s.plants.length, tachesFaites: s.tasksDone.length },
        storage,
        theme: getTheme(),
        textSize: getTextSize(),
      })
      downloadJson(JSON.stringify(report, null, 2), `permajardin-diagnostic-${isoDate()}.json`)
      const n = getErrors().length
      setMsg(`Fichier téléchargé. ${n === 0 ? 'Aucune erreur notée.' : `${n} erreur${n > 1 ? 's' : ''} notée${n > 1 ? 's' : ''}.`} Rien n’a été envoyé.`)
    } catch {
      setMsg('Le fichier n’a pas pu être créé.')
    }
  }
  return (
    <>
      <button className={className} onClick={() => void run()}>
        <Icon name="download" /> Exporter un rapport d’erreurs
      </button>
      <p className="small muted" style={{ margin: 0 }}>Un fichier sur cet appareil : version, écran, dernières erreurs. Ni nom, ni adresse, ni photo.</p>
      {msg && (
        <p className="small" role="status" style={{ margin: 0 }}>
          {msg}
        </p>
      )}
    </>
  )
}
