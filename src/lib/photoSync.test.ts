import { describe, expect, it } from 'vitest'
import { objectName, photoIdOfFile, planPhotoSync, wantedPhotoIds, type RemotePhoto } from './photoSync'

const U = '11111111-2222-3333-4444-555555555555'
const MB = 1024 * 1024
const r = (o: Record<string, RemotePhoto>) => new Map(Object.entries(o))
const l = (o: Record<string, number>) => new Map(Object.entries(o))

describe('noms de fichiers en ligne', () => {
  it('un fichier par photo, dans le dossier de l’utilisateur', () => {
    expect(objectName(U, 'photo:abc123')).toBe(`${U}/abc123.jpg`)
    expect(photoIdOfFile('abc123.jpg')).toBe('photo:abc123')
  })
  it('un identifiant ou un dossier invalide n’a pas de nom (jamais de chemin forgé)', () => {
    expect(objectName(U, 'photo:../x')).toBeUndefined()
    expect(objectName(U, 'abc')).toBeUndefined()
    expect(objectName('../autre', 'photo:abc')).toBeUndefined()
    expect(objectName('', 'photo:abc')).toBeUndefined()
    expect(photoIdOfFile('../abc.jpg')).toBeUndefined()
    expect(photoIdOfFile('abc.png')).toBeUndefined()
    expect(photoIdOfFile('a/b.jpg')).toBeUndefined()
  })
})

describe('photos que les données référencent', () => {
  it('celles des plantes d’abord, puis les points de vue ; sans doublon ni identifiant invalide', () => {
    const ids = wantedPhotoIds(
      [{ photos: ['photo:a', 'photo:b'] }, { photos: ['photo:a', 'mauvais'] }],
      [{ panoramas: [{ shots: [{ photoId: 'photo:c' }, { photoId: 'photo:b' }] }] }] as never,
    )
    expect(ids).toEqual(['photo:a', 'photo:b', 'photo:c'])
  })
})

describe('plan de synchronisation', () => {
  it('envoie ce qui manque en ligne, récupère ce qui manque ici, ne touche pas au reste', () => {
    const p = planPhotoSync({
      wanted: ['photo:a', 'photo:b', 'photo:c', 'photo:d'],
      local: l({ 'photo:a': MB, 'photo:b': MB }),
      remote: r({ 'photo:b': { size: MB }, 'photo:c': { size: MB } }),
    })
    expect(p.upload).toEqual(['photo:a'])
    expect(p.download).toEqual(['photo:c'])
    expect(p.skipped).toEqual([])
    expect(p.orphans).toEqual([])
  })
  it('une photo absente partout (perdue) n’est ni envoyée ni récupérée', () => {
    const p = planPhotoSync({ wanted: ['photo:z'], local: l({}), remote: r({}) })
    expect(p).toEqual({ upload: [], download: [], skipped: [], orphans: [] })
  })
  it('la place en ligne est limitée : les photos des plantes passent avant, le reste reste sur l’appareil', () => {
    const p = planPhotoSync({
      wanted: ['photo:a', 'photo:b', 'photo:c'],
      local: l({ 'photo:a': 3 * MB, 'photo:b': 3 * MB, 'photo:c': 3 * MB }),
      remote: r({}),
      capBytes: 7 * MB,
    })
    expect(p.upload).toEqual(['photo:a', 'photo:b'])
    expect(p.skipped).toEqual(['photo:c'])
  })
  it('la place déjà prise en ligne compte (y compris les photos d’autres appareils)', () => {
    const p = planPhotoSync({
      wanted: ['photo:a'],
      local: l({ 'photo:a': 2 * MB }),
      remote: r({ 'photo:x': { size: 9 * MB, createdAt: Date.now() } }),
      capBytes: 10 * MB,
    })
    expect(p.skipped).toEqual(['photo:a'])
  })
  it('une photo trop lourde (> 4 Mo) reste sur l’appareil', () => {
    const p = planPhotoSync({ wanted: ['photo:a'], local: l({ 'photo:a': 5 * MB }), remote: r({}) })
    expect(p.upload).toEqual([])
    expect(p.skipped).toEqual(['photo:a'])
  })
  it('les orphelines ne sont effacées qu’après 7 jours, jamais si la date est inconnue', () => {
    const now = Date.parse('2026-11-11T12:00:00Z')
    const day = 24 * 3600 * 1000
    const p = planPhotoSync({
      wanted: ['photo:a'],
      local: l({ 'photo:a': MB }),
      remote: r({
        'photo:a': { size: MB, createdAt: now - 30 * day },
        'photo:vieille': { size: MB, createdAt: now - 8 * day },
        'photo:recente': { size: MB, createdAt: now - 1 * day },
        'photo:inconnue': { size: MB },
      }),
      now,
    })
    expect(p.orphans).toEqual(['photo:vieille'])
  })
  it('une photo référencée n’est jamais effacée, même ancienne', () => {
    const now = Date.now()
    const p = planPhotoSync({ wanted: ['photo:a'], local: l({}), remote: r({ 'photo:a': { size: MB, createdAt: now - 365 * 24 * 3600 * 1000 } }), now })
    expect(p.orphans).toEqual([])
    expect(p.download).toEqual(['photo:a'])
  })
  it('déterministe et sans doublon', () => {
    const args = { wanted: ['photo:a', 'photo:a'], local: l({ 'photo:a': MB }), remote: r({}) }
    expect(planPhotoSync(args)).toEqual(planPhotoSync(args))
    expect(planPhotoSync(args).upload).toEqual(['photo:a'])
  })
})
