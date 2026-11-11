// Visite en photos : l'appli passe d'un point de vue à l'autre, tourne sur chacun, puis « avance » vers le suivant.
// Module PUR (aucun écran, aucun stockage) : l'ordre, les caps et le déroulé sont calculés ici et testés ; la visionneuse n'a plus qu'à les appliquer.
// Rien n'est enregistré : l'ordre se recalcule d'après la place des points.
import type { Panorama } from '../../types'
import { bearingDeg, distM, normDeg } from './geometry'

/** Vitesse de rotation (degrés par seconde) : assez lente pour regarder, assez vive pour ne pas s'ennuyer. */
export const TURN_DEG_PER_S = 16
/** Moins que cela ne montre presque rien de neuf : on ajoute un tour complet. */
export const MIN_SWEEP_DEG = 120
/** Pause à l'arrivée sur un point (le temps de voir la photo), puis avant de repartir (face au point suivant). */
export const SETTLE_MS = 800
export const LEAVE_MS = 1200
/** « Mouvement réduit » : pas de rotation, chaque point reste affiché ce temps-là. */
export const STILL_DWELL_MS = 6000

/** Les caps d'un point sont ceux du vrai nord (sinon la boussole n'était pas fiable : caps relatifs, direction des autres points inconnue). */
export const northKnown = (p: Panorama): boolean => p.northOk !== false

/** Un point ne se visite que s'il a au moins une photo. */
export const visitable = (p: Panorama): boolean => p.shots.length > 0

/**
 * Ordre de la visite : on part du premier point de la liste, puis on va toujours au plus proche des points pas encore visités.
 * Renvoie des identifiants ; un seul point (ou aucun) ne fait pas une visite.
 */
export function tourOrder(points: Panorama[]): string[] {
  const left = points.filter(visitable)
  if (left.length === 0) return []
  const out: Panorama[] = [left.shift() as Panorama]
  while (left.length) {
    const last = out[out.length - 1]
    let best = 0
    for (let i = 1; i < left.length; i++) if (distM(last, left[i]) < distM(last, left[best])) best = i
    out.push(left.splice(best, 1)[0])
  }
  return out.map((p) => p.id)
}

/**
 * Cap du regard en arrivant : la direction du déplacement (on continue tout droit) quand les deux points ont un vrai nord,
 * sinon la première photo du point.
 */
export function arrivalYaw(prev: Panorama | undefined, cur: Panorama): number {
  if (prev && northKnown(prev) && northKnown(cur)) return bearingDeg(prev, cur)
  return normDeg(cur.shots[0]?.headingDeg ?? 0)
}

/**
 * De combien tourner (degrés, dans le sens des aiguilles d'une montre) avant de repartir : jusqu'à regarder le point suivant,
 * avec au moins MIN_SWEEP_DEG. Dernier point, ou nord inconnu : un tour complet.
 */
export function sweepDeg(startYaw: number, cur: Panorama, next: Panorama | undefined): number {
  if (!next || !northKnown(cur)) return 360
  const d = normDeg(bearingDeg(cur, next) - startYaw)
  return d < MIN_SWEEP_DEG ? d + 360 : d
}

/** Durée d'un point (ms), rotation comprise, pour annoncer « environ N minutes ». */
export function pointDurationMs(sweep: number, still: boolean): number {
  return still ? STILL_DWELL_MS : SETTLE_MS + (sweep / TURN_DEG_PER_S) * 1000 + LEAVE_MS
}

export type TourPhase = 'arrive' | 'turn' | 'leave' | 'done'

export interface TourState {
  order: string[]
  /** Place du point en cours dans `order`. */
  i: number
  phase: TourPhase
  /** Degrés déjà tournés sur ce point, et total à tourner. */
  turned: number
  sweep: number
  /** Temps passé dans la phase (ms). */
  waited: number
}

export const startTour = (order: string[], sweep = 360): TourState => ({ order, i: 0, phase: 'arrive', turned: 0, sweep, waited: 0 })

export interface TourStep {
  state: TourState
  /** Degrés à ajouter au cap pendant ce pas. */
  yawDelta: number
  /** Le point en cours change : la visionneuse doit afficher `state.order[state.i]` et calculer le prochain balayage. */
  moved: boolean
  /** La visite est finie. */
  finished: boolean
}

/**
 * Fait avancer la visite de `dtMs`. `still` : mouvement réduit (aucune rotation). `nextSweep(i)` : balayage prévu au point d'indice i,
 * demandé seulement quand on y arrive.
 */
export function tickTour(s: TourState, dtMs: number, still: boolean, nextSweep: (i: number) => number): TourStep {
  const dt = Math.max(0, Math.min(dtMs, 500)) // un onglet resté en arrière-plan ne doit pas faire sauter la visite
  let state: TourState = { ...s }
  let yawDelta = 0
  let moved = false
  let rest = dt
  // Une étape peut en consommer plusieurs si dt est grand : au plus quatre transitions par pas.
  for (let guard = 0; guard < 4 && rest > 0 && state.phase !== 'done'; guard++) {
    if (state.phase === 'arrive') {
      const need = still ? STILL_DWELL_MS : SETTLE_MS
      const take = Math.min(rest, need - state.waited)
      state.waited += take
      rest -= take
      if (state.waited >= need) state = { ...state, phase: still ? 'leave' : 'turn', waited: still ? LEAVE_MS : 0 }
    } else if (state.phase === 'turn') {
      const speed = TURN_DEG_PER_S / 1000
      const wanted = rest * speed
      const left = state.sweep - state.turned
      const turn = Math.min(wanted, left)
      state.turned += turn
      yawDelta += turn
      rest -= turn / speed
      if (state.turned >= state.sweep - 1e-9) state = { ...state, phase: 'leave', waited: 0 }
    } else if (state.phase === 'leave') {
      const take = Math.min(rest, LEAVE_MS - state.waited)
      state.waited += take
      rest -= take
      if (state.waited >= LEAVE_MS) {
        if (state.i + 1 >= state.order.length) state = { ...state, phase: 'done' }
        else {
          const i = state.i + 1
          state = { ...state, i, phase: 'arrive', turned: 0, sweep: nextSweep(i), waited: 0 }
          moved = true
        }
      }
    }
  }
  return { state, yawDelta, moved, finished: state.phase === 'done' }
}

/** Saute à un autre point de la visite (précédent / suivant), en repartant de son arrivée. */
export function jumpTo(s: TourState, i: number, sweep: number): TourState {
  const clamped = Math.max(0, Math.min(s.order.length - 1, i))
  return { ...s, i: clamped, phase: 'arrive', turned: 0, sweep, waited: 0 }
}

/** « Point 2 sur 4 » : l'étape en cours, pour l'écran et pour la lecture à voix haute. */
export const stepLabel = (i: number, total: number): string => `Visite : étape ${i + 1} sur ${total}`
