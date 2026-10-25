import { describe, expect, it, vi } from 'vitest'
import { INVITE_TEXT, INVITE_TITLE, inviteCopyText, inviteMessage, invitePayload, inviteUrl, runInvite } from './invite'

describe('lien d’invitation', () => {
  it('garde l’adresse du site seulement', () => {
    expect(inviteUrl('https://permajardin.vercel.app')).toBe('https://permajardin.vercel.app/')
    expect(inviteUrl('http://localhost:5173')).toBe('http://localhost:5173/')
  })
  it('refuse ce qui n’est pas une adresse web', () => {
    for (const bad of ['', undefined, null, 'null', 'file:///x', 'javascript:alert(1)', 'pas une adresse']) expect(inviteUrl(bad as string)).toBe('')
  })
  it('n’emporte ni chemin, ni paramètre, ni identifiant', () => {
    expect(inviteUrl('https://exemple.fr/entraide?token=abc#secret')).toBe('https://exemple.fr/')
  })
})

describe('texte d’invitation', () => {
  it('est neutre : aucun pseudo, adresse, quartier ni jardin, et une phrase courte', () => {
    const all = [INVITE_TITLE, INVITE_TEXT, inviteCopyText('https://exemple.fr')].join(' ')
    expect(all).not.toMatch(/@|\d{5}|pseudo|quartier|adresse|jardin de/i)
    for (const s of INVITE_TEXT.split(/(?<=[.!?])\s+/)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(20)
  })
  it('ne dépend d’aucune donnée de l’utilisateur', () => {
    expect(invitePayload('https://exemple.fr')).toEqual({ title: 'PermaJardin', text: INVITE_TEXT, url: 'https://exemple.fr/' })
    expect(invitePayload.length).toBe(1)
  })
  it('le texte copié contient le lien', () => {
    expect(inviteCopyText('https://exemple.fr')).toBe(`${INVITE_TEXT} https://exemple.fr/`)
    expect(inviteCopyText('')).toBe(INVITE_TEXT)
  })
})

describe('envoi de l’invitation', () => {
  const origin = 'https://exemple.fr'
  it('utilise le partage du téléphone quand il existe', async () => {
    const share = vi.fn(async () => undefined)
    const writeText = vi.fn(async () => undefined)
    expect(await runInvite({ origin, share, writeText })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'PermaJardin', text: INVITE_TEXT, url: 'https://exemple.fr/' })
    expect(writeText).not.toHaveBeenCalled()
  })
  it('fermer la feuille de partage n’est pas une erreur et ne copie rien', async () => {
    const share = vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })))
    const writeText = vi.fn(async () => undefined)
    expect(await runInvite({ origin, share, writeText })).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })
  it('copie le lien sans partage', async () => {
    const writeText = vi.fn(async () => undefined)
    expect(await runInvite({ origin, writeText })).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(`${INVITE_TEXT} https://exemple.fr/`)
  })
  it('copie le lien si le partage échoue autrement', async () => {
    const share = vi.fn(async () => Promise.reject(new Error('NotAllowedError')))
    const writeText = vi.fn(async () => undefined)
    expect(await runInvite({ origin, share, writeText })).toBe('copied')
  })
  it('montre le lien à copier à la main quand tout échoue', async () => {
    expect(await runInvite({ origin })).toBe('manual')
    expect(await runInvite({ origin, writeText: async () => Promise.reject(new Error('refusé')) })).toBe('manual')
  })
  it('chaque résultat a une phrase, sauf l’annulation', () => {
    expect(inviteMessage('cancelled')).toBe('')
    for (const r of ['shared', 'copied', 'manual'] as const) expect(inviteMessage(r).length).toBeGreaterThan(10)
  })
})
