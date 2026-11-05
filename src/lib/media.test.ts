import { describe, expect, it, vi } from 'vitest'
import { requestCamera, stopStream } from './media'

const fakeStream = () => {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream, stop }
}

describe('requestCamera', () => {
  it('renvoie le flux quand l’écran est encore ouvert', async () => {
    const { stream, stop } = fakeStream()
    expect(await requestCamera(async () => stream, () => true)).toBe(stream)
    expect(stop).not.toHaveBeenCalled()
  })
  it('arrête les pistes du flux reçu quand l’écran a été quitté', async () => {
    const { stream, stop } = fakeStream()
    let alive = true
    const p = requestCamera(async () => { alive = false; return stream }, () => alive)
    expect(await p).toBeUndefined()
    expect(stop).toHaveBeenCalledTimes(2)
  })
  it('laisse passer le refus du navigateur', async () => {
    await expect(requestCamera(async () => { throw new DOMException('non', 'NotAllowedError') }, () => true)).rejects.toThrow('non')
  })
  it('stopStream accepte l’absence de flux', () => {
    expect(() => stopStream(undefined)).not.toThrow()
  })
})
