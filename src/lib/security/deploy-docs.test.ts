import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const guide = readFileSync(join(root, 'docs', 'DEPLOIEMENT.md'), 'utf8')

describe('docs/DEPLOIEMENT.md reste aligné sur le dépôt', () => {
  it('cite chaque migration de supabase/migrations et de supabase/neighbors/migrations', () => {
    for (const dir of ['supabase/migrations', 'supabase/neighbors/migrations']) {
      const files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.sql'))
      expect(files.length).toBeGreaterThan(3)
      // Les entraide sont citées par leur nom complet ou par leur suffixe court (« …25000000_neighbors_v2.sql »).
      for (const f of files) {
        const short = f.replace(/^\d{8}/, '')
        expect(guide.includes(f) || guide.includes(short), `${f} absente de DEPLOIEMENT.md`).toBe(true)
      }
    }
  })

  it('dit comment remplacer le joker de la CSP, le pare-feu Vercel, le retour arrière et la restauration', () => {
    for (const m of ['4 bis', 'https://*.supabase.co', 'Firewall', '/api/identify', '/ext/', 'Instant Rollback', 'Restaurer la base']) expect(guide, m).toContain(m)
  })

  it('l’adresse de contact de sécurité du site est annoncée au propriétaire (§10 : champs à compléter)', () => {
    expect(guide).toContain('CONTACT_EMAIL')
    expect(guide).toContain('LEGAL_VERSION')
  })

  it('ne parle plus de « lien magique » ni du bandeau « Recharger » pour la mise à jour', () => {
    expect(guide).not.toMatch(/lien magique/i)
    expect(guide).not.toContain('Nouvelle version disponible — Recharger')
  })
})
