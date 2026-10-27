// Boussole et inclinaison du téléphone (DeviceOrientation). Les valeurs rapides sont lues dans `latest` (pas de rendu React à 60 Hz).
// iPhone : l'accès aux capteurs se demande après un toucher (DeviceOrientationEvent.requestPermission).
import { cameraHeadingDeg, cameraPitchDeg, normDeg } from './geometry'

export type SensorStatus = 'repos' | 'attente' | 'ok' | 'refuse' | 'absent'

export interface SensorReading {
  /** Cap de la caméra arrière (0 = nord). undefined tant qu'aucune mesure. */
  heading?: number
  /** Hauteur du regard (0 = horizon). */
  pitch?: number
  /** Vrai si le cap est rapporté au nord (boussole). Faux : cap relatif, démarré à une direction quelconque. */
  absolute: boolean
  t: number
}

type IosOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number }

export interface Sensor {
  latest: SensorReading
  status: SensorStatus
  /** À appeler dans un geste (toucher). Renvoie le statut final. */
  start(): Promise<SensorStatus>
  stop(): void
}

/** Délai sans aucune mesure avant de conclure qu'il n'y a pas de capteur (ordinateur). */
const WAIT_MS = 1800

export function createSensor(onStatus?: (s: SensorStatus) => void): Sensor {
  let off: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const sensor: Sensor = {
    latest: { absolute: false, t: 0 },
    status: 'repos',
    start,
    stop,
  }
  const set = (s: SensorStatus) => {
    if (sensor.status === s) return
    sensor.status = s
    onStatus?.(s)
  }

  // Chaque arrêt change de « génération » : un démarrage resté en attente de l'autorisation (iPhone) ne branche rien après un arrêt.
  let generation = 0

  function stop() {
    generation++
    off?.()
    off = undefined
    clearTimeout(timer)
    timer = undefined
    set('repos')
  }

  async function start(): Promise<SensorStatus> {
    if (off) return sensor.status
    const mine = generation
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      set('absent')
      return 'absent'
    }
    const D = (window as unknown as { DeviceOrientationEvent: IosOrientation }).DeviceOrientationEvent
    if (typeof D.requestPermission === 'function') {
      try {
        const answer = await D.requestPermission()
        if (mine !== generation) return sensor.status // arrêté pendant la demande : on ne branche rien
        if (answer !== 'granted') {
          set('refuse')
          return 'refuse'
        }
      } catch {
        if (mine !== generation) return sensor.status
        set('refuse')
        return 'refuse'
      }
    }
    set('attente')
    let sawAbsolute = false
    const on = (e: Event) => {
      const o = e as OrientationEvt
      const isAbs = e.type === 'deviceorientationabsolute' || o.absolute === true
      if (e.type === 'deviceorientation' && sawAbsolute && !isAbs) return // un cap absolu a déjà été reçu : on ignore le relatif
      let heading: number | undefined
      let absolute = false
      if (typeof o.webkitCompassHeading === 'number' && Number.isFinite(o.webkitCompassHeading)) {
        heading = normDeg(o.webkitCompassHeading)
        absolute = true
      } else if (o.alpha != null && o.beta != null && o.gamma != null) {
        heading = cameraHeadingDeg(o.alpha, o.beta, o.gamma)
        absolute = isAbs
      }
      const pitch = o.beta != null && o.gamma != null ? cameraPitchDeg(o.beta, o.gamma) : undefined
      if (heading === undefined && pitch === undefined) return // événement vide (Chrome en envoie un au départ sans capteur)
      if (isAbs && heading !== undefined) sawAbsolute = true
      sensor.latest = { heading, pitch, absolute, t: Date.now() }
      clearTimeout(timer)
      timer = undefined
      set('ok')
    }
    window.addEventListener('deviceorientationabsolute', on)
    window.addEventListener('deviceorientation', on)
    off = () => {
      window.removeEventListener('deviceorientationabsolute', on)
      window.removeEventListener('deviceorientation', on)
    }
    timer = setTimeout(() => {
      if (sensor.status === 'attente') set('absent')
    }, WAIT_MS)
    return 'attente'
  }
  return sensor
}

/** Le cap lu est-il rapporté au nord ? Utile pour décider d'afficher les noms de plantes. */
export const compassReliable = (r: SensorReading) => r.heading !== undefined && r.absolute
