import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { CONSEIL_THEMES, CONSEILS, getConseil, type Conseil, type ConseilTheme } from '../../data/conseils'
import { SPECIES_BY_ID } from '../../data/species'
import { MONTH_NAMES } from '../../engine/calendar'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { conseilsOpen } from '../../lib/overlays'
import { openSpecies, useBackLayer } from '../../lib/ui'
import { RUN_DELAY_MS } from '../aide/ToutFaire'
import { monthsText } from '../ravageurs/filter'
import { ConseilIcon } from './ConseilIcon'
import { countByTheme, filterConseils, NO_FILTER, servesMonth, THEME_LABEL, type ConseilFilter } from './filter'
import '../../styles/novice-pages.css'
import '../../styles/ennuis.css'
import '../../styles/conseils.css'

export const CONSEILS_TITLE = 'Conseils compost et économie d’eau'

/** Vrai tant qu'un jardinier n'a pas relu les fiches (voir docs/RELECTURE-CONSEILS.md) : la mention s'affiche. */
export const A_RELIRE = true
export const NOTE_CONTENU = A_RELIRE ? 'Conseils généraux, sans produit chimique de synthèse. Contenu à relire par un jardinier.' : 'Conseils généraux, sans produit chimique de synthèse.'

const close = () => conseilsOpen.set(undefined)

/** Un calque de Retour par écran : fermé puis rouvert dans le même tour, il réutilise son entrée d'historique. */
function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Ferme les conseils, puis ouvre la fiche de la plante (le Retour d'Android a fini de retirer son entrée). */
function goToSpecies(id: string) {
  close()
  window.setTimeout(() => openSpecies(id), RUN_DELAY_MS)
}

/** La fiche d'un conseil : résumé, étape par étape, astuces, attention, plantes citées. */
export function ConseilSheet({ c, onSpecies }: { c: Conseil; onSpecies: (id: string) => void }) {
  // Un identifiant inconnu du catalogue n'est jamais proposé.
  const plants = (c.planteIds ?? []).filter((id) => SPECIES_BY_ID[id])
  const h = (k: string) => `conseil-${c.id}-${k}`
  return (
    <article className="ennui-sheet conseil-sheet" data-conseil={c.id}>
      <p className="ennui-type">
        <ConseilIcon theme={c.theme} size={22} /> {THEME_LABEL[c.theme]}
      </p>
      <p className="conseil-resume">{c.resume}</p>
      {c.mois && c.mois.length > 0 && <p className="small muted">Surtout {monthsText(c.mois)}.</p>}
      <section aria-labelledby={h('etapes')}>
        <h2 id={h('etapes')}>Étape par étape</h2>
        <ol className="conseil-steps">
          {c.etapes.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </section>
      {c.astuces && c.astuces.length > 0 && (
        <section aria-labelledby={h('astuces')}>
          <h2 id={h('astuces')}>Astuces</h2>
          <ul className="ennui-lines">
            {c.astuces.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      {c.attention && (
        <aside className="ennui-warn" role="note">
          <Icon name="alert" size={22} />
          <div>
            <strong>Attention</strong>
            <p>{c.attention}</p>
          </div>
        </aside>
      )}
      {plants.length > 0 && (
        <section aria-labelledby={h('plantes')}>
          <h2 id={h('plantes')}>Plantes citées</h2>
          <ul className="ennui-chips">
            {plants.map((id) => (
              <li key={id}>
                <button className="btn chip-filter ennui-chip" onClick={() => onSpecies(id)}>
                  {SPECIES_BY_ID[id].nomCommun}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="small muted ennui-source">Source : {c.source}.</p>
      <p className="small muted">{NOTE_CONTENU}</p>
    </article>
  )
}

/** Conseils « compost » et « économiser l'eau » : une liste qu'on cherche par un mot, et une fiche par conseil. */
export default function ConseilsScreen({ initialId }: { initialId?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [f, setF] = useState<ConseilFilter>(NO_FILTER)
  const [openId, setOpenId] = useState<string | undefined>(() => (initialId && getConseil(initialId) ? initialId : undefined))
  const month = new Date().getMonth() + 1
  const list = useMemo(() => filterConseils(CONSEILS, f, { month }), [f, month])
  const counts = useMemo(() => countByTheme(CONSEILS), [])
  const current = openId ? getConseil(openId) : undefined
  const filtered = f.themes.length > 0 || f.thisMonth
  const set = (patch: Partial<ConseilFilter>) => setF((x) => ({ ...x, ...patch }))
  const toggleTheme = (t: ConseilTheme) => set({ themes: f.themes.includes(t) ? f.themes.filter((x) => x !== t) : [...f.themes, t] })

  const back = () => (current ? setOpenId(undefined) : close())
  const backRef = useRef(back)
  backRef.current = back
  useInertBehind(true)
  const sheetRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    if (current) sheetRef.current?.scrollTo?.({ top: 0 })
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={ref} className="tf-overlay ennuis conseils" role="dialog" aria-modal="true" aria-label={current ? current.titre : CONSEILS_TITLE} data-feat="conseils" tabIndex={-1}>
      <Layer key={openId ?? 'liste'} onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={back}>
          <Icon name="back" size={18} /> {current ? 'Retour à la liste' : 'Retour'}
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{current ? current.titre : CONSEILS_TITLE}</h1>
      </header>

      <div className="tf-body ennui-body" hidden={!!current}>
        <div className="conseil-tiles" role="group" aria-label="Sujet">
          <button className={'conseil-tile conseil-tile-all' + (f.themes.length === 0 ? ' on' : '')} aria-pressed={f.themes.length === 0} onClick={() => set({ themes: [] })}>
            <span className="conseil-tile-icon">
              <Icon name="list" size={24} />
            </span>
            <strong>
              {f.themes.length === 0 && <Icon name="check" size={16} />} Tout
            </strong>
            <span>{CONSEILS.length} fiches</span>
          </button>
          {CONSEIL_THEMES.map((t) => (
            <button key={t.id} className={'conseil-tile conseil-tile-' + t.id + (f.themes.includes(t.id) ? ' on' : '')} aria-pressed={f.themes.includes(t.id)} onClick={() => toggleTheme(t.id)}>
              <span className="conseil-tile-icon">
                <ConseilIcon theme={t.id} />
              </span>
              <strong>
                {f.themes.includes(t.id) && <Icon name="check" size={16} />} {t.libelle}
              </strong>
              <span>{counts[t.id]} fiches</span>
            </button>
          ))}
        </div>
        <label className="ennui-ask" htmlFor="conseil-q">
          Chercher un mot : paillage, épluchures, pluie, arroser…
        </label>
        <div className="tf-search ennui-search">
          <Icon name="search" size={20} />
          <input
            id="conseil-q"
            className="input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Un mot ou un sujet"
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
          />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={f.thisMonth} onChange={(e) => set({ thisMonth: e.target.checked })} />
          <span>Seulement ce qui concerne ce mois-ci ({MONTH_NAMES[month - 1]})</span>
        </label>
        <p className="small muted ennui-count" role="status" aria-live="polite">
          {list.length === 0 ? '' : `${list.length} fiche${list.length > 1 ? 's' : ''}.`}
        </p>
        {list.length === 0 ? (
          <div className="ennui-none" role="status">
            <p>Rien ne correspond : essayez un autre mot.</p>
            {(filtered || f.query.trim() !== '') && (
              <button className="btn" onClick={() => setF(NO_FILTER)}>
                Tout effacer
              </button>
            )}
          </div>
        ) : (
          <ul className="ennui-list">
            {list.map((c) => (
              <li key={c.id}>
                <button className="ennui-row" data-conseil-id={c.id} onClick={() => setOpenId(c.id)}>
                  <span className={'ennui-row-icon conseil-icon-' + c.theme}>
                    <ConseilIcon theme={c.theme} />
                  </span>
                  <span className="ennui-row-text">
                    <strong>{c.titre}</strong>
                    <span>
                      {THEME_LABEL[c.theme]}
                      {c.mois && servesMonth(c, month) ? ' · à faire ce mois-ci' : ''}
                    </span>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted ennui-note">{NOTE_CONTENU}</p>
      </div>

      {current && (
        <div className="tf-body ennui-body ennui-read" ref={sheetRef}>
          <ConseilSheet c={current} onSpecies={goToSpecies} />
          <button className="btn ennui-back" onClick={() => setOpenId(undefined)}>
            <Icon name="back" size={18} /> Retour à la liste
          </button>
        </div>
      )}
    </div>
  )
}
