import { RISQUE_LABEL } from '../data/labels'
import type { RisqueType, Species } from '../types'

/** Types de risque d'une espèce, sans doublon, le plus grave (toxique) d'abord. */
export function riskTypes(s: Pick<Species, 'avertissements'>): RisqueType[] {
  const order: RisqueType[] = ['toxique', 'envahissante', 'epineuse', 'allergene', 'irritante']
  const present = new Set((s.avertissements ?? []).map((a) => a.type))
  return order.filter((t) => present.has(t))
}

/** Pastilles de risque (« Toxique », « Envahissante »…), rien si la fiche n'en signale aucun. */
export function RiskBadges({ species }: { species: Pick<Species, 'avertissements'> }) {
  const types = riskTypes(species)
  if (types.length === 0) return null
  return (
    <span className="risk-badges">
      {types.map((t) => (
        <span key={t} className={`badge ${t === 'toxique' ? 'danger' : 'warn'}`}>
          {RISQUE_LABEL[t]}
        </span>
      ))}
    </span>
  )
}

/** Bloc « À savoir avant de planter » : chaque risque avec son texte. Rien si la fiche n'en signale aucun. */
export function RiskNotes({ species }: { species: Pick<Species, 'avertissements'> }) {
  const list = species.avertissements ?? []
  if (list.length === 0) return null
  return (
    <section className="risk-notes" aria-label="À savoir avant de planter">
      <h3>À savoir avant de planter</h3>
      <ul className="list small">
        {list.map((a, i) => (
          <li key={i}>
            <span className={`badge ${a.type === 'toxique' ? 'danger' : 'warn'}`}>{RISQUE_LABEL[a.type]}</span> {a.texte}
          </li>
        ))}
      </ul>
    </section>
  )
}
