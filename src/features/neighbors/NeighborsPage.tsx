import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabPanel } from '../../components/Tabs'
import { getMyOrganizer, getProfile, getSession, onSessionChange } from '../../lib/neighbors/api'
import { notifyNewsChanged, writeVisit, type NewsTarget } from '../../lib/neighbors/news'
import { loadNews } from '../../lib/neighbors/newsLoad'
import { neighborhoodText, parseRadius, type CategoryFilter, type KindFilter } from '../../lib/neighbors/logic'
import type { EventItem, NeighborsSession, Post, PostKind, Profile, Thread } from '../../lib/neighbors/types'
import { grantConsent, useConsents } from '../../lib/consent'
import type { Garden } from '../../types'
import { LegalLink } from '../legal/LegalLinks'
import '../../styles/novice-pages.css'
import { ErrorBox, KindBadge, Spinner } from './common'
import { EventDetail } from './EventDetail'
import { EventForm } from './EventForm'
import { EventsTab } from './Events'
import { Feed } from './Feed'
import { errorText, useLoad, useOnline, usePolling } from './hooks'
import { POLL_MS, ThreadList, ThreadView } from './Messages'
import { MyEvents } from './MyEvents'
import { MyPosts } from './MyPosts'
import { Nouveautes } from './Nouveautes'
import { OrganizerPage } from './OrganizerPage'
import { PostDetail } from './PostDetail'
import { PostForm } from './PostForm'
import { readRadius, saveRadius } from './prefs'
import { ProfileForm } from './ProfileForm'
import { ProfileTab } from './ProfileTab'
import { SignIn } from './SignIn'

type Section = 'accueil' | 'fil' | 'evenements' | 'messages' | 'mes' | 'profil'
type View =
  | { k: 'tabs' }
  | { k: 'new'; kind?: PostKind }
  | { k: 'post'; post: Post }
  | { k: 'thread'; thread: Thread; postTitle?: string; draft?: string }
  | { k: 'event'; event: EventItem }
  | { k: 'event-new' }
  | { k: 'organizer' }
  | { k: 'my-events' }

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'accueil', label: 'Nouveautés' },
  { id: 'fil', label: 'Annonces' },
  { id: 'evenements', label: 'Événements' },
  { id: 'messages', label: 'Messages' },
  { id: 'mes', label: 'Mes annonces' },
  { id: 'profil', label: 'Profil' },
]

const EXAMPLES: { kind: PostKind; title: string; who: string }[] = [
  { kind: 'don', title: 'Boutures de menthe à donner', who: 'Marie · dans votre quartier' },
  { kind: 'pret', title: 'Je prête mon sécateur et ma bêche', who: 'Paul · à ~2 km' },
  { kind: 'question', title: 'Quelle plante pour un mur à l’ombre ?', who: 'Annie · à ~3 km' },
  { kind: 'cherche', title: 'Je cherche des graines de capucine', who: 'Jean · à ~1 km' },
]

const EXAMPLE_EVENT = { title: 'Atelier de taille des rosiers', when: 'Un samedi, de 14 h 00 à 16 h 00', where: 'Jardin partagé du quartier', who: 'Organisé par Les Jardiniers du quartier' }

/** Écran « Entraide ». Aucune requête ne part avant l'accord : un seul écran explique et demande l'autorisation. */
export function NeighborsPage({ garden }: { garden: Garden }) {
  const { voisins } = useConsents()
  return (
    <div className="page nb-page np-page">
      <header className="nb-head">
        <h1>Entraide entre voisins</h1>
        <p className="muted" style={{ margin: 0 }}>
          Donnez, échangez, prêtez, cherchez ou posez une question à des jardiniers près de chez vous. Retrouvez aussi les événements du coin. C’est gratuit.
        </p>
      </header>
      {voisins ? (
        <Connected garden={garden} />
      ) : (
        <>
          <section className="card stack" aria-label="Exemples d’annonces">
            <h2>Voici à quoi ça ressemble</h2>
            <p className="small muted" style={{ margin: 0 }}>Ce sont des exemples, pas de vraies annonces.</p>
            {EXAMPLES.map((e) => (
              <div key={e.title} className="np-example">
                <span>
                  <KindBadge kind={e.kind} />
                </span>
                <strong>{e.title}</strong>
                <span className="small muted">{e.who}</span>
              </div>
            ))}
            <div className="np-example" aria-label="Exemple d’événement">
              <span>
                <span className="badge green">Événement</span>
              </span>
              <strong>{EXAMPLE_EVENT.title}</strong>
              <span>{EXAMPLE_EVENT.when}</span>
              <span className="small muted">
                {EXAMPLE_EVENT.where} · {EXAMPLE_EVENT.who}
              </span>
              <span className="small muted">Boutons : « Je suis intéressé(e) », « S’inscrire », « Signaler ».</span>
            </div>
          </section>
          <section className="card stack" aria-label="Avant de commencer">
            <h2>Avant de commencer</h2>
            <ul className="nb-rules">
              <li>Il faut une adresse e-mail et un pseudo. Pas de mot de passe.</li>
              <li>Les voisins voient votre pseudo et votre quartier, jamais votre adresse.</li>
              <li>Votre quartier est arrondi : environ 1 km autour de chez vous.</li>
              <li>Vos annonces et messages sont gardés sur un serveur en Europe. Les annonces disparaissent après 60 jours.</li>
              <li>Les événements sont publiés par des organisateurs vérifiés. Un lien d’inscription mène vers un autre site.</li>
              <li>Vous pouvez tout supprimer, ou retirer votre autorisation, à tout moment.</li>
            </ul>
            <p className="small" style={{ margin: 0 }}>
              Détails : <LegalLink id="confidentialite" label="politique de confidentialité" />.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Rien n’est envoyé avant votre accord.</strong>
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => grantConsent('voisins')}>
                J’accepte et je continue
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Connected({ garden }: { garden: Garden }) {
  const online = useOnline()
  const [session, setSession] = useState<NeighborsSession | null | undefined>(undefined)
  const [sessionError, setSessionError] = useState<string>()

  useEffect(() => {
    let alive = true
    // Même identité = même objet : un jeton rafraîchi ne relance aucun chargement.
    const apply = (s: NeighborsSession | null) => alive && setSession((prev) => (prev && s && prev.userId === s.userId && prev.email === s.email ? prev : s))
    getSession().then(apply, (e) => alive && (setSessionError(errorText(e)), setSession(null)))
    const off = onSessionChange(apply)
    return () => {
      alive = false
      off()
    }
  }, [])

  const userId = session?.userId
  const profile = useLoad(getProfile, userId ?? '', !!userId)

  if (session === undefined) return <Spinner label="Connexion en cours…" />
  if (!session) {
    return (
      <>
        {sessionError && <ErrorBox message={sessionError} />}
        <SignIn online={online} />
      </>
    )
  }
  if (profile.data === undefined) return profile.error ? <ErrorBox message={profile.error} onRetry={profile.reload} /> : <Spinner label="Chargement du profil…" />
  if (profile.data === null) return <ProfileForm garden={garden} online={online} onSaved={(p) => profile.setData(p)} />
  return <Main key={userId} userId={userId as string} profile={profile.data} email={session.email} garden={garden} online={online} onProfile={profile.setData} />
}

function Main({ userId, profile, email, garden, online, onProfile }: { userId: string; profile: Profile; email: string | null; garden: Garden; online: boolean; onProfile: (p: Profile) => void }) {
  const [section, setSection] = useState<Section>('accueil')
  const [view, setView] = useState<View>({ k: 'tabs' })
  const [kind, setKind] = useState<KindFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [radius, setRadius] = useState(readRadius)
  // Organisateur : facultatif. Une erreur (base pas encore mise à jour) ne touche que l'onglet Événements.
  const organizer = useLoad(getMyOrganizer, userId)
  // Nouveautés : calculées une fois la liste chargée ; la date de visite n'est mise à jour qu'après un chargement réussi.
  const news = useLoad(() => loadNews(userId, radius), `${userId}|${radius}`)
  const marked = useRef(false)
  const refreshNews = news.refresh
  useEffect(() => {
    if (!news.data || marked.current) return
    marked.current = true
    writeVisit(userId)
    notifyNewsChanged()
  }, [news.data, userId])
  usePolling(refreshNews, POLL_MS * 2)
  const toTabs = useCallback(() => {
    setView({ k: 'tabs' })
    refreshNews()
    notifyNewsChanged()
  }, [refreshNews])
  const go = (t: NewsTarget) => {
    if (t.section === 'messages') return setSection('messages')
    if (t.section === 'evenements') return setSection('evenements')
    setKind(t.kind)
    setCategory('all')
    setSection('fil')
  }
  const unreadTotal = news.data?.messages ?? 0
  const sections = SECTIONS.map((x) => (x.id === 'messages' && unreadTotal > 0 ? { ...x, label: `Messages (${unreadTotal})` } : x))

  const changeRadius = (r: number) => {
    const v = parseRadius(r)
    setRadius(v)
    saveRadius(v)
  }

  return (
    <div className="stack">
      {!online && (
        <p className="alert small" role="status" style={{ margin: 0 }}>
          Pas de réseau. Les annonces se mettront à jour au retour du réseau.
        </p>
      )}
      {view.k === 'new' && (
        <PostForm
          online={online}
          initialKind={view.kind}
          pseudo={profile.pseudo}
          where={neighborhoodText(profile.cell, garden)}
          onCancel={toTabs}
          onPublished={() => {
            setSection('fil')
            setView({ k: 'tabs' })
            refreshNews()
          }}
        />
      )}
      {view.k === 'post' && (
        <PostDetail
          post={view.post}
          online={online}
          onBack={toTabs}
          onChat={(thread, post, draft) => {
            setSection('messages')
            setView({ k: 'thread', thread, postTitle: post.title, draft })
          }}
        />
      )}
      {view.k === 'event' && <EventDetail key={view.event.id} event={view.event} online={online} onBack={toTabs} />}
      {view.k === 'organizer' && (
        <OrganizerPage
          organizer={organizer.data ?? null}
          online={online}
          onBack={toTabs}
          onChanged={organizer.reload}
          onNewEvent={() => setView({ k: 'event-new' })}
        />
      )}
      {view.k === 'event-new' && organizer.data?.verified && (
        <EventForm
          organizerName={organizer.data.name}
          where={neighborhoodText(profile.cell, garden)}
          online={online}
          onCancel={toTabs}
          onPublished={() => {
            setSection('evenements')
            setView({ k: 'tabs' })
            refreshNews()
          }}
        />
      )}
      {view.k === 'event-new' && !organizer.data?.verified && (
        <div className="card stack">
          <p style={{ margin: 0 }}>Votre demande d’organisateur n’est pas encore validée.</p>
          <div className="row">
            <button className="btn" onClick={toTabs}>
              Retour
            </button>
          </div>
        </div>
      )}
      {view.k === 'my-events' && <MyEvents online={online} onBack={toTabs} onNew={() => setView({ k: 'event-new' })} />}
      {view.k === 'thread' && <ThreadView thread={view.thread} postTitle={view.postTitle} draft={view.draft} online={online} onBack={toTabs} />}
      {view.k === 'tabs' && (
        <>
          <Tabs tabs={sections} value={section} onChange={setSection} label="Parties de l’entraide" idPrefix="nb" />
          <TabPanel idPrefix="nb" active={section}>
            {section === 'accueil' && <Nouveautes news={news} onGo={go} onNew={() => setView({ k: 'new' })} />}
            {section === 'fil' && (
              <Feed
                kind={kind}
                category={category}
                radius={radius}
                online={online}
                onKind={setKind}
                onCategory={setCategory}
                onRadius={changeRadius}
                onOpen={(p) => setView({ k: 'post', post: p })}
                onNew={(k) => setView({ k: 'new', kind: k })}
              />
            )}
            {section === 'evenements' && (
              <EventsTab
                radius={radius}
                online={online}
                organizer={organizer}
                onRadius={changeRadius}
                onOpen={(e) => setView({ k: 'event', event: e })}
                onOrganizer={() => setView({ k: 'organizer' })}
                onNewEvent={() => setView({ k: 'event-new' })}
                onMine={() => setView({ k: 'my-events' })}
              />
            )}
            {section === 'messages' && <ThreadList online={online} unread={news.data?.unreadByThread} onOpen={(t) => setView({ k: 'thread', thread: t })} />}
            {section === 'mes' && <MyPosts online={online} onOpen={(p) => setView({ k: 'post', post: p })} onNew={() => setView({ k: 'new' })} />}
            {section === 'profil' && <ProfileTab profile={profile} email={email} garden={garden} online={online} onSaved={onProfile} />}
          </TabPanel>
        </>
      )}
    </div>
  )
}
