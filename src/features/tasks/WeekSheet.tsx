import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { SPECIES_BY_ID } from '../../data/species'
import { canShareText, copyText, shareOrCopy } from '../../lib/shareText'
import { showToast } from '../../lib/toast'
import type { Garden, GeneratedTask, Plant } from '../../types'
import { buildWeekSheet, weekSheetText } from './weekSheet'
import '../../styles/print.css'

const speciesName = (id: string) => SPECIES_BY_ID[id]?.nomCommun

/** Pose `html[data-print-week]` le temps de l'impression : seul « Ma semaine » s'imprime (voir `print.css`). */
export function printWeek() {
  const root = document.documentElement
  root.setAttribute('data-print-week', '')
  const clear = () => {
    root.removeAttribute('data-print-week')
    window.removeEventListener('afterprint', clear)
  }
  window.addEventListener('afterprint', clear)
  window.print()
  // Certains navigateurs ne signalent pas la fin : on nettoie aussi après un délai.
  setTimeout(clear, 60000)
}

/** La feuille « Ma semaine » : cachée à l'écran, seule visible à l'impression. Montée dans `body`, hors de l'appli. */
export function WeekPrintSheet({ garden, tasks, plants, now }: { garden: Garden; tasks: GeneratedTask[]; plants: Plant[]; now: Date }) {
  const sheet = useMemo(() => buildWeekSheet({ tasks, plants, speciesName, gardenName: garden.name, now }), [tasks, plants, garden.name, now])
  return createPortal(
    <section className="print-week" aria-hidden="true">
      <h1>{sheet.title}</h1>
      <p className="pw-range">{sheet.range}</p>
      {sheet.empty && <p>Rien à faire cette semaine : profitez du jardin.</p>}
      {sheet.groups.map((g) => (
        <div key={g.id} className="pw-group">
          <h2>
            {g.title} ({g.rows.length})
          </h2>
          <ul>
            {g.rows.map((r, i) => (
              <li key={i}>
                <span className="pw-box" />
                <span className="pw-text">
                  <strong>{r.title}</strong>
                  {r.plants && <span>Plantes : {r.plants}</span>}
                  {r.reason && <span>{r.reason}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="pw-footer">{sheet.footer}</p>
    </section>,
    document.body,
  )
}

/** « Imprimer ma semaine » et « Partager ma semaine » (même partage que la liste de courses). */
export function WeekActions({ garden, tasks, plants }: { garden: Garden; tasks: GeneratedTask[]; plants: Plant[] }) {
  const [now] = useState(() => new Date())
  const sheet = useMemo(() => buildWeekSheet({ tasks, plants, speciesName, gardenName: garden.name, now }), [tasks, plants, garden.name, now])
  const [manual, setManual] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const share = canShareText()
  const text = weekSheetText(sheet)
  useEffect(() => {
    if (manual) field.current?.select()
  }, [manual])

  async function go() {
    const r = share ? await shareOrCopy(text, sheet.title) : await copyText(text)
    if (r === 'copied') showToast({ message: 'Semaine copiée. Collez-la dans vos notes ou un message.' })
    if (r === 'manual') setManual(true)
  }

  return (
    <div className="afaire-print">
      <WeekPrintSheet garden={garden} tasks={tasks} plants={plants} now={now} />
      <div className="row">
        <button type="button" className="btn" data-feat="imprimer-semaine" disabled={sheet.empty} onClick={printWeek}>
          <Icon name="download" /> Imprimer ma semaine
        </button>
        <button type="button" className="btn" data-feat="partager-semaine" disabled={sheet.empty} onClick={() => void go()}>
          <Icon name="users" /> {share ? 'Partager ma semaine' : 'Copier ma semaine'}
        </button>
      </div>
      {sheet.empty && <p className="small muted">Rien à imprimer pour l’instant.</p>}
      {manual && <textarea ref={field} className="input" readOnly rows={6} value={text} aria-label="Semaine à copier" onFocus={(e) => e.currentTarget.select()} />}
    </div>
  )
}
