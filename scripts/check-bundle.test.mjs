import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { entryChunkFromHtml, findChunk, gzipSize, ko, overBudget, precacheUrls } from './bundle-size.mjs'

describe('mesure du bundle', () => {
  it('gzipSize mesure la taille compressée, pas la taille brute', () => {
    const buf = Buffer.from('abc'.repeat(10_000))
    expect(gzipSize(buf)).toBe(gzipSync(buf, { level: 9 }).length)
    expect(gzipSize(buf)).toBeLessThan(buf.length / 20)
  })

  it('trouve le chunk d\'entrée dans index.html', () => {
    const html = '<link rel="modulepreload" href="/assets/react-A.js"><script type="module" crossorigin src="/assets/index-Xy_1.js"></script>'
    expect(entryChunkFromHtml(html)).toBe('assets/index-Xy_1.js')
    expect(entryChunkFromHtml('<script src="/a.js"></script>')).toBeNull()
  })

  it('lit la liste de précache de Workbox', () => {
    const sw = 'x;s.precacheAndRoute([{url:"index.html",revision:"a"},{url:"assets/a-1.js",revision:null}],{}),s.cleanup()'
    expect(precacheUrls(sw)).toEqual(['index.html', 'assets/a-1.js'])
    expect(precacheUrls('rien')).toEqual([])
  })

  it('distingue three et maplibre de leurs voisins', () => {
    const files = ['assets/maplibre-gl-worker-Dro7.js', 'assets/maplibre--S9o.js', 'assets/three-Dv6_.js', 'assets/View3D-CB.js']
    expect(findChunk(files, 'three')).toBe('assets/three-Dv6_.js')
    expect(findChunk(files, 'maplibre')).toBe('assets/maplibre--S9o.js')
    expect(findChunk(['assets/a.js'], 'three')).toBeNull()
  })

  it('signale seulement les dépassements', () => {
    const rows = [{ label: 'a', bytes: 10, limit: 10 }, { label: 'b', bytes: 11, limit: 10 }]
    expect(overBudget(rows).map((r) => r.label)).toEqual(['b'])
    expect(ko(247_700)).toBe('247.7 Ko')
  })
})
