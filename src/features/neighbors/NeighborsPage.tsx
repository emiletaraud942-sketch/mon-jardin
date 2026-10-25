import { useCallback, useEffect, useRef, useState } from 'react'
import { Tabs, TabPanel } from '../../components/Tabs'
import { getProfile, getSession, onSessionChange } from '../../lib/neighbors/api'
import { notifyNewsChanged, writeVisit, type NewsTarget } from '../../lib/neighbors/news'
import { loadNews } from '../../lib/neighbors/newsLoad'
import { neighborhoodText, parseRadius, type CategoryFilter, type KindFilter } from '../../lib/neighbors/logic'
import type { NeighborsSession, Post, PostKind, Profile, Thread } from '../../lib/neighbors/types'
import { grantConsent, useConsents } from '../../lib/consent'
import type { Garden } from '../../types'
import { LegalLink } from '../legal/LegalLinks'
import '../../styles/novice-pages.css'
import { ErrorBox, KindBadge, Spinner } from './common'
import { Feed } from './Feed'
import { errorText, useLoad, useOnline, usePolling } from './hooks'
import { POLL_MS, ThreadList, ThreadView } from './Messages'
import { MyPosts } from './MyPosts'
import { Nouveautes } from './Nouveautes'
import { PostDetail } from './PostDetail'
import { PostForm } from './PostForm'
import { readRadius, saveRadius } from './prefs'
import { ProfileForm } from './ProfileForm'
import { ProfileTab } from './ProfileTab'
import { SignIn } from './SignIn'

type Section = 'accueil' | 'fil' | 'messages' | 'mes' | 'profil'
type View = { k: 'tabs' } | { k: 'new'; kind?: PostKind } | { k: 'post'; post: Post } | { k: 'thread'; thread: Thread; postTitle?: string; draft?: string }

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'accueil', label: 'Nouveautés' },
  { id: 'fil', label: 'Annonces' },
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

/** Écran « Entraide ». Aucune requête ne part avant l'accord : un seul écran explique et demande l'autorisation. */
export function NeighborsPage({ garden }: { garden: Garden }) {
  const { voisins } = useConsents()
  return (
    <div className="page nb-page np-page">
      <header className="nb-head">
        <h1>Entraide entre voisins</h1>
        <p className="muted" style={{ margin: 0 }}>
          Donnez, échangez, prêtez, cherchez ou posez une question à des jardiniers près de chez vous. C’est gratuit.
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
          </section>
          <section className="card stack" aria-label="Avant de commencer">
            <h2>Avant de commencer</h2>
            <ul className="nb-rules">
              <li>Il faut une adresse e-mail et un pseudo. Pas de mot de passe.</li>
              <li>Les voisins voient votre pseudo et votre quartier, jamais votre adresse.</li>
              <li>Votre quartier est arrondi : environ 1 km autour de chez vous.</li>
              <li>Vos annonces et messages sont gardés sur un serveur en Europe. Les annonces disparaissent après 60 jours.</li>
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
            {section === 'messages' && <ThreadList online={online} unread={news.data?.unreadByThread} onOpen={(t) => setView({ k: 'thread', thread: t })} />}
            {section === 'mes' && <MyPosts online={online} onOpen={(p) => setView({ k: 'post', post: p })} onNew={() => setView({ k: 'new' })} />}
            {section === 'profil' && <ProfileTab profile={profile} email={email} garden={garden} online={online} onSaved={onProfile} />}
          </TabPanel>
        </>
      )}
    </div>
  )
}
