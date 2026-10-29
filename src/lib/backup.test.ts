import { describe, expect, it } from 'vitest'
import { shouldRemindExport } from './backup'

const DAY = 86400000
const now = Date.UTC(2026, 9, 18)

describe('shouldRemindExport', () => {
  it('jamais sans données', () => {
    expect(shouldRemindExport({ now, hasData: false, firstUse: now - 90 * DAY })).toBe(false)
  })
  it('pas pendant les 30 premiers jours', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 10 * DAY })).toBe(false)
  })
  it('après 30 jours sans export', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 31 * DAY })).toBe(true)
  })
  it('un export récent repousse le rappel', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 200 * DAY, lastExport: now - 5 * DAY })).toBe(false)
  })
  it('un seul rappel par mois', () => {
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 90 * DAY, lastReminder: now - 3 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, firstUse: now - 90 * DAY, lastReminder: now - 40 * DAY })).toBe(true)
  })
  it('sans point de départ, pas de rappel', () => {
    expect(shouldRemindExport({ now, hasData: true })).toBe(false)
  })
})

describe('premier rappel plus tôt quand il y a déjà du travail (3 plantes ou plus, jamais sauvegardé)', () => {
  const DAY = 86400000
  const now = 100 * DAY
  it('rappelle après 2 jours, pas avant', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 1 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 2 * DAY })).toBe(true)
  })
  it('pas avant 3 plantes : l’ancienne règle de 30 jours s’applique', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 2, firstUse: now - 5 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 2, firstUse: now - 31 * DAY })).toBe(true)
  })
  it('puis une fois par semaine tant qu’il n’y a pas de sauvegarde', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 20 * DAY, lastReminder: now - 3 * DAY })).toBe(false)
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, firstUse: now - 20 * DAY, lastReminder: now - 8 * DAY })).toBe(true)
  })
  it('jamais si une sauvegarde existe déjà (règle des 30 jours)', () => {
    expect(shouldRemindExport({ now, hasData: true, plantCount: 5, lastExport: now - 3 * DAY, firstUse: now - 20 * DAY })).toBe(false)
  })
})

import { afterEach, vi } from 'vitest'
import { canShareFile, deviceKind, saveBackupBlob, saveOutcomeText, shareFile } from './backup'

describe('deviceKind', () => {
  it('reconnaît iPhone, iPad « en Mac », Android et ordinateur', () => {
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios') // iPad qui se dit Mac
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('bureau')
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android')
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/130')).toBe('bureau')
  })
})

describe('saveOutcomeText', () => {
  const o = { how: 'telecharge' as const, name: 'permajardin-2026-10-28.json' }
  it('dit où est le fichier selon l’appareil, avec son nom', () => {
    expect(saveOutcomeText(o, 'ios')).toMatch(/appli Fichiers.*Téléchargements.*Sur mon iPhone/)
    expect(saveOutcomeText(o, 'android')).toMatch(/appli Fichiers, dossier Téléchargements/)
    expect(saveOutcomeText(o, 'bureau')).toMatch(/dossier Téléchargements de l’ordinateur/)
    for (const d of ['ios', 'android', 'bureau'] as const) expect(saveOutcomeText(o, d)).toContain('permajardin-2026-10-28.json')
  })
  it('partage réussi, partage annulé : phrases claires, jamais plus de 20 mots', () => {
    expect(saveOutcomeText({ ...o, how: 'partage' }, 'ios')).toMatch(/choisie/)
    expect(saveOutcomeText({ ...o, how: 'annule' }, 'ios')).toMatch(/rien n’a été enregistré/)
    for (const how of ['telecharge', 'partage', 'annule'] as const) {
      for (const d of ['ios', 'android', 'bureau'] as const) {
        for (const sentence of saveOutcomeText({ ...o, how }, d).split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20)
      }
    }
  })
})

describe('partage et téléchargement', () => {
  afterEach(() => vi.unstubAllGlobals())
  const file = () => new File(['x'], 'a.json', { type: 'application/json' })
  const stubNav = (nav: Record<string, unknown>) => vi.stubGlobal('navigator', nav)
  const stubDoc = () => {
    const clicks: string[] = []
    vi.stubGlobal('document', { createElement: () => ({ click: () => clicks.push('clic'), remove: () => undefined, style: {} }), body: { appendChild: () => undefined } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    return clicks
  }

  it('canShareFile : faux sans navigator.share ou si canShare refuse', () => {
    stubNav({})
    expect(canShareFile(file())).toBe(false)
    stubNav({ share: () => undefined, canShare: () => false })
    expect(canShareFile(file())).toBe(false)
    stubNav({ share: () => undefined, canShare: () => true })
    expect(canShareFile(file())).toBe(true)
  })
  it('shareFile : partagé, annulé par l’utilisateur, refusé par le navigateur', async () => {
    stubNav({ share: async () => undefined })
    expect(await shareFile(file())).toBe('partage')
    stubNav({ share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } })
    expect(await shareFile(file())).toBe('annule')
    stubNav({ share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) } })
    expect(await shareFile(file())).toBe('refuse')
  })
  it('téléphone : partage d’abord ; annulé = rien n’est téléchargé dans le dos de la personne', async () => {
    const clicks = stubDoc()
    stubNav({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) } })
    const out = await saveBackupBlob(new Blob(['{}']), 'permajardin.json', { share: true })
    expect(out.how).toBe('annule')
    expect(clicks).toEqual([])
  })
  it('téléphone : le navigateur refuse le partage (geste trop ancien) → téléchargement', async () => {
    const clicks = stubDoc()
    stubNav({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5, canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }) } })
    const out = await saveBackupBlob(new Blob(['{}']), 'permajardin.json', { share: true })
    expect(out.how).toBe('telecharge')
    expect(clicks).toEqual(['clic'])
  })
  it('ordinateur : téléchargement direct, sans menu Partager', async () => {
    const clicks = stubDoc()
    const share = vi.fn()
    stubNav({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0, canShare: () => true, share })
    const out = await saveBackupBlob(new Blob(['{}']), 'permajardin.json', { share: true })
    expect(out.how).toBe('telecharge')
    expect(share).not.toHaveBeenCalled()
    expect(clicks).toEqual(['clic'])
  })
})
