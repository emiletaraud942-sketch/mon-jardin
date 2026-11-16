// Invitation à un chantier participatif : un texte à partager et un fichier d'agenda. Aucun serveur : on n'enregistre pas les inscriptions.
// Module pur : rien n'est stocké.
import type { IcsEvent } from '../../lib/neighbors/eventIcs'

export interface ChantierForm {
  titre: string
  /** AAAA-MM-JJ */
  date: string
  /** HH:MM, heure locale. */
  heure: string
  dureeH: number
  lieu: string
  apporter: string
  organisateur: string
}

export const EMPTY_CHANTIER: ChantierForm = { titre: '', date: '', heure: '14:00', dureeH: 3, lieu: '', apporter: '', organisateur: '' }

const clean = (s: string, max: number) => s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

/** Début et fin en dates (heure locale de l'appareil), ou null si la date ou l'heure sont illisibles. */
export function chantierTimes(f: Pick<ChantierForm, 'date' | 'heure' | 'dureeH'>): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || !/^\d{2}:\d{2}$/.test(f.heure)) return null
  const start = new Date(`${f.date}T${f.heure}:00`)
  if (!Number.isFinite(start.getTime())) return null
  const h = Number.isFinite(f.dureeH) && f.dureeH > 0 && f.dureeH <= 24 ? f.dureeH : 3
  return { start, end: new Date(start.getTime() + h * 3_600_000) }
}

export function chantierValid(f: ChantierForm): string | undefined {
  if (!clean(f.titre, 80)) return 'Donnez un titre au chantier.'
  if (!chantierTimes(f)) return 'Choisissez un jour et une heure.'
  if (!clean(f.lieu, 120)) return 'Dites où ça se passe.'
  return undefined
}

/** Texte à envoyer par message : court, lisible sur un téléphone. */
export function chantierText(f: ChantierForm): string {
  const t = chantierTimes(f)
  const quand = t ? t.start.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''
  const lignes = [`${clean(f.titre, 80)}`, quand && `Quand : ${quand}, pendant environ ${f.dureeH} h`, `Où : ${clean(f.lieu, 120)}`]
  if (clean(f.apporter, 200)) lignes.push(`À apporter : ${clean(f.apporter, 200)}`)
  if (clean(f.organisateur, 60)) lignes.push(`Organisé par : ${clean(f.organisateur, 60)}`)
  lignes.push('Répondez-moi pour dire si vous venez.')
  return lignes.filter(Boolean).join('\n')
}

/** L'événement pour `buildEventIcs`, ou null si la date est illisible. */
export function chantierEvent(f: ChantierForm, id: string): IcsEvent | null {
  const t = chantierTimes(f)
  if (!t) return null
  return {
    id,
    title: clean(f.titre, 80) || 'Chantier au jardin',
    description: clean(f.apporter, 200) ? `À apporter : ${clean(f.apporter, 200)}` : '',
    startsAt: t.start.toISOString(),
    endsAt: t.end.toISOString(),
    place: clean(f.lieu, 120),
    organizerName: clean(f.organisateur, 60) || 'Jardin partagé',
    signupUrl: null,
  }
}
