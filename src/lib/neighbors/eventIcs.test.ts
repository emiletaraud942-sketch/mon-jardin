import { describe, expect, it } from 'vitest'
import { icsFold } from '../icsText'
import { buildEventIcs, eventIcsFilename, eventTimes, truncateText, DESCRIPTION_MAX, type IcsEvent } from './eventIcs'

const NOW = new Date('2026-11-10T09:30:15Z')
const EV: IcsEvent = {
  id: '3f2a9c10-0000-4000-8000-000000000001',
  title: 'Atelier de taille des rosiers',
  description: 'Venez avec votre sécateur.',
  startsAt: '2026-11-14T13:00:00Z',
  endsAt: '2026-11-14T15:00:00Z',
  place: 'Jardin partagé, 12 rue des Lilas',
  organizerName: 'Les Jardiniers du quartier',
  signupUrl: 'https://asso.exemple.fr/inscription',
}
const ics = (o: Partial<IcsEvent> = {}, now = NOW) => buildEventIcs({ ...EV, ...o }, now)!
/** Lignes dépliées (RFC 5545 : CRLF + espace = continuation). */
const unfold = (t: string) => t.replace(/\r\n /g, '').split('\r\n')
const prop = (t: string, name: string) => unfold(t).find((l) => l.startsWith(name + ':') || l.startsWith(name + ';'))

describe('fichier .ics d’un événement', () => {
  it('un VCALENDAR avec un seul VEVENT, en CRLF', () => {
    const t = ics()
    expect(t.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(t.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(t.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(t.match(/END:VEVENT/g)).toHaveLength(1)
    expect(t).toContain('VERSION:2.0')
    expect(t.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(t.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
  })

  it('UID stable, DTSTAMP du jour', () => {
    expect(prop(ics(), 'UID')).toBe('UID:event-3f2a9c10-0000-4000-8000-000000000001@permajardin')
    expect(prop(ics({}, new Date('2027-01-01T00:00:00Z')), 'UID')).toBe(prop(ics(), 'UID'))
    expect(prop(ics(), 'DTSTAMP')).toBe('DTSTAMP:20261110T093015Z')
  })

  it('début et fin en UTC (…Z), sans décalage', () => {
    const t = ics()
    expect(prop(t, 'DTSTART')).toBe('DTSTART:20261114T130000Z')
    expect(prop(t, 'DTEND')).toBe('DTEND:20261114T150000Z')
  })

  it('une heure donnée avec un décalage est ramenée en UTC', () => {
    const t = ics({ startsAt: '2026-11-14T14:00:00+01:00', endsAt: '2026-11-14T16:30:00+01:00' })
    expect(prop(t, 'DTSTART')).toBe('DTSTART:20261114T130000Z')
    expect(prop(t, 'DTEND')).toBe('DTEND:20261114T153000Z')
  })

  it('événement à 23 h (heure de Paris) : le jour UTC reste le bon, sans glisser au lendemain', () => {
    // 23 h 00 à Paris en novembre = 22 h 00 UTC, le même jour.
    const t = ics({ startsAt: '2026-11-14T22:00:00Z', endsAt: '2026-11-14T23:30:00Z' })
    expect(prop(t, 'DTSTART')).toBe('DTSTART:20261114T220000Z')
    expect(prop(t, 'DTEND')).toBe('DTEND:20261114T233000Z')
    // En été (UTC+2), 23 h 30 à Paris = 21 h 30 UTC ; 01 h 00 le lendemain à Paris = 23 h UTC la veille.
    const e = ics({ startsAt: '2026-07-14T23:00:00Z', endsAt: '2026-07-15T01:00:00Z' })
    expect(prop(e, 'DTSTART')).toBe('DTSTART:20260714T230000Z')
    expect(prop(e, 'DTEND')).toBe('DTEND:20260715T010000Z')
  })

  it('sans fin valable : 2 h après le début', () => {
    for (const endsAt of ['', 'pas une date', '2026-11-14T13:00:00Z', '2026-11-14T12:00:00Z']) {
      const t = ics({ endsAt })
      expect(prop(t, 'DTEND'), endsAt).toBe('DTEND:20261114T150000Z')
    }
    expect(eventTimes({ startsAt: 'oups', endsAt: '' })).toBeNull()
    expect(buildEventIcs({ ...EV, startsAt: 'oups' }, NOW)).toBeNull()
  })

  it('titre, lieu et description échappés (virgule, point-virgule, retour à la ligne, barre oblique)', () => {
    const t = ics({ title: 'Troc; plantes, graines\\boutures', place: 'Salle A, rue B; Lyon', description: 'Ligne 1\nLigne 2, suite; fin' })
    expect(prop(t, 'SUMMARY')).toBe('SUMMARY:Troc\\; plantes\\, graines\\\\boutures')
    expect(prop(t, 'LOCATION')).toBe('LOCATION:Salle A\\, rue B\\; Lyon')
    const d = prop(t, 'DESCRIPTION')!
    expect(d).toContain('Ligne 1\\nLigne 2\\, suite\\; fin')
    expect(d).not.toContain('\n')
  })

  it('un retour chariot seul ou un caractère de contrôle ne peut pas ouvrir une nouvelle propriété', () => {
    const t = ics({ title: 'Atelier\rATTENDEE:mailto:x@y.fr', description: 'a\u0000b‮c\rBEGIN:VALARM' })
    expect(unfold(t).some((l) => l.startsWith('ATTENDEE'))).toBe(false)
    expect(unfold(t).filter((l) => l === 'BEGIN:VALARM')).toHaveLength(2)
    expect(t).not.toMatch(/[\u0000\u202e]/)
    expect(t).not.toMatch(/\r(?!\n)/)
  })

  it('les émojis passent, et ne sont jamais coupés en deux par le pliage', () => {
    const title = 'Semis 🌱 des tomates 🍅 '.repeat(8) + 'fin'
    const t = ics({ title })
    for (const l of t.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    expect(prop(t, 'SUMMARY')).toBe('SUMMARY:' + title.replace(/,/g, '\\,'))
    expect(t).not.toContain('�')
  })

  it('toutes les lignes tiennent en 75 octets (UTF-8)', () => {
    const long = ics({ description: 'é'.repeat(900), place: 'Lieu très long, '.repeat(20), title: 'Titre '.repeat(40) })
    for (const l of long.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
    // Le pliage de la brique commune est celui utilisé.
    expect(icsFold('x'.repeat(200)).split('\r\n ').length).toBeGreaterThan(2)
  })

  it('description : organisateur, texte tronqué à 500 caractères, lien, mention de vérification', () => {
    const d = prop(ics({ description: 'mot '.repeat(400) }), 'DESCRIPTION')!
    expect(d).toContain('Organisé par Les Jardiniers du quartier')
    expect(d).toContain('Inscription : https://asso.exemple.fr/inscription')
    expect(d.endsWith('Vérifiez les modalités auprès de l’organisateur.')).toBe(true)
    const body = d.split('\\n\\n')[1]
    expect(Array.from(body).length).toBeLessThanOrEqual(DESCRIPTION_MAX + 1)
    expect(body.endsWith('…')).toBe(true)
  })

  it('texte court : pas de coupe ; sans description ni lien : seulement l’organisateur et la mention', () => {
    expect(truncateText('court')).toBe('court')
    const d = prop(ics({ description: '', signupUrl: null }), 'DESCRIPTION')!
    expect(d).toBe('DESCRIPTION:Organisé par Les Jardiniers du quartier\\n\\nVérifiez les modalités auprès de l’organisateur.')
  })

  it('URL : le lien https valide seulement ; http, javascript et autres sont refusés partout', () => {
    expect(prop(ics(), 'URL')).toBe('URL:https://asso.exemple.fr/inscription')
    for (const bad of ['http://asso.exemple.fr/x', 'javascript:alert(1)', 'https://user:pw@asso.exemple.fr/', 'https://192.168.0.1/x', 'ftp://asso.exemple.fr', null]) {
      const t = ics({ signupUrl: bad })
      expect(prop(t, 'URL'), String(bad)).toBeUndefined()
      expect(unfold(t).join('\n'), String(bad)).not.toContain('Inscription :')
    }
  })

  it('deux alarmes d’affichage : la veille et une heure avant', () => {
    const t = ics()
    expect(t.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(t).toContain('TRIGGER:-P1D')
    expect(t).toContain('TRIGGER:-PT1H')
    expect(t.match(/ACTION:DISPLAY/g)).toHaveLength(2)
    expect(t).toContain('DESCRIPTION:Demain : Atelier de taille des rosiers')
    expect(t).toContain('DESCRIPTION:Dans une heure : Atelier de taille des rosiers')
    // Les alarmes sont dans le VEVENT.
    expect(t.indexOf('BEGIN:VALARM')).toBeGreaterThan(t.indexOf('BEGIN:VEVENT'))
    expect(t.lastIndexOf('END:VALARM')).toBeLessThan(t.indexOf('END:VEVENT'))
  })

  it('aucune donnée personnelle : seuls les champs publics de l’événement sont repris', () => {
    const t = ics()
    for (const w of ['pseudo', 'cell', 'lat', 'lon', 'mailto:', 'ATTENDEE', 'ORGANIZER']) expect(t.toLowerCase()).not.toContain(w.toLowerCase())
  })
})

describe('nom du fichier', () => {
  it('sans accent ni caractère dangereux', () => {
    expect(eventIcsFilename('Atelier de taille des rosiers')).toBe('evenement-atelier-de-taille-des-rosiers.ics')
    expect(eventIcsFilename('Œufs & café : été 2026 !')).toBe('evenement-oeufs-cafe-ete-2026.ics')
    expect(eventIcsFilename('../../etc/passwd')).toBe('evenement-etc-passwd.ics')
    expect(eventIcsFilename('a\\b/c:d*e?f"g<h>i|j')).toBe('evenement-a-b-c-d-e-f-g-h-i-j.ics')
  })
  it('court, avec un repli quand le titre n’a aucune lettre', () => {
    expect(eventIcsFilename('x'.repeat(200)).length).toBeLessThanOrEqual('evenement-.ics'.length + 40)
    expect(eventIcsFilename('🌱🌱')).toBe('evenement-rendez-vous.ics')
    expect(eventIcsFilename('')).toBe('evenement-rendez-vous.ics')
    for (const t of ['A B', '..', 'con.', 'nul', 'a'.repeat(100)]) expect(eventIcsFilename(t)).toMatch(/^evenement-[a-z0-9-]+\.ics$/)
  })
})
