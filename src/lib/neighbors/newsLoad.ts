// Chargement des nouveautés : seul fichier de « news » qui parle au réseau. Chargé à la demande (import dynamique).
import { getSession, listEvents, listPosts, listUnread } from './api'
import { sumCounts } from './logic'
import { computeNews, readVisit, type News } from './news'

export interface NewsData extends News {
  /** Messages non lus par conversation (pour la liste des conversations). */
  unreadByThread: Record<string, number>
}

/** Nouveautés du compte : annonces des autres depuis la dernière visite, et messages non lus. */
export async function loadNews(userId: string, radiusKm: number): Promise<NewsData> {
  const since = readVisit(userId)
  // Les événements sont facultatifs : tant que la base n'a pas reçu la version 4, ou en cas d'erreur, on les laisse de côté.
  const [posts, unread, events] = await Promise.all([listPosts({ radiusKm }), listUnread(), listEvents({ radiusKm }).catch(() => null)])
  return { ...computeNews(posts, since, sumCounts(unread), events), unreadByThread: unread }
}

/** Nombre pour la pastille du menu. 0 sans compte, sans profil ou en cas d'erreur : une pastille ne doit jamais gêner. */
export async function loadBadge(radiusKm: number): Promise<number> {
  try {
    const s = await getSession()
    if (!s) return 0
    return (await loadNews(s.userId, radiusKm)).total
  } catch {
    return 0
  }
}
