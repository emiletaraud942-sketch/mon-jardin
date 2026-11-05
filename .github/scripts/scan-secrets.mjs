#!/usr/bin/env node
// Détection de secrets sans service externe : motifs courants cherchés dans les fichiers suivis par git
// (et, avec --history, dans tout l'historique : `git log -p --all`). Ne remplace pas « Secret scanning » + « Push protection »
// de GitHub (à activer par le propriétaire) : c'est un filet de plus, qui échoue la CI. Testé par src/lib/security/audit-script.test.ts.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const PATTERNS = [
  { id: 'cle-privee', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'jeton-jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'cle-sk', re: /\bsk-(?:proj-|ant-|live-)?[A-Za-z0-9_-]{24,}/ },
  { id: 'github', re: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/ },
  { id: 'aws', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'supabase-secret', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: 'supabase-url-reelle', re: /https:\/\/[a-z0-9]{20}\.supabase\.co\b/ },
  { id: 'vercel', re: /\bvercel_[A-Za-z0-9]{20,}|\bVERCEL_TOKEN\s*[=:]\s*['"]?[A-Za-z0-9]{20,}/ },
  { id: 'variable-secrete', re: /\b(?:PLANTNET_API_KEY|NEIGHBORS_VAPID_PRIVATE|VAPID_PRIVATE_KEY|SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY|WEBHOOK_SECRET)\s*[=:]\s*['"]?[A-Za-z0-9_\-+/=]{16,}/ },
  { id: 'plantnet-url', re: /api-key=[A-Za-z0-9$_.-]{12,}/ },
]

/** Fichiers sans intérêt ou trop bruités (empreintes d'intégrité du lockfile, binaires). */
export const SKIP = /(^|\/)package-lock\.json$|\.(png|jpe?g|webp|ico|woff2?|ttf|pdf|gz|zip|lock)$/i

/** Cherche les motifs dans un texte. `allow` : liste de sous-chaînes explicitement tolérées (exemples de documentation). */
export function scanText(text, where, allow = []) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 4000) continue
    for (const p of PATTERNS) {
      const m = p.re.exec(line)
      if (m && !allow.some((a) => line.includes(a))) hits.push({ id: p.id, where: `${where}:${i + 1}`, extrait: m[0].slice(0, 6) + '…' })
    }
  }
  return hits
}

function main() {
  const history = process.argv.includes('--history')
  const allow = JSON.parse(readFileSync(fileURLToPath(new URL('../secrets-allow.json', import.meta.url)), 'utf8'))
  const hits = []
  for (const f of execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
    if (SKIP.test(f)) continue
    let text
    try {
      text = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (text.includes('\u0000')) continue
    hits.push(...scanText(text, f, allow))
  }
  if (history) {
    const log = execFileSync('git', ['log', '-p', '--all', '--no-color', '--pretty=format:@@commit %h', '--', '.', ':(exclude)package-lock.json'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
    let commit = '?'
    log.split('\n').forEach((line, i) => {
      if (line.startsWith('@@commit ')) commit = line.slice(9)
      else if (line.startsWith('+') && !line.startsWith('+++')) hits.push(...scanText(line.slice(1), `historique ${commit}`, allow).map((h) => ({ ...h, where: `${h.where.replace(/:1$/, '')} (ligne ${i})` })))
    })
  }
  for (const h of hits) console.error(`SECRET POSSIBLE [${h.id}] ${h.where} (${h.extrait})`)
  if (hits.length) {
    console.error(`${hits.length} motif(s) trouvé(s). Si c'est un faux positif, ajouter la ligne exacte à .github/secrets-allow.json ; si c'est un vrai secret, le révoquer d'abord.`)
    process.exit(1)
  }
  console.log(`Aucun secret détecté (${history ? 'arbre de travail et historique' : 'arbre de travail'}).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
