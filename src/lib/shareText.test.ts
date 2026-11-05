import { describe, expect, it, vi } from 'vitest'
import { canShareText, copyText, shareOrCopy } from './shareText'

describe('shareOrCopy', () => {
  it('utilise le partage du téléphone', async () => {
    const share = vi.fn(async () => undefined)
    expect(await shareOrCopy('texte', 'Titre', { share })).toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Titre', text: 'texte' })
  })
  it('ne copie pas quand la personne ferme la feuille de partage', async () => {
    const writeText = vi.fn(async () => undefined)
    const share = async () => { throw new DOMException('fermé', 'AbortError') }
    expect(await shareOrCopy('t', 'T', { share, writeText })).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })
  it('copie si le partage échoue autrement ou n’existe pas', async () => {
    const writeText = vi.fn(async () => undefined)
    expect(await shareOrCopy('t', 'T', { share: async () => { throw new Error('non') }, writeText })).toBe('copied')
    expect(await shareOrCopy('t', 'T', { writeText })).toBe('copied')
  })
  it('« manual » quand rien ne marche', async () => {
    expect(await shareOrCopy('t', 'T', {})).toBe('manual')
    expect(await shareOrCopy('t', 'T', { writeText: async () => { throw new Error('refusé') } })).toBe('manual')
  })
  it('copyText et canShareText', async () => {
    expect(await copyText('x', { writeText: async () => undefined })).toBe('copied')
    expect(await copyText('x', {})).toBe('manual')
    expect(canShareText({ share: async () => undefined })).toBe(true)
    expect(canShareText({})).toBe(false)
  })
})
