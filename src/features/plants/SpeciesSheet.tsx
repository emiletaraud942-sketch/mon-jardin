import { SPECIES_BY_ID } from '../../data/species'
import { CATEGORY_LABEL, STRATE_LABEL, SUN_LABEL, TASK_ICON, TASK_LABEL, WATER_LABEL } from '../../data/labels'
import { Icon } from '../../components/Icon'
import { MonthGrid } from '../../components/MonthGrid'
import { MONTH_NAMES, plantingCalendar } from '../../engine/calendar'
import { openSpecies, startPlacing } from '../../lib/ui'
import type { Garden, Species, TaskCondition } from '../../types'
import '../../styles/novice-pages.css'

const CONDITION_LABEL: Record<TaskCondition, string> = {
  'hors-gel': 'hors gel',
  'apres-pluie': 'après une pluie',
  'temps-sec': 'par temps sec',
  chaleur: 'par forte chaleur',
  'apres-recolte': 'après la récolte',
}

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function monthsLabel(ms: number[]): string {
  if (ms.length === 12) return "toute l'année"
  if (ms.length === 1) return MONTH_NAMES[ms[0] - 1]
  return ms.map((m) => MONTH_SHORT[m - 1]).join(', ')
}

function SpeciesLinks({ ids }: { ids: string[] }) {
  return (
    <span className="row" style={{ gap: 4, display: 'inline-flex' }}>
      {ids.map((id) =>
        SPECIES_BY_ID[id] ? (
          <button key={id} className="btn small ghost" onClick={() => openSpecies(id)}>
            {SPECIES_BY_ID[id].nomCommun}
          </button>
        ) : null,
      )}
    </span>
  )
}

export function SpeciesSheet({ species: s, garden }: { species: Species; garden: Garden }) {
  const cal = plantingCalendar(s, garden)
  return (
    <div className="stack plants-ui" style={{ gap: 14 }}>
      <div>
        <h2 style={{ marginBottom: 2 }}>{s.nomCommun}</h2>
        <div className="muted small">
          <i>{s.nomLatin}</i> · {s.famille}
        </div>
        <dl className="np-facts" style={{ marginTop: 10 }}>
          <dt>Aime</dt>
          <dd>{s.soleil.map((x) => SUN_LABEL[x]).join(' ou ')}</dd>
          <dt>Arrosage</dt>
          <dd>{WATER_LABEL[s.eau]}</dd>
          <dt>Froid supporté</dt>
          <dd>jusqu’à {s.rusticiteC.toLocaleString('fr-FR')} °C</dd>
          <dt>Type</dt>
          <dd>
            {CATEGORY_LABEL[s.categorie]} · {STRATE_LABEL[s.strate]} · {s.vivace ? 'revient chaque année' : 'à semer chaque année'}
          </dd>
        </dl>
        <ul className="list small" style={{ marginTop: 8 }}>
          {s.fixateurAzote && (
            <li>
              <strong>Fixe l’azote</strong> : elle nourrit le sol, ses voisines en profitent.
            </li>
          )}
          {s.mellifere && (
            <li>
              <strong>Mellifère</strong> : ses fleurs nourrissent les abeilles.
            </li>
          )}
          {s.comestible && (
            <li>
              <strong>Comestible</strong>
              {s.partiesComestibles?.length ? ` : ${s.partiesComestibles.join(', ')}` : ''}.
            </li>
          )}
        </ul>
      </div>

      <div>
        <h3>Quand semer, planter, récolter chez vous</h3>
        <MonthGrid
          rows={[
            { label: 'Semis à l’abri', months: cal.semisAbri, kind: 'abri' },
            { label: 'Semis en pleine terre', months: cal.semisPleineTerre },
            { label: 'Plantation', months: cal.plantation, kind: 'plant' },
            { label: 'Récolte', months: cal.recolte, kind: 'harvest' },
          ]}
        />
        {cal.note && <p className="small muted" style={{ marginTop: 6 }}>{cal.note}</p>}
      </div>

      <details className="np-details">
        <summary>Détails</summary>
        <div className="stack" style={{ gap: 14 }}>
      <p className="small" style={{ margin: 0 }}>
        Adulte : {s.hauteurAdulteM.toLocaleString('fr-FR')} m de haut et {s.envergureAdulteM.toLocaleString('fr-FR')} m de large
        {s.vivace && s.anneesMaturite > 1 ? `, en ${s.anneesMaturite} ans environ` : ''}. Distance entre deux pieds : {s.espacementCm >= 100 ? `${(s.espacementCm / 100).toLocaleString('fr-FR')} m` : `${s.espacementCm} cm`}.
        {s.solPrefere?.length ? ` Sol : ${s.solPrefere.join(', ')}` : ''}
        {s.ph ? ` (pH ${s.ph[0]}–${s.ph[1]})` : ''}.
      </p>

      <div>
        <h3>Comment l’entretenir</h3>
        <p>{s.entretien}</p>
        <ul className="list small">
          {s.taches.map((t, i) => (
            <li key={i}>
              <strong>
                {TASK_ICON[t.type]} {TASK_LABEL[t.type]}
              </strong>{' '}
              <span className="muted">
                — {monthsLabel(t.months)}
                {t.condition ? `, ${CONDITION_LABEL[t.condition]}` : ''}
                {t.frequencyDays ? `, tous les ${t.frequencyDays} jours` : ''}
                {t.minAgeYears ? `, dès ${t.minAgeYears} an${t.minAgeYears > 1 ? 's' : ''}` : ''}
              </span>
              <div>{t.howTo}</div>
              {t.tool && <div className="muted">Outil : {t.tool}</div>}
            </li>
          ))}
        </ul>
      </div>

      {(s.compagnons.length > 0 || s.antagonistes.length > 0 || s.fonctions?.length) && (
        <div className="small">
          <h3>Voisinage</h3>
          {s.fonctions?.length ? <p>À quoi elle sert : {s.fonctions.join(', ')}.</p> : null}
          {s.compagnons.length > 0 && (
            <p>
              <strong>Bonnes plantes voisines :</strong> <SpeciesLinks ids={s.compagnons} />
            </p>
          )}
          {s.antagonistes.length > 0 && (
            <p>
              <span className="badge danger">À éloigner</span> <SpeciesLinks ids={s.antagonistes} />
            </p>
          )}
        </div>
      )}

        </div>
      </details>

      <button className="btn primary place-btn" style={{ minHeight: 44 }} onClick={() => startPlacing(s.id)}>
        <Icon name="pin" /> Placer dans mon jardin
      </button>
    </div>
  )
}
