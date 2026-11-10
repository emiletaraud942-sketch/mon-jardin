import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { getLecon, LECONS, NIVEAUX, leconsDuNiveau, type Lecon } from '../../data/lecons'
import { SPECIES_BY_ID } from '../../data/species'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { FEATURES } from '../../lib/features'
import { leconsOpen } from '../../lib/overlays'
import { openSpecies, useBackLayer } from '../../lib/ui'
import { RUN_DELAY_MS } from '../aide/ToutFaire'
import { monthsText } from '../ravageurs/filter'
import { LeconIcon } from './LeconIcon'
import { doneSentence, isDone, markDone, nextLesson, percentDone, unmarkDone } from './progress'
import { Quiz } from './Quiz'
import { useLessonsDone } from './useDone'
import '../../styles/novice-pages.css'
import '../../styles/ennuis.css'
import '../../styles/lecons.css'

export const LECONS_TITLE = 'Apprendre à jardiner'

/** Vrai tant qu'un jardinier ou un formateur n'a pas relu les leçons (voir docs/RELECTURE-LECONS.md) : la mention s'affiche. */
export const A_RELIRE = true
export const NOTE_CONTENU = A_RELIRE
  ? 'Conseils généraux, sans produit chimique de synthèse. Contenu à relire par un jardinier ou un formateur.'
  : 'Conseils généraux, sans produit chimique de synthèse.'

const close = () => leconsOpen.set(undefined)

/** Un calque de Retour par écran : fermé puis rouvert dans le même tour, il réutilise son entrée d'historique. */
function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Ferme les leçons, puis ouvre la fiche de la plante (le Retour d'Android a fini de retirer son entrée). */
function goToSpecies(id: string) {
  close()
  window.setTimeout(() => openSpecies(id), RUN_DELAY_MS)
}

/** « Essayez dans votre jardin » : ferme les leçons d'abord (jamais deux calques), puis lance la vraie fonction du registre. */
export function tryFeature(id: string) {
  const f = FEATURES.find((x) => x.id === id)
  if (!f) return
  close()
  window.setTimeout(() => f.run(), RUN_DELAY_MS)
}

const minutesText = (l: Lecon) => `${l.minutes} min`

/** Le mot « Terminée » avec son icône (jamais la couleur seule). */
function DoneMark() {
  return (
    <span className="lecon-done">
      <Icon name="check" size={16} /> Terminée
    </span>
  )
}

/** La fiche d'une leçon : objectif, points, attention, plantes, essai, quiz, coche, suite. */
export function LeconSheet({
  l,
  done,
  onToggleDone,
  onOpen,
  onSpecies,
  onTry,
}: {
  l: Lecon
  done: boolean
  onToggleDone: () => void
  onOpen: (id: string) => void
  onSpecies: (id: string) => void
  onTry: (fonction: string) => void
}) {
  // Un identifiant inconnu (plante, leçon, fonction) n'est jamais proposé.
  const plants = (l.planteIds ?? []).filter((id) => SPECIES_BY_ID[id])
  const more = (l.plusLoin ?? []).map(getLecon).filter((x): x is Lecon => !!x)
  const next = LECONS.find((x) => x.ordre > l.ordre)
  const niveau = NIVEAUX.find((n) => n.id === l.niveau)
  const canTry = !!l.essayer && FEATURES.some((f) => f.id === l.essayer!.fonction)
  const h = (k: string) => `lecon-${l.id}-${k}`
  return (
    <article className="ennui-sheet lecon-sheet" data-lecon={l.id}>
      <p className="ennui-type">
        <LeconIcon niveau={l.niveau} size={22} /> {niveau?.libelle} · leçon {l.ordre} sur {LECONS.length} · {minutesText(l)}
        {done && <DoneMark />}
      </p>
      <p className="lecon-objectif">
        <strong>À la fin :</strong> {l.objectif}
      </p>
      {l.mois && l.mois.length > 0 && <p className="small muted">Surtout {monthsText(l.mois)}.</p>}
      <section aria-labelledby={h('points')}>
        <h2 id={h('points')}>Les points à retenir</h2>
        <ol className="conseil-steps lecon-points">
          {l.points.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </section>
      {l.attention && (
        <aside className="ennui-warn" role="note">
          <Icon name="alert" size={22} />
          <div>
            <strong>Attention</strong>
            <p>{l.attention}</p>
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
      {canTry && (
        <section className="lecon-try" aria-labelledby={h('essayer')}>
          <h2 id={h('essayer')}>Essayez dans votre jardin</h2>
          <button className="btn primary lecon-btn" data-lecon-try={l.essayer!.fonction} onClick={() => onTry(l.essayer!.fonction)}>
            {l.essayer!.libelle}
          </button>
        </section>
      )}
      <Quiz key={l.id} lessonId={l.id} questions={l.quiz} />
      <section className="lecon-finish" aria-labelledby={h('fin')}>
        <h2 id={h('fin')}>{done ? 'Leçon terminée' : 'Vous avez fini ?'}</h2>
        <p className="lecon-finish-text" role="status" aria-live="polite">
          {done ? 'Elle est cochée dans votre liste.' : 'Cochez-la dans votre liste pour retrouver votre place.'}
        </p>
        <button className={'btn lecon-btn' + (done ? '' : ' primary')} data-lecon-done onClick={onToggleDone}>
          {!done && <Icon name="check" size={18} />} {done ? 'Rouvrir cette leçon' : 'Marquer comme terminée'}
        </button>
      </section>
      {more.length > 0 && (
        <section aria-labelledby={h('plus')}>
          <h2 id={h('plus')}>Pour aller plus loin</h2>
          <ul className="ennui-list">
            {more.map((m) => (
              <li key={m.id}>
                <button className="ennui-row" data-lecon-id={m.id} onClick={() => onOpen(m.id)}>
                  <span className="ennui-row-icon lecon-num" aria-hidden="true">
                    {m.ordre}
                  </span>
                  <span className="ennui-row-text">
                    <strong>
                      <span className="sr-only">Leçon {m.ordre} : </span>
                      {m.titre}
                    </strong>
                    <span>{minutesText(m)}</span>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {next ? (
        <button className="btn lecon-btn lecon-next" data-lecon-next={next.id} onClick={() => onOpen(next.id)}>
          Leçon suivante : {next.titre} <Icon name="forward" size={18} />
        </button>
      ) : (
        <p className="lecon-end">C’est la dernière leçon du parcours. Bravo pour votre curiosité !</p>
      )}
      <p className="small muted ennui-source">Source : {l.source}.</p>
      <p className="small muted">{NOTE_CONTENU}</p>
    </article>
  )
}

/** Progression, « Reprendre » et les leçons groupées par niveau. */
export function LeconsList({ done, onOpen }: { done: string[]; onOpen: (id: string) => void }) {
  const next = nextLesson(done)
  const percent = percentDone(done)
  const groups = NIVEAUX.map((n) => ({ n, list: leconsDuNiveau(n.id) }))
  return (
    <>
      <section className="lecon-progress" aria-label="Votre progression">
        <p className="lecon-progress-text" role="status" aria-live="polite">
          <strong>{doneSentence(done)}</strong>
        </p>
        <progress className="lecon-bar" max={100} value={percent} aria-label={`Progression : ${doneSentence(done)}`} />
        {next ? (
          <button className="btn primary lecon-btn lecon-resume" data-lecon-resume={next.id} onClick={() => onOpen(next.id)}>
            {done.length === 0 ? 'Commencer la leçon 1' : `Reprendre : leçon ${next.ordre}, ${next.titre}`}
          </button>
        ) : (
          <p className="lecon-all">Vous avez fait toutes les leçons. Bravo ! Vous pouvez les relire quand vous voulez.</p>
        )}
      </section>

      {groups.map(({ n, list }) => (
        <section key={n.id} className="lecon-level" aria-labelledby={`niveau-${n.id}`}>
          <h2 id={`niveau-${n.id}`}>
            <span className="lecon-level-icon">
              <LeconIcon niveau={n.id} />
            </span>
            {n.libelle}
          </h2>
          <p className="small muted">{n.resume}</p>
          <ul className="ennui-list">
            {list.map((l) => {
              const ok = isDone(done, l.id)
              return (
                <li key={l.id}>
                  <button className={'ennui-row' + (ok ? ' lecon-row-done' : '')} data-lecon-id={l.id} onClick={() => onOpen(l.id)}>
                    <span className="ennui-row-icon lecon-num" aria-hidden="true">
                      {l.ordre}
                    </span>
                    <span className="ennui-row-text">
                      <strong>
                        <span className="sr-only">Leçon {l.ordre} : </span>
                        {l.titre}
                      </strong>
                      <span className="lecon-row-meta">
                        {minutesText(l)}
                        {ok && <DoneMark />}
                      </span>
                    </span>
                    <Icon name="forward" size={20} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}

/** « Apprendre à jardiner » : le parcours en 14 leçons courtes, groupées par niveau, et une fiche par leçon. */
export default function LeconsScreen({ initialId }: { initialId?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | undefined>(() => (initialId && getLecon(initialId) ? initialId : undefined))
  const done = useLessonsDone()
  const current = openId ? getLecon(openId) : undefined

  const back = () => (current ? setOpenId(undefined) : close())
  const backRef = useRef(back)
  backRef.current = back
  useInertBehind(true)
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
    <div ref={ref} className="tf-overlay ennuis lecons" role="dialog" aria-modal="true" aria-label={current ? current.titre : LECONS_TITLE} data-feat="lecons" tabIndex={-1}>
      <Layer key={openId ?? 'liste'} onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={back}>
          <Icon name="back" size={18} /> {current ? 'Retour à la liste' : 'Retour'}
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{current ? current.titre : LECONS_TITLE}</h1>
      </header>

      <div className="tf-body ennui-body" hidden={!!current}>
        <LeconsList done={done} onOpen={setOpenId} />
        <p className="small muted ennui-note">{NOTE_CONTENU}</p>
      </div>

      {current && (
        <div className="tf-body ennui-body ennui-read" ref={sheetRef}>
          <LeconSheet
            l={current}
            done={isDone(done, current.id)}
            onToggleDone={() => (isDone(done, current.id) ? unmarkDone(current.id) : markDone(current.id))}
            onOpen={setOpenId}
            onSpecies={goToSpecies}
            onTry={tryFeature}
          />
          <button className="btn ennui-back" onClick={() => setOpenId(undefined)}>
            <Icon name="back" size={18} /> Retour à la liste
          </button>
        </div>
      )}
    </div>
  )
}
