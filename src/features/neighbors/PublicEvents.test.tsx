import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicEvent } from '../../lib/neighbors/api'
import { sentencesOf, wordCount, MAX_WORDS } from '../../lib/sentences'
import { PUBLIC_EVENTS_EMPTY, PUBLIC_EVENTS_ERROR, PUBLIC_EVENTS_NOTE, PUBLIC_EVENTS_SHOWN, PUBLIC_EVENTS_TITLE, PublicEventsList } from './PublicEvents'

const ev = (i: number): PublicEvent => ({ title: `Atelier ${i}`, startsAt: '2026-11-14T14:00:00Z', endsAt: '2026-11-14T16:00:00Z', place: `Salle ${i}`, organizerName: 'Les Jardiniers' })
const html = (n: number) => renderToStaticMarkup(createElement(PublicEventsList, { events: Array.from({ length: n }, (_, i) => ev(i + 1)) }))

describe('événements sans compte : liste', () => {
  it('titre, note qui renvoie à la connexion, repère data-feat="evenements"', () => {
    const h = html(1)
    expect(h).toContain(PUBLIC_EVENTS_TITLE)
    expect(h).toContain('data-feat="evenements"')
    expect(h).toContain('connectez-vous ci-dessus')
  })
  it('une carte par événement : titre, date en lettres, lieu, organisateur', () => {
    const h = html(1)
    expect(h).toContain('Atelier 1')
    expect(h).toContain('Salle 1')
    expect(h).toContain('Les Jardiniers')
    expect(h).toMatch(/14 novembre|samedi/i)
    expect(h).toContain('Organisé par')
  })
  it('aucun bouton d’action avant la connexion : ni inscription, ni « Je suis intéressé(e) », ni signalement, ni partage', () => {
    const h = html(5)
    expect(h).not.toMatch(/<button/)
    expect(h).not.toMatch(/Je suis intéressé|S’inscrire|Signaler|Partager|calendrier/)
    expect(h).not.toMatch(/<a /)
  })
  it(`les ${PUBLIC_EVENTS_SHOWN} premiers sont visibles, les autres dans un repli compté`, () => {
    const h = html(5)
    expect(h.match(/<li /g)).toHaveLength(5)
    expect(h).toContain('<details')
    expect(h).toContain('Voir les 2 autres événements')
    expect(h.indexOf('<details')).toBeGreaterThan(h.indexOf(`Atelier ${PUBLIC_EVENTS_SHOWN}`))
    expect(h.indexOf('<details')).toBeLessThan(h.indexOf(`Atelier ${PUBLIC_EVENTS_SHOWN + 1}`))
  })
  it('un seul événement de plus : « l’autre événement » ; pas de repli s’il n’y en a pas plus que le seuil', () => {
    expect(html(PUBLIC_EVENTS_SHOWN + 1)).toContain('Voir l’autre événement')
    expect(html(PUBLIC_EVENTS_SHOWN)).not.toContain('<details')
  })
  it('liste vide : une phrase, pas de carte', () => {
    const h = html(0)
    expect(h).toContain(PUBLIC_EVENTS_EMPTY)
    expect(h).not.toContain('<li')
  })
  it('un titre qui contient du HTML est écrit tel quel, jamais interprété', () => {
    const h = renderToStaticMarkup(createElement(PublicEventsList, { events: [{ ...ev(1), title: '<img src=x onerror=alert(1)>' }] }))
    expect(h).not.toContain('<img')
    expect(h).toContain('&lt;img')
  })
  it('les phrases affichées font 20 mots au plus', () => {
    for (const s of [PUBLIC_EVENTS_NOTE, PUBLIC_EVENTS_EMPTY, PUBLIC_EVENTS_ERROR]) for (const p of sentencesOf(s)) expect(wordCount(p), p).toBeLessThanOrEqual(MAX_WORDS)
  })
})

describe('événements sans compte : place dans l’écran', () => {
  const page = readFileSync(new URL('./NeighborsPage.tsx', import.meta.url), 'utf8')
  it('placés sous la connexion, seulement sans compte et après l’accord', () => {
    expect(page).toMatch(/<SignIn online=\{online\} \/>\s*<PublicEvents garden=\{garden\} online=\{online\} \/>/)
    // « Connected » n'est rendu qu'une fois l'accord donné.
    expect(page).toMatch(/voisins \? \(\s*<Connected garden=\{garden\} \/>/)
  })
  it('n’envoie que la grande cellule du jardin et se tait quand la base n’a pas la v10', () => {
    const src = readFileSync(new URL('./PublicEvents.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/roundCell\(lat, lon, 'large'\)/)
    expect(src).toMatch(/e\.code === 'not_open'\) return null/)
    expect(src).toMatch(/valid && online/)
  })
})
