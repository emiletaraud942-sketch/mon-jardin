import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { goHome } from '../../lib/goHome'
import { downloadBlob } from '../../lib/backup'
import { useInertBehind } from '../../lib/inert'
import { buildEventIcs, eventIcsFilename } from '../../lib/neighbors/eventIcs'
import { collectifOpen, territoireOpen } from '../../lib/overlays'
import { useActiveGarden } from '../../lib/store'
import { AIDES_COMPOST_URL, GUIDE_EAU_URL, GUIDE_PARCELLE_URL, HERISSON_URL, HORAIRES_OUTILS, HORAIRES_ROUEN_URL, inMetropole, JARDINONS_URL } from '../../lib/territoire'
import { showToast } from '../../lib/toast'
import { useBackLayer } from '../../lib/ui'
import { AGENDA_SOURCE, fetchJardinons, type JardinonsEvent } from './jardinons'
import '../../styles/novice-pages.css'
import '../../styles/ennuis.css'
import '../../styles/territoire.css'

export const TERRITOIRE_TITLE = 'Jardinons ! et la Métropole'

const close = () => territoireOpen.set(false)

function Layer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Lien vers un site public : s'ouvre dans un nouvel onglet, sans rien transmettre. */
function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="btn terr-link" href={href} target="_blank" rel="noopener noreferrer">
      {children} <Icon name="forward" size={16} />
    </a>
  )
}

export function introText(inside: boolean | undefined): string {
  if (inside === true) return 'Votre jardin est dans la Métropole Rouen Normandie : tout ceci vous concerne.'
  if (inside === false) return 'Votre jardin n’est pas dans la Métropole Rouen Normandie. Ces pages servent surtout à ses habitants.'
  return 'Ces pages servent aux habitants de la Métropole Rouen Normandie.'
}

export function EventCard({ e }: { e: JardinonsEvent }) {
  const addToCalendar = () => {
    const text = buildEventIcs({ id: e.id, title: e.title, description: e.description, startsAt: e.startsAt, endsAt: e.endsAt, place: e.place, organizerName: 'Métropole Rouen Normandie', signupUrl: e.url ?? null })
    if (!text) return showToast({ message: 'Cette date n’est pas lisible : le fichier n’a pas été créé.' })
    downloadBlob(new Blob([text], { type: 'text/calendar;charset=utf-8' }), eventIcsFilename(e.title))
    showToast({ message: 'Fichier enregistré. Ouvrez-le pour l’ajouter à votre agenda.' })
  }
  return (
    <li className="terr-event" data-event-id={e.id}>
      <strong>{e.title}</strong>
      <span>{e.when || new Date(e.startsAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</span>
      {e.place && <span className="muted">{e.place}</span>}
      {e.description && <span>{e.description}</span>}
      {e.conditions && <span className="small muted">{e.conditions}</span>}
      <div className="terr-actions">
        <button className="btn" onClick={addToCalendar}>
          <Icon name="calendar" size={16} /> Ajouter à mon calendrier
        </button>
        {e.url && <Out href={e.url}>S’inscrire ou en savoir plus</Out>}
      </div>
    </li>
  )
}

type Load = { state: 'loading' } | { state: 'ok'; events: JardinonsEvent[] } | { state: 'error'; message: string }

export default function TerritoireScreen() {
  const garden = useActiveGarden()
  const inside = inMetropole(garden)
  const ref = useRef<HTMLDivElement>(null)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [tick, setTick] = useState(0)
  useInertBehind(true)
  const backRef = useRef(close)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  useEffect(() => {
    const ctrl = new AbortController()
    setLoad({ state: 'loading' })
    fetchJardinons(ctrl.signal)
      .then((events) => setLoad({ state: 'ok', events }))
      .catch((e: Error) => !ctrl.signal.aborted && setLoad({ state: 'error', message: navigator.onLine === false ? 'Vous êtes hors connexion.' : e.message || 'L’agenda ne répond pas.' }))
    return () => ctrl.abort()
  }, [tick])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div ref={ref} className="tf-overlay ennuis territoire" role="dialog" aria-modal="true" aria-label={TERRITOIRE_TITLE} data-feat="territoire" tabIndex={-1}>
      <Layer onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={close}>
          <Icon name="back" size={18} /> Retour
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{TERRITOIRE_TITLE}</h1>
      </header>
      <div className="tf-body ennui-body">
        <p className="terr-intro" data-testid="territoire-intro">
          {introText(inside)}
        </p>

        <section aria-labelledby="terr-rdv" className="terr-section">
          <h2 id="terr-rdv">Rendez-vous à venir</h2>
          {load.state === 'loading' && <p role="status">Chargement de l’agenda…</p>}
          {load.state === 'error' && (
            <div role="status">
              <p>{load.message} L’agenda n’a pas pu être lu.</p>
              <button className="btn" onClick={() => setTick((t) => t + 1)}>
                Réessayer
              </button>
            </div>
          )}
          {load.state === 'ok' && load.events.length === 0 && <p role="status">Aucun rendez-vous Jardinons ! n’est annoncé pour le moment.</p>}
          {load.state === 'ok' && load.events.length > 0 && (
            <ul className="terr-events">
              {load.events.map((e) => (
                <EventCard key={e.id} e={e} />
              ))}
            </ul>
          )}
          <p className="small muted">Source : {AGENDA_SOURCE}. Les places sont limitées : inscrivez-vous sur la page du rendez-vous.</p>
        </section>

        <section aria-labelledby="terr-join" className="terr-section">
          <h2 id="terr-join">Rejoindre Jardinons !</h2>
          <p>Jardinons ! est la communauté des jardiniers de la Métropole : ateliers, dons de plants et de graines, prêts d’outils. L’inscription est gratuite pour les habitants de la Métropole.</p>
          <Out href={JARDINONS_URL}>Voir la page de la Métropole</Out>
        </section>

        <section aria-labelledby="terr-aides" className="terr-section">
          <h2 id="terr-aides">Aides pour le compost et le broyage</h2>
          <p>La Métropole rembourse une partie d’un composteur et d’un broyeur de végétaux, sous conditions. Les montants et les règles peuvent changer : lisez le dépliant à jour.</p>
          <Out href={AIDES_COMPOST_URL}>Lire le dépliant des aides</Out>
        </section>

        <section aria-labelledby="terr-bruit" className="terr-section" data-feat="horaires-tonte">
          <h2 id="terr-bruit">Tondre sans gêner les voisins</h2>
          <p>À Rouen, la tondeuse et les outils bruyants ont des heures d’usage (arrêté préfectoral). Votre commune peut avoir ses propres règles : demandez à la mairie.</p>
          <ul className="terr-hours">
            {HORAIRES_OUTILS.map((h) => (
              <li key={h.jour}>
                <strong>{h.jour}</strong> : {h.heures}
              </li>
            ))}
          </ul>
          <Out href={HORAIRES_ROUEN_URL}>Page de la Ville de Rouen</Out>
        </section>

        <section aria-labelledby="terr-coll" className="terr-section">
          <h2 id="terr-coll">Un jardin partagé ou familial ?</h2>
          <p>Notez les gestes de compostage, découpez les parcelles et imprimez un dossier avec le plan : utile pour une demande d’aide.</p>
          <button className="btn" onClick={() => collectifOpen.set({})}>
            Ouvrir « Jardin collectif »
          </button>
        </section>

        <section aria-labelledby="terr-plus" className="terr-section">
          <h2 id="terr-plus">Pour aller plus loin</h2>
          <div className="terr-actions">
            <Out href={GUIDE_PARCELLE_URL}>Guide : un jardin qui aide la biodiversité</Out>
            <Out href={GUIDE_EAU_URL}>Guide de l’eau au jardin</Out>
            <Out href={HERISSON_URL}>La route du hérisson (Rouen)</Out>
          </div>
        </section>
      </div>
    </div>
  )
}
