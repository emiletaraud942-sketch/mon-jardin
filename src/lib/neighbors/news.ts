// Nouveautés de l'entraide : ce qui est arrivé depuis la dernière visite. Logique pure (aucun réseau) et mémoire locale.
// Le calcul se fait ici, dans le navigateur, à partir des annonces et messages que la base montre déjà.
import type { EventItem, Post, PostKind } from './types'

/** Ordre d'affichage des lignes. */
const KIND_ORDER: readonly PostKind[] = ['don', 'echange', 'pret', 'cherche', 'question']

export interface News {
  /** Date de la visite précédente ; null à la toute première visite. */
  since: string | null
  /** Nouvelles annonces des autres, par type. */
  posts: Record<PostKind, number>
  /** Messages reçus et pas encore lus. */
  messages: number
  /** Événements des autres, à venir ou en cours, ouverts (null : événements indisponibles, rien à montrer). */
  eventsUpcoming: number | null
  /** Parmi eux, ceux publiés depuis la dernière visite. */
  eventsNew: number
  /** posts + événements nouveaux + messages (les événements « à venir » ne sont pas des nouveautés : ils restent hors pastille). */
  total: number
}

const emptyPosts = (): Record<PostKind, number> => ({ don: 0, echange: 0, pret: 0, question: 0, cherche: 0 })

/** Annonces des autres publiées après `since`. À la première visite (since null), rien n'est « nouveau ». */
export function computeNews(
  posts: Pick<Post, 'kind' | 'mine' | 'createdAt'>[],
  since: string | null,
  unreadMessages: number,
  events?: Pick<EventItem, 'mine' | 'createdAt' | 'status' | 'endsAt'>[] | null,
  now: Date = new Date(),
): News {
  const counts = emptyPosts()
  const t0 = since == null ? NaN : Date.parse(since)
  if (Number.isFinite(t0)) {
    for (const p of posts) {
      if (p.mine) continue
      const t = Date.parse(p.createdAt)
      if (Number.isFinite(t) && t > t0 && p.kind in counts) counts[p.kind]++
    }
  }
  const messages = Math.max(0, Math.floor(unreadMessages) || 0)
  let eventsUpcoming: number | null = null
  let eventsNew = 0
  if (events) {
    eventsUpcoming = 0
    for (const e of events) {
      if (e.mine || e.status !== 'open' || !(Date.parse(e.endsAt) >= now.getTime())) continue
      eventsUpcoming++
      const t = Date.parse(e.createdAt)
      if (Number.isFinite(t0) && Number.isFinite(t) && t > t0) eventsNew++
    }
  }
  const total = KIND_ORDER.reduce((s, k) => s + counts[k], 0) + messages + eventsNew
  return { since: Number.isFinite(t0) ? (since as string) : null, posts: counts, messages, eventsUpcoming, eventsNew, total }
}

export type NewsTarget = { section: 'fil'; kind: PostKind | 'all' } | { section: 'messages' } | { section: 'evenements' }
export interface NewsLine {
  id: string
  count: number
  /** Texte sans le nombre : « nouveaux dons ». */
  text: string
  target: NewsTarget
}

const PLURAL: Record<PostKind, [one: string, many: string]> = {
  don: ['nouveau don', 'nouveaux dons'],
  echange: ['nouvel échange', 'nouveaux échanges'],
  pret: ['nouveau prêt', 'nouveaux prêts'],
  cherche: ['nouvelle demande', 'nouvelles demandes'],
  question: ['nouvelle question', 'nouvelles questions'],
}

/** Une ligne par sorte de nouveauté, seulement s'il y en a. Les messages d'abord. */
export function newsLines(n: News): NewsLine[] {
  const lines: NewsLine[] = []
  if (n.messages > 0) lines.push({ id: 'messages', count: n.messages, text: n.messages > 1 ? 'messages à lire' : 'message à lire', target: { section: 'messages' } })
  for (const k of KIND_ORDER) {
    const c = n.posts[k]
    if (c > 0) lines.push({ id: k, count: c, text: PLURAL[k][c > 1 ? 1 : 0], target: { section: 'fil', kind: k } })
  }
  const ev = n.eventsUpcoming ?? 0
  if (ev > 0) lines.push({ id: 'evenements', count: ev, text: ev > 1 ? 'événements à venir' : 'événement à venir', target: { section: 'evenements' } })
  return lines
}

/** Nombre court pour une pastille : « 99+ » au-delà de 99. */
export const badgeLabel = (n: number): string => (n > 99 ? '99+' : String(Math.max(0, Math.floor(n) || 0)))

/** Phrase lue par un lecteur d'écran pour la pastille du menu. */
export const badgeAria = (n: number): string => `${n > 99 ? 'plus de 99' : n} nouveauté${n > 1 ? 's' : ''} dans l’entraide`

// ---------- Date de dernière visite (mémoire locale, une par compte) ----------

const VISIT_PREFIX = 'permajardin:voisins:visite:'
export const NEWS_EVENT = 'permajardin:voisins-news'

export interface MiniStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}
const local = (): MiniStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
const visitKey = (userId: string) => VISIT_PREFIX + userId

/** Dernière visite de ce compte sur cet appareil, ou null (jamais venu, mémoire indisponible, valeur abîmée ou dans le futur). */
export function readVisit(userId: string, store: MiniStorage | null = local(), now: Date = new Date()): string | null {
  if (!store || !userId) return null
  try {
    const v = store.getItem(visitKey(userId))
    const t = v == null ? NaN : Date.parse(v)
    return Number.isFinite(t) && t <= now.getTime() + 60_000 ? v : null
  } catch {
    return null
  }
}
export function writeVisit(userId: string, store: MiniStorage | null = local(), now: Date = new Date()): void {
  if (!store || !userId) return
  try {
    store.setItem(visitKey(userId), now.toISOString())
  } catch {
    /* mémoire pleine ou bloquée : la prochaine visite repartira de zéro */
  }
}
export function forgetVisit(userId: string, store: MiniStorage | null = local()): void {
  try {
    store?.removeItem(visitKey(userId))
  } catch {
    /* rien à faire */
  }
}

/** Prévient le reste de l'appli (pastille du menu) que les nouveautés ont changé. */
export function notifyNewsChanged(): void {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(NEWS_EVENT))
  } catch {
    /* hors navigateur */
  }
}
