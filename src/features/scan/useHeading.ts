import { useCallback, useEffect, useState } from 'react'
import { headingFromEvent } from './capture'

type IosOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

/** Boussole du téléphone (optionnelle). `supported` est faux si l'appareil n'a pas de capteur d'orientation. */
export function useHeading(enabled: boolean) {
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  const [heading, setHeading] = useState<number>()
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!enabled || !supported) return
    const on = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number }
      const h = headingFromEvent({ alpha: o.alpha, absolute: o.absolute || e.type === 'deviceorientationabsolute', webkitCompassHeading: o.webkitCompassHeading })
      if (h !== undefined) setHeading(h)
    }
    window.addEventListener('deviceorientationabsolute', on)
    window.addEventListener('deviceorientation', on)
    return () => {
      window.removeEventListener('deviceorientationabsolute', on)
      window.removeEventListener('deviceorientation', on)
    }
  }, [enabled, supported])

  /** iPhone : l'accès aux capteurs se demande après un toucher. Ailleurs : toujours accordé. */
  const request = useCallback(async () => {
    const D = (window as unknown as { DeviceOrientationEvent?: IosOrientation }).DeviceOrientationEvent
    if (typeof D?.requestPermission === 'function') {
      try {
        const r = await D.requestPermission()
        setDenied(r !== 'granted')
        return r === 'granted'
      } catch {
        setDenied(true)
        return false
      }
    }
    return true
  }, [])

  return { supported, heading, denied, request }
}
