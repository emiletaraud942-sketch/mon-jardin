import { describe, expect, it } from 'vitest'
import { buildEventShareText, eventShareTitle, type ShareEvent } from './eventShare'
import { ORGANIZER_INVITE_SENTENCES, organizerInviteText } from './organizerInvite'

const EV: ShareEvent = {
  title: 'Atelier de taille des rosiers',
  startsAt: '2026-11-14T13:00:00Z',
  endsAt: '2026-11-14T15:00:00Z',
  place: 'Jardin partagé, 12 rue des Lilas',
  organizerName: 'Les Jardiniers du quartier',
  signupUrl: 'https://asso.exemple.fr/inscription',
}
const PARIS = 'Europe/Paris'
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('texte de partage d’un événement', () => {
  it('titre, date en lettres, lieu, organisateur, lien d’inscription, adresse de l’appli', () => {
    const t = buildEventShareText(EV, 'https://permajardin.example/accueil?x=1#y', PARIS)
    expect(t).toBe(
      [
        'Atelier de taille des rosiers',
        'Quand : samedi 14 novembre 2026, de 14 h 00 à 16 h 00',
        'Où : Jardin partagé, 12 rue des Lilas',
        'Organisé par Les Jardiniers du quartier',
        'Inscription : https://asso.exemple.fr/inscription',
        '',
        'Trouvé dans l’appli PermaJardin : https://permajardin.example/',
      ].join('\n'),
    )
  })

  it('sans adresse publique : pas de mention de l’appli', () => {
    for (const origin of ['', undefined, null, 'file:///x', 'capacitor://localhost', 'pas une adresse']) {
      const t = buildEventShareText(EV, origin, PARIS)
      expect(t, String(origin)).not.toContain('PermaJardin')
      expect(t, String(origin)).not.toContain('Trouvé')
    }
  })

  it('lien d’inscription : https valide seulement', () => {
    for (const bad of ['http://asso.exemple.fr/x', 'javascript:alert(1)', null]) {
      expect(buildEventShareText({ ...EV, signupUrl: bad }, '', PARIS)).not.toContain('Inscription')
    }
  })

  it('un événement sur plusieurs jours reste en toutes lettres', () => {
    const t = buildEventShareText({ ...EV, startsAt: '2026-11-14T13:00:00Z', endsAt: '2026-11-15T17:00:00Z' }, '', PARIS)
    expect(t).toContain('Quand : du samedi 14 novembre 2026 à 14 h 00 au dimanche 15 novembre 2026 à 18 h 00')
  })

  it('retours à la ligne et caractères invisibles retirés des champs ; aucun champ personnel', () => {
    const t = buildEventShareText({ ...EV, title: 'Troc\nde‮ plantes', place: 'Salle\r\nA', organizerName: 'Asso​ X' }, '', PARIS)
    expect(t.split('\n')[0]).toBe('Troc de plantes')
    expect(t).toContain('Où : Salle A')
    expect(t).toContain('Organisé par Asso X')
    expect(t).not.toMatch(/[‮​\r]/)
    expect(eventShareTitle({ title: '  Troc\n ' })).toBe('Troc')
    expect(Object.keys(EV).sort()).toEqual(['endsAt', 'organizerName', 'place', 'signupUrl', 'startsAt', 'title'])
  })
})

describe('invitation d’une association ou d’une mairie', () => {
  it('des phrases courtes, qui expliquent PermaJardin et « Devenir organisateur »', () => {
    for (const s of ORGANIZER_INVITE_SENTENCES) expect(words(s), s).toBeLessThanOrEqual(20)
    const t = organizerInviteText('https://permajardin.example')
    expect(t).toContain('PermaJardin')
    expect(t).toContain('Devenir organisateur')
    expect(t).toContain('Chaque demande est vérifiée')
    expect(t.endsWith('\nhttps://permajardin.example/')).toBe(true)
  })
  it('sans adresse web : pas de lien ; jamais de donnée personnelle', () => {
    const t = organizerInviteText('')
    expect(t).not.toContain('http')
    expect(t).not.toMatch(/@|pseudo|quartier|jardin de/i)
  })
})
