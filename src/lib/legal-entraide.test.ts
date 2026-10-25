// Les pages juridiques couvrent l'entraide entre voisins, et restent des brouillons sans donnée personnelle.
import { describe, expect, it } from 'vitest'
import { CGU, CONFIDENTIALITE, CONSENT_TEXT, DRAFT_BANNER, LEGAL_DOCS, MENTIONS, getMissingFields, toMarkdown } from './legal'
import { DATA_INVENTORY, PERMISSIONS } from './security/inventory'
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
  it('alertes de nouveaux messages : texte neutre, signal vide, sous-traitant technique, désactivation', () => {
    for (const m of ['Alertes de nouveaux messages', 'signal vide', 'sans texte ni pseudo', '5 appareils au plus', 'Mes notifications', 'Se désabonner de cet appareil', 'Service d’alertes de votre navigateur', 'sous-traitant technique'])
      expect(conf, m).toContain(m)
    expect(conf).toContain('Google, Apple et Microsoft')
    expect(conf).toMatch(/Rien n’est envoyé si la case « nouveaux messages » est décochée/)
  })
  it('alertes : inventaire des données, base légale, durée, effacement', () => {
    const a = DATA_INVENTORY.find((d) => d.id === 'entraide-alertes')!
    expect(a.base).toBe('consentement')
    expect(a.destinataires.join(' ')).toContain('Supabase')
    expect(a.destinataires.join(' ')).toMatch(/Google, Mozilla, Apple ou Microsoft/)
    expect(a.destinataires.join(' ')).toMatch(/jamais de texte ni de pseudo/)
    expect(a.duree).toContain('5 appareils')
    expect(a.effacement).toContain('Se désabonner de cet appareil')
    expect(a.stockage).toContain('push_subscriptions')
    expect(a.stockage).toContain('notification_prefs')
  })
  it('autorisation dédiée aux alertes, demandée avant toute question du navigateur', () => {
    const t = CONSENT_TEXT.notifications
    expect(t.titre).toMatch(/alerte/)
    expect(t.accepter).toMatch(/activer/i)
    const all = t.paragraphes.join(' ')
    for (const m of ['Vous avez un nouveau message', 'ni le texte du message, ni le pseudo', 'Supabase', 'Google, Mozilla, Apple ou Microsoft', 'Mes notifications']) expect(all, m).toContain(m)
    expect(all).not.toMatch(/navigateur|consentement/)
  })
  it('la permission « Notifications » décrit aussi les alertes de l’entraide', () => {
    const n = PERMISSIONS.find((p) => p.permission === 'Notifications')!
    expect(n.ou).toContain('Mes notifications')
    expect(n.pourquoi).not.toMatch(/Aucune notification poussée/)
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
