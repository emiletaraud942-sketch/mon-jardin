import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSensor } from './sensors'

// Faux navigateur : un iPhone dont la demande d'autorisation de la boussole reste en attente tant qu'on ne la résout pas.
function iphone() {
  const listeners = new Set<string>()
  let answer!: (r: 'granted' | 'denied') => void
  class FakeOrientation {
    static requestPermission() {
      return new Promise<'granted' | 'denied'>((res) => (answer = res))
    }
  }
  vi.stubGlobal('window', {
    DeviceOrientationEvent: FakeOrientation,
    addEventListener: (t: string) => listeners.add(t),
    removeEventListener: (t: string) => listeners.delete(t),
  })
  return { listeners, answer: (r: 'granted' | 'denied') => answer(r) }
}

afterEach(() => vi.unstubAllGlobals())

describe('createSensor : sortie pendant la demande d’autorisation', () => {
  it('une réponse « accordée » arrivée après l’arrêt ne branche aucun écouteur', async () => {
    const env = iphone()
    const sensor = createSensor()
    const pending = sensor.start()
    sensor.stop() // l'écran est quitté pendant la demande
    env.answer('granted')
    await pending
    expect(env.listeners.size).toBe(0)
    expect(sensor.status).toBe('repos')
  })

  it('sans sortie, la réponse accordée branche la boussole', async () => {
    const env = iphone()
    const sensor = createSensor()
    const pending = sensor.start()
    env.answer('granted')
    expect(await pending).toBe('attente')
    expect(env.listeners.size).toBe(2)
    sensor.stop()
    expect(env.listeners.size).toBe(0)
  })

  it('refus après arrêt : le statut ne repasse pas à « refusé »', async () => {
    const env = iphone()
    const sensor = createSensor()
    const pending = sensor.start()
    sensor.stop()
    env.answer('denied')
    await pending
    expect(sensor.status).toBe('repos')
  })
})
