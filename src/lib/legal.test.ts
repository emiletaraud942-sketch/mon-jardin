import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CGU, CONFIDENTIALITE, CONSENT_TEXT, DRAFT_BANNER, LEGAL_DOCS, LEGAL_FIELDS, LEGAL_UPDATED, LEGAL_VERSION, MENTIONS, getMissingFields, isLegalReady, legalText, toMarkdown, TO_COMPLETE } from './legal'

const doc = (f: string) => readFileSync(new URL(`../../docs/${f}`, import.meta.url), 'utf8')

describe('champs à compléter', () => {
  it('liste tous les champs encore vides', () => {
    expect(getMissingFields()).toEqual(['EDITEUR_NOM', 'EDITEUR_STATUT', 'EDITEUR_ADRESSE', 'CONTACT_EMAIL', 'DIRECTEUR_PUBLICATION'])
  })
  it('ne liste plus un champ rempli', () => {
    expect(getMissingFields({ ...LEGAL_FIELDS, CONTACT_EMAIL: 'contact@exemple.fr' })).not.toContain('CONTACT_EMAIL')
    expect(getMissingFields({ A: 'ok' })).toEqual([])
  })
  it('ne contient aucune donnée personnelle pré-remplie', () => {
    const all = LEGAL_DOCS.map(toMarkdown).join('\n')
    expect(all).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    expect(all).not.toContain('emiletaraud')
  })
})

describe('documents', () => {
  it('chaque document porte la mention de brouillon', () => {
    for (const d of LEGAL_DOCS) expect(doc(d.fichier)).toContain(DRAFT_BANNER)
  })
  it('les titres des fichiers docs/ correspondent à legal.ts', () => {
    for (const d of LEGAL_DOCS) {
      const md = doc(d.fichier)
      const h1 = [...md.matchAll(/^# (.+)$/gm)].map((m) => m[1])
      const h2 = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1])
      expect(h1).toEqual([d.titre])
      expect(h2).toEqual(d.sections.map((s) => s.titre))
    }
  })
  it('le contenu des fichiers docs/ est identique à legal.ts', () => {
    for (const d of LEGAL_DOCS) expect(doc(d.fichier)).toBe(toMarkdown(d))
  })
  it('couvre les points exigés', () => {
    const conf = toMarkdown(CONFIDENTIALITE)
    for (const m of ['Vercel', 'IGN', 'Open-Meteo', 'Pl@ntNet', 'Supabase', 'CNIL', 'cookie', 'Effacer toutes mes données', 'à confirmer']) expect(conf).toContain(m)
    const mentions = toMarkdown(MENTIONS)
    for (const m of ['440 N Barranca Ave #4133', 'Licence Ouverte 2.0', 'CC BY 4.0']) expect(mentions).toContain(m)
    const cgu = toMarkdown(CGU)
    for (const m of ['671', 'indicatif', 'Ne consommez jamais', 'droit français']) expect(cgu).toContain(m)
  })
  it('aucun texte ne promet une région d’hébergement non vérifiée (« Supabase, UE »)', () => {
    for (const [id, t] of Object.entries(CONSENT_TEXT)) {
      const text = t.paragraphes.join(' ')
      expect(text, id).not.toMatch(/Supabase,\s*UE|serveur[^.]*\bUE\b|hébergé[^.]*(Union européenne|\bUE\b)/i)
    }
    for (const id of ['sync', 'voisins', 'notifications'] as const) expect(CONSENT_TEXT[id].paragraphes.join(' '), id).toContain('région d’hébergement à confirmer par l’éditeur')
    for (const d of LEGAL_DOCS) expect(toMarkdown(d), d.fichier).not.toMatch(/Supabase,\s*UE/)
  })
  it('la version des textes a été montée (1.5 ou plus) quand les formulations ont changé, et la date est valide', () => {
    const [maj, min] = LEGAL_VERSION.split('.').map(Number)
    expect(maj * 100 + min).toBeGreaterThanOrEqual(105)
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Date.parse(LEGAL_UPDATED)).toBeLessThanOrEqual(Date.now())
    for (const d of LEGAL_DOCS) expect(doc(d.fichier)).toContain(`Version ${LEGAL_VERSION}`)
  })
  it('conserve les textes « jardins partagés » de l’entraide', () => {
    expect(CONSENT_TEXT.voisins.paragraphes.join(' ')).toContain('montrer votre jardin')
    expect(toMarkdown(CONFIDENTIALITE)).toContain('Ne plus montrer mon jardin')
  })
  it('le texte de consentement de l’entraide dit l’essentiel', () => {
    const t = CONSENT_TEXT.voisins.paragraphes.join(' ')
    for (const m of ['e-mail', 'pseudo', 'environ 2 km', 'environ 5 km', '60 jours', 'jamais envoyées', 'messages']) expect(t).toContain(m)
  })
  it('le texte de consentement Pl@ntNet dit l’essentiel', () => {
    const t = CONSENT_TEXT.plantnet.paragraphes.join(' ')
    expect(t).toContain('ré-encodée')
    expect(t).toContain('GPS')
    expect(t).toContain('pas conservée')
  })

  it('masque « [à compléter] » à l’affichage et tant que des champs manquent', () => {
    expect(legalText(`Éditeur : ${TO_COMPLETE}.`)).toBe('Éditeur : information à venir.')
    expect(legalText(`Éditeur : ${TO_COMPLETE}.`)).not.toMatch(/\[|à compléter/)
    expect(isLegalReady()).toBe(getMissingFields().length === 0)
    expect(isLegalReady({ EDITEUR_NOM: 'Association X' })).toBe(true)
    expect(isLegalReady({ EDITEUR_NOM: TO_COMPLETE })).toBe(false)
  })
})
