import { useId, useState } from 'react'
import { usePhotoUrl } from '../../components/PhotoThumb'
import { formatDay } from '../../lib/format'
import { agoText, defaultPair, spanText, type JournalEntry } from '../../lib/journal'
import '../../styles/journal.css'

/** Date en toutes lettres, ou « Date inconnue » (jamais inventée). */
export const dayLabel = (at?: string): string => (at ? formatDay(at, { year: true }) || 'Date inconnue' : 'Date inconnue')

/** Libellés des choix : la date, et un numéro seulement quand deux photos portent la même. */
export function optionLabels(entries: readonly JournalEntry[]): Map<string, string> {
  const base = entries.map((e) => dayLabel(e.at))
  const seen = new Map<string, number>()
  const total = new Map<string, number>()
  for (const b of base) total.set(b, (total.get(b) ?? 0) + 1)
  const out = new Map<string, string>()
  entries.forEach((e, i) => {
    const n = (seen.get(base[i]) ?? 0) + 1
    seen.set(base[i], n)
    out.set(e.id, (total.get(base[i]) ?? 0) > 1 ? `${base[i]} (photo ${n})` : base[i])
  })
  return out
}

function Layer({ id, className, style }: { id: string; className: string; style?: React.CSSProperties }) {
  const { url, missing } = usePhotoUrl(id)
  if (url) return <img className={className} src={url} alt="" style={style} />
  return missing ? (
    <span className={className + ' compare-missing'} style={style}>
      Photo introuvable sur cet appareil.
    </span>
  ) : null
}

/** Légende d'une photo : « 3 mars 2026 (il y a 8 mois) ». */
export function captionOf(entry: JournalEntry | undefined, today: string): string {
  if (!entry) return ''
  const ago = agoText(entry.at, today)
  return ago ? `${dayLabel(entry.at)} (${ago})` : dayLabel(entry.at)
}

/**
 * Avant / après : deux photos au choix (la plus ancienne et la plus récente d'abord), l'une sur l'autre, et un curseur
 * (champ natif : flèches, Début, Fin, glisser au doigt) qui déplace la coupure. Gauche = avant, droite = après.
 */
export function BeforeAfter({ entries, today }: { entries: readonly JournalEntry[]; today: string }) {
  const uid = useId()
  const pair = defaultPair(entries)
  const [pick, setPick] = useState<{ before?: string; after?: string }>({})
  const [cut, setCut] = useState(50)
  if (!pair) return null
  const has = (id?: string): id is string => !!id && entries.some((e) => e.id === id)
  const beforeId = has(pick.before) ? pick.before : pair.before
  const afterId = has(pick.after) ? pick.after : pair.after
  const before = entries.find((e) => e.id === beforeId)
  const after = entries.find((e) => e.id === afterId)
  const labels = optionLabels(entries)
  const span = spanText(before?.at, after?.at)

  return (
    <div className="compare" data-feat="avant-apres">
      <h4 className="compare-title">Avant / après</h4>
      <p className="small muted compare-help">Choisissez deux photos, puis glissez le curseur pour les comparer.</p>
      <div className="compare-pick">
        <label className="field">
          <span>Avant</span>
          <select className="input" value={beforeId} onChange={(e) => setPick({ ...pick, before: e.target.value })}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {labels.get(e.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Après</span>
          <select className="input" value={afterId} onChange={(e) => setPick({ ...pick, after: e.target.value })}>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {labels.get(e.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="compare-stage" role="img" aria-label={`Comparaison : avant, ${captionOf(before, today)} ; après, ${captionOf(after, today)}.`}>
        <Layer id={beforeId} className="compare-img" />
        <Layer id={afterId} className="compare-img compare-top" style={{ clipPath: `inset(0 0 0 ${cut}%)` }} />
        <span className="compare-line" style={{ left: `${cut}%` }} aria-hidden />
        <span className="compare-tag compare-tag-before" aria-hidden>
          Avant
        </span>
        <span className="compare-tag compare-tag-after" aria-hidden>
          Après
        </span>
      </div>
      <input
        className="compare-range"
        type="range"
        min={0}
        max={100}
        step={1}
        value={cut}
        aria-label="Curseur avant et après"
        aria-valuetext={`Coupure à ${cut} % : avant à gauche, après à droite`}
        id={uid + '-cut'}
        onChange={(e) => setCut(Number(e.target.value))}
      />
      <ul className="compare-captions small">
        <li>
          <strong>Avant :</strong> {captionOf(before, today)}
        </li>
        <li>
          <strong>Après :</strong> {captionOf(after, today)}
        </li>
      </ul>
      {beforeId === afterId ? <p className="small muted">C’est la même photo des deux côtés. Choisissez-en une autre.</p> : span && <p className="small compare-span">{span}</p>}
    </div>
  )
}
