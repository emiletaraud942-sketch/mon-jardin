import type { Month } from '../types'
import { monthsPhrase } from '../lib/monthPhrase'
import '../styles/novice-pages.css'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

type Kind = NonNullable<MonthRow['kind']>

export interface MonthRow {
  label: string
  months?: Month[]
  kind?: 'abri' | 'plant' | 'harvest' | 'default'
}

const LEGEND: Record<Kind, string> = {
  abri: 'Semis à l’abri',
  default: 'Semis en pleine terre',
  plant: 'Plantation',
  harvest: 'Récolte',
}
/** Symbole en plus de la couleur : le calendrier se lit aussi en noir et blanc. */
export const SYMBOL: Record<Kind, string> = { abri: '▲', default: '◆', plant: '●', harvest: '■' }
const VERB: Record<Kind, string> = { abri: 'Semez à l’abri', default: 'Semez en pleine terre', plant: 'Plantez', harvest: 'Récoltez' }

export function MonthGrid({ rows }: { rows: MonthRow[] }) {
  const now = new Date().getMonth() + 1
  const visible = rows.filter((r) => r.months && r.months.length > 0)
  if (visible.length === 0) return null
  const kinds = Array.from(new Set(visible.map((r) => r.kind ?? 'default')))
  return (
    <>
      <ul className="list mg-summary" aria-label="Résumé du calendrier">
        {visible.map((r) => (
          <li key={r.label}>
            <strong>{VERB[r.kind ?? 'default']}</strong> {monthsPhrase(r.months!)}.
          </li>
        ))}
      </ul>
      <div className="mg-wrap">
        <table className="mg-table">
          <caption className="sr-only">Calendrier des mois</caption>
          <thead>
            <tr>
              {LETTERS.map((l, i) => (
                <th key={i} scope="col" className={i + 1 === now ? 'now' : undefined} aria-label={MONTHS[i] + (i + 1 === now ? ' (mois en cours)' : '')}>
                  <span aria-hidden>{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          {visible.map((r) => {
            const k = r.kind ?? 'default'
            return (
              <tbody key={r.label}>
                <tr>
                  <th scope="rowgroup" colSpan={12} className="mg-title">
                    {r.label}
                  </th>
                </tr>
                <tr>
                  {Array.from({ length: 12 }, (_, i) => {
                    const on = r.months!.includes((i + 1) as Month)
                    return (
                      <td key={i} className={(on ? 's-' + k : '') + (i + 1 === now ? ' now' : '')}>
                        {on && (
                          <>
                            <span aria-hidden>{SYMBOL[k]}</span>
                            <span className="sr-only">{MONTHS[i]} : oui</span>
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            )
          })}
        </table>
      </div>
      <ul className="legend small" aria-label="Légende du calendrier">
        {kinds.map((k) => (
          <li key={k}>
            <span className={`mg-sym s-${k}`} aria-hidden>
              {SYMBOL[k]}
            </span>{' '}
            {LEGEND[k]}
          </li>
        ))}
        <li>Cadre noir : mois en cours</li>
      </ul>
    </>
  )
}
