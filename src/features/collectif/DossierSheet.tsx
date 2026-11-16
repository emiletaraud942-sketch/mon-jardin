import { createPortal } from 'react-dom'
import { SPECIES_BY_ID } from '../../data/species'
import { bilanAnnuel, compostStatus, GESTE_LABEL, GESTE_ORDER, GESTE_UNIT, HABITATS } from '../../engine/collectif'
import type { Garden, Plant } from '../../types'
import { planGeometry, plantRows } from './dossier'
import '../../styles/dossier.css'

const plantName = (p: Plant): string => p.customName || SPECIES_BY_ID[p.speciesId]?.nomCommun || 'Plante'
const num = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const dateFr = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** Pose `html[data-print-dossier]` le temps de l'impression : seul le dossier s'imprime (voir `dossier.css`). */
export function printDossier() {
  const root = document.documentElement
  root.setAttribute('data-print-dossier', '')
  const clear = () => {
    root.removeAttribute('data-print-dossier')
    window.removeEventListener('afterprint', clear)
  }
  window.addEventListener('afterprint', clear)
  window.print()
  setTimeout(clear, 60000)
}

/** Le dossier : caché à l'écran, seul visible à l'impression. Montée dans `body`, hors de l'appli. */
export function DossierSheet({ garden, plants, year, today }: { garden: Garden; plants: Plant[]; year: number; today: Date }) {
  const { rows, ordered } = plantRows(plants, plantName, garden.plots)
  const geo = planGeometry(garden, ordered)
  const bilan = bilanAnnuel(garden.gestes, year)
  const c = garden.collectif
  const stroke = Math.max(geo.width, geo.height) / 400
  const fs = Math.max(geo.width, geo.height) / 45
  return createPortal(
    <section className="print-dossier" aria-hidden="true">
      <h1>Dossier du jardin : {garden.name}</h1>
      <p className="pd-sub">Préparé le {today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} avec PermaJardin.</p>

      <h2>Qui s’en occupe</h2>
      <ul className="pd-list">
        <li>Personne qui coordonne : {c?.coordinateur || 'à compléter'}</li>
        {c?.association && <li>Association ou groupe : {c.association}</li>}
        <li>Charte du jardin collectif affichée : {c?.charteAt ? `oui, le ${dateFr(c.charteAt)}` : 'à compléter'}</li>
        {garden.address && <li>Adresse du jardin : {garden.address}</li>}
        {garden.areaM2 ? <li>Surface de la parcelle : environ {num(garden.areaM2)} m²</li> : null}
        {garden.parcelRefs && garden.parcelRefs.length > 0 && <li>Références cadastrales : {garden.parcelRefs.join(', ')}</li>}
      </ul>

      <h2>Plan du jardin</h2>
      <svg className="pd-plan" viewBox={geo.viewBox} role="img" aria-label="Plan du jardin vu du dessus, nord en haut" preserveAspectRatio="xMidYMid meet">
        {geo.parcel && <path d={geo.parcel} fill="none" stroke="#000" strokeWidth={stroke * 2} strokeDasharray={`${stroke * 8} ${stroke * 4}`} />}
        {geo.buildings.map((d, i) => (
          <path key={i} d={d} fill="#ddd" stroke="#000" strokeWidth={stroke} />
        ))}
        {geo.plots.map((q) => (
          <g key={q.n}>
            <rect x={q.x} y={q.y} width={q.w} height={q.h} fill="none" stroke="#000" strokeWidth={stroke} />
            <text x={q.x + q.w / 2} y={q.y + q.h / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" className="pd-bold">
              P{q.n}
            </text>
          </g>
        ))}
        {geo.plants.map((p) => (
          <g key={p.n}>
            <circle cx={p.cx} cy={p.cy} r={fs * 0.55} fill="#fff" stroke="#000" strokeWidth={stroke} />
            <text x={p.cx} y={p.cy} fontSize={fs * 0.7} textAnchor="middle" dominantBaseline="central">
              {p.n}
            </text>
          </g>
        ))}
        <g>
          <line x1={geo.scale.x} y1={geo.scale.y} x2={geo.scale.x + geo.scale.meters} y2={geo.scale.y} stroke="#000" strokeWidth={stroke * 3} />
          <text x={geo.scale.x} y={geo.scale.y - fs * 0.4} fontSize={fs * 0.8}>
            {geo.scale.meters} m
          </text>
        </g>
        <text x={geo.minX + geo.width - fs * 2.4} y={geo.minY + fs * 1.4} fontSize={fs * 1.2} className="pd-bold">
          N ↑
        </text>
      </svg>
      <p className="pd-note">
        Plan dessiné par l’appli d’après le cadastre en ligne : il est indicatif et ne remplace ni un bornage ni le plan cadastré officiel (cadastre.gouv.fr), à joindre au dossier si on vous le demande.
        {plants.length > geo.plants.length ? ` Seules les ${geo.plants.length} premières plantes sont numérotées sur le plan.` : ''}
      </p>

      {garden.plots && garden.plots.length > 0 && (
        <>
          <h2>Parcelles</h2>
          <table className="pd-table">
            <thead>
              <tr>
                <th>Parcelle</th>
                <th>Cultivée par</th>
                <th>Taille</th>
              </tr>
            </thead>
            <tbody>
              {garden.plots.map((q) => (
                <tr key={q.id}>
                  <td>P{q.n}</td>
                  <td>{q.holder || '—'}</td>
                  <td>
                    {num(q.w)} × {num(q.h)} m
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Plantes ({rows.length})</h2>
      {rows.length === 0 ? (
        <p>Aucune plante pour l’instant.</p>
      ) : (
        <table className="pd-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Plante</th>
              <th>Parcelle</th>
              <th>Plantée le</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n}>
                <td>{r.n <= geo.plants.length ? r.n : '—'}</td>
                <td>{r.name}</td>
                <td>{r.plot ? `P${r.plot}${r.holder ? ` (${r.holder})` : ''}` : '—'}</td>
                <td>{dateFr(r.planted) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Bilan {year}</h2>
      {bilan.nombre === 0 ? (
        <p>Aucun geste noté pour {year}.</p>
      ) : (
        <table className="pd-table">
          <tbody>
            {GESTE_ORDER.map((t) => (
              <tr key={t}>
                <td>{GESTE_LABEL[t]}</td>
                <td>
                  {num(bilan.parType[t])} {GESTE_UNIT[t]}
                </td>
              </tr>
            ))}
            <tr className="pd-total">
              <td>Déchets végétaux évités ou réemployés</td>
              <td>{num(bilan.dechetsEvitesKg)} kg</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="pd-note">Quantités notées à la main par les jardiniers : ce sont des estimations.</p>

      {garden.composteurs && garden.composteurs.length > 0 && (
        <>
          <h2>Composteurs</h2>
          <ul className="pd-list">
            {garden.composteurs.map((k) => (
              <li key={k.id}>
                {k.nom} : démarré le {dateFr(k.debut)}
                {k.retourne ? `, retourné le ${dateFr(k.retourne)}` : ''}. {compostStatus(k, today).text}
              </li>
            ))}
          </ul>
        </>
      )}

      {garden.habitats && garden.habitats.length > 0 && (
        <>
          <h2>Pour la biodiversité</h2>
          <ul className="pd-list">
            {HABITATS.filter((h) => garden.habitats!.includes(h.id)).map((h) => (
              <li key={h.id}>{h.label}</li>
            ))}
          </ul>
        </>
      )}
      <p className="pd-footer">Document préparé à partir de données saisies par des personnes : à relire avant de le déposer.</p>
    </section>,
    document.body,
  )
}
