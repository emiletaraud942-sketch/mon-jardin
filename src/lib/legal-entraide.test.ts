// Les pages juridiques couvrent l'entraide entre voisins, et restent des brouillons sans donnée personnelle.
import { describe, expect, it } from 'vitest'
import { CGU, CONFIDENTIALITE, DRAFT_BANNER, LEGAL_DOCS, MENTIONS, getMissingFields, toMarkdown } from './legal'
import { DATA_INVENTORY } from './security/inventory'
import { NEIGHBORS_LIMITS } from './neighbors/types'

describe('pages juridiques : entraide', () => {
  const conf = toMarkdown(CONFIDENTIALITE)
  const cgu = toMarkdown(CGU)
  const mentions = toMarkdown(MENTIONS)

  it('confidentialité : données, quartier ~1 km, durées, droits, sous-traitant, pas de vente', () => {
    for (const m of ['pseudo', 'environ 1 km', `${NEIGHBORS_LIMITS.postLifetimeDays} jours`, 'messages privés', 'photos', 'suppression du compte', 'Supabase', 'sous-traitant', 'à confirmer', 'région Union européenne', 'n’est vendue', '15 ans', 'CNIL', 'un mois', '12 mois'])
      expect(conf, m).toContain(m)
  })
  it('CGU : conduite, signalement, blocage, hébergeur LCEN, âge, suppression', () => {
    for (const m of ['Règles de conduite', 'Trois signalements', 'bloquer', 'hébergeur', 'loi n° 2004-575', 'promptement', '15 ans', 'Suspension et suppression du compte', 'gratuite', 'harcèlement'])
      expect(cgu, m).toContain(m)
  })
  it('mentions : rôle d’hébergeur, procédure de signalement, point de contact, hébergeur Supabase', () => {
    for (const m of ['LCEN', 'promptement', 'Signaler', '2022/2065', 'Supabase', 'Vercel Inc.']) expect(mentions, m).toContain(m)
  })
  it('chaque page garde le bandeau de brouillon et les champs à compléter', () => {
    for (const d of LEGAL_DOCS) expect(toMarkdown(d)).toContain(DRAFT_BANNER)
    expect(getMissingFields()).toHaveLength(5)
    expect(mentions).toContain('[à compléter]')
  })
  it('l’inventaire décrit chaque donnée de l’entraide avec sa durée et son effacement', () => {
    const ids = DATA_INVENTORY.map((d) => d.id)
    for (const id of ['entraide-compte', 'entraide-profil', 'entraide-annonces', 'entraide-evenements', 'entraide-messages', 'entraide-moderation']) expect(ids).toContain(id)
    expect(DATA_INVENTORY.find((d) => d.id === 'entraide-evenements')!.duree).toContain('30 jours après leur fin')
    const annonces = DATA_INVENTORY.find((d) => d.id === 'entraide-annonces')!
    expect(annonces.duree).toContain('60 jours')
    expect(DATA_INVENTORY.find((d) => d.id === 'entraide-profil')!.donnee).toContain('1 km')
    for (const d of DATA_INVENTORY.filter((x) => x.id.startsWith('entraide-'))) {
      expect(d.destinataires.join(' ')).toContain('Supabase')
      expect(d.base).not.toBe('execution')
    }
  })
  it('événements : organisateurs validés, liens externes non contrôlés, durées, pas de nom des intéressés', () => {
    for (const m of ['Événements', 'organisateurs validés', 'Liens d’inscription', 'ne contrôle pas', 'Vous quittez l’appli', 'https', '30 jours après leur fin', 'jamais leurs noms', 'lieu en texte libre']) expect(conf, m).toContain(m)
    for (const m of ['Événements et organisateurs', 'seul responsable de son événement', 'n’est partie à aucune inscription', 'ne vaut pas inscription', 'ne contrôle pas ces sites', 'lieu public', 'Trois signalements', 'un événement']) expect(cgu, m).toContain(m)
    expect(mentions).toContain('événements')
  })
  it('aucune adresse e-mail réelle ni numéro de téléphone dans les textes', () => {
    const all = LEGAL_DOCS.map(toMarkdown).join('\n')
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    expect(all).not.toMatch(/\b0[1-9](?:[ .]?\d{2}){4}\b/)
  })
})
