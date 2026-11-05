import { describe, expect, it } from 'vitest'
import { createAnnouncer, describeAhead, formatAhead, formatDistance, gotoItems, minimapProjection, parseHopPref } from './walkNav'

const bounds = { minX: -20, maxX: 20, minY: -15, maxY: 15 }

describe('mini-carte cliquable', () => {
  it('toPx et fromPx sont inverses', () => {
    const m = minimapProjection(bounds, 260)
    for (const p of [{ x: 0, y: 0 }, { x: 10, y: -7 }, { x: -12, y: 9 }]) {
      const [px, py] = m.toPx(p)
      const q = m.fromPx(px, py)!
      expect(q.x).toBeCloseTo(p.x, 6)
      expect(q.y).toBeCloseTo(p.y, 6)
    }
  })
  it('le nord est en haut, l’est à droite', () => {
    const m = minimapProjection(bounds, 100)
    const c = m.toPx({ x: 0, y: 0 })
    const n = m.toPx({ x: 0, y: 5 })
    const e = m.toPx({ x: 5, y: 0 })
    expect(n[1]).toBeLessThan(c[1])
    expect(e[0]).toBeGreaterThan(c[0])
  })
  it('un toucher hors du disque ne donne rien', () => {
    const m = minimapProjection(bounds, 100)
    expect(m.fromPx(1, 1)).toBeNull()
    expect(m.fromPx(50, 50)).not.toBeNull()
  })
})

describe('liste « Aller à »', () => {
  const plants = [
    { id: 'a', label: 'Pommier', x: 5, y: 0 },
    { id: 'b', label: 'Thym', x: 1, y: 1 },
    { id: 'c', label: 'Chêne', x: 30, y: 0 },
    { id: 'd', label: 'Sauge', x: 2, y: -2 },
  ]
  it('points de photos d’abord, puis les plantes les plus proches', () => {
    const items = gotoItems({ x: 0, y: 0 }, plants, [{ id: 'pv1', label: 'Point photo 1', x: -5, y: 5 }], 2)
    expect(items.map((i) => i.id)).toEqual(['pv1', 'b', 'd'])
    expect(items[0].kind).toBe('photo')
    expect(items[1].distM).toBeCloseTo(Math.SQRT2, 6)
  })
  it('une plante : on se place à 3 m, du côté du promeneur, en la regardant', () => {
    const [it] = gotoItems({ x: 10, y: 0 }, [{ id: 'a', label: 'Pommier', x: 0, y: 0 }], [])
    expect(it.stand.x).toBeCloseTo(3, 6)
    expect(it.stand.y).toBeCloseTo(0, 6)
    expect(it.look).toEqual({ x: 0, y: 0 })
  })
  it('ignore les positions invalides, et formate les distances', () => {
    const items = gotoItems({ x: 0, y: 0 }, [{ id: 'x', label: 'X', x: NaN, y: 0 }], [{ id: 'p', label: 'P', x: 1, y: Infinity }])
    expect(items).toHaveLength(0)
    expect(formatDistance(3.4)).toBe('3 m')
    expect(formatDistance(23)).toBe('25 m')
  })
})

describe('lecture vocale : ce qu’on a devant soi', () => {
  const t = [
    { id: 'a', label: 'Pommier', x: 0, y: 3 },
    { id: 'b', label: 'Thym', x: 5, y: 0 },
    { id: 'c', label: 'Chêne', x: 0, y: 40 },
  ]
  it('« devant vous, à 3 m : Pommier »', () => {
    const a = describeAhead({ x: 0, y: 0 }, 0, t)!
    expect(a.id).toBe('a')
    expect(formatAhead(a)).toBe('devant vous, à 3 m : Pommier')
  })
  it('ne retient que ce qui est dans le cône et à portée', () => {
    expect(describeAhead({ x: 0, y: 0 }, Math.PI, t)).toBeUndefined() // dos au nord
    expect(describeAhead({ x: 0, y: 0 }, -Math.PI / 2, t)!.id).toBe('b') // face à l'est
    expect(describeAhead({ x: 0, y: 20 }, 0, [t[2]], { rangeM: 15 })).toBeUndefined() // trop loin
  })
  it('très près : « tout près »', () => {
    const a = describeAhead({ x: 0, y: 2.2 }, 0, t)!
    expect(formatAhead(a)).toBe('devant vous, tout près : Pommier')
  })
  it('au plus une annonce toutes les 2 s, jamais deux fois le même texte', () => {
    const an = createAnnouncer(2000)
    expect(an.next('devant vous, à 3 m : Pommier', 1000)).toBe('devant vous, à 3 m : Pommier')
    expect(an.next('devant vous, à 3 m : Pommier', 5000)).toBeUndefined() // identique
    expect(an.next('devant vous, à 2 m : Pommier', 1500)).toBeUndefined() // trop tôt
    expect(an.next('devant vous, à 2 m : Pommier', 3100)).toBe('devant vous, à 2 m : Pommier')
    // rien devant, puis le même texte : réannoncé (après le délai)
    expect(an.next(undefined, 4000)).toBeUndefined()
    expect(an.next('devant vous, à 2 m : Pommier', 4500)).toBeUndefined() // 1,4 s après la dernière
    expect(an.next('devant vous, à 2 m : Pommier', 5200)).toBe('devant vous, à 2 m : Pommier')
  })
  it('sur 20 s de marche, jamais plus de 10 annonces (une toutes les 2 s)', () => {
    const an = createAnnouncer(2000)
    let n = 0
    for (let ms = 0; ms < 20000; ms += 250) if (an.next(`devant vous, à ${(ms / 250) % 7} m : X`, ms)) n++
    expect(n).toBeLessThanOrEqual(10)
  })
})

describe('mouvement réduit : préférence', () => {
  it('le choix enregistré l’emporte, sinon le réglage du système', () => {
    expect(parseHopPref('1', false)).toBe(true)
    expect(parseHopPref('0', true)).toBe(false)
    expect(parseHopPref(null, true)).toBe(true)
    expect(parseHopPref(undefined, false)).toBe(false)
    expect(parseHopPref('n’importe quoi', true)).toBe(true)
  })
})
