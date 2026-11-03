#!/usr/bin/env node
// Audit BLOQUANT des dépendances de production : `npm audit --omit=dev --json`, seuil réglable (--level=critical par défaut),
// moins les exceptions DOCUMENTÉES de .github/audit-exceptions.json (id d'avis GHSA, paquet, raison, date d'échéance).
// Une exception échue ne protège plus : il faut la réexaminer. Voir docs/SECURITE.md (« Exceptions d'audit »).
// Aucun secret, aucun accès hors `npm audit`. Testé par src/lib/security/audit-script.test.ts.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const LEVELS = ['info', 'low', 'moderate', 'high', 'critical']
const rank = (s) => LEVELS.indexOf(String(s))

/** Avis (GHSA) présents dans un rapport `npm audit --json` : un par (paquet, avis), les dépendances transitives sont suivies par `via`. */
export function advisoriesOf(report) {
  const out = new Map()
  for (const [pkg, v] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of Array.isArray(v?.via) ? v.via : []) {
      if (via && typeof via === 'object' && via.url) {
        const id = String(via.url).split('/').pop()
        out.set(`${pkg}|${id}`, { id, pkg, severity: via.severity ?? v.severity, title: via.title ?? '', range: via.range ?? '' })
      }
    }
  }
  return [...out.values()]
}

/**
 * Décide du résultat. Renvoie { blocking, excepted, expired, errors }.
 * - blocking : avis au seuil ou au-dessus, sans exception valide ;
 * - excepted : avis tolérés (exception valide) ;
 * - expired  : exceptions échues (comptent comme bloquantes si l'avis est encore là) ;
 * - errors   : problèmes de configuration (exception sans raison, sans échéance, ou échéance invalide).
 */
export function evaluateAudit(report, exceptions, level = 'critical', now = new Date()) {
  const errors = []
  if (rank(level) < 0) errors.push(`niveau inconnu : ${level}`)
  const valid = new Map()
  const expired = []
  for (const e of Array.isArray(exceptions) ? exceptions : []) {
    if (!e || !/^GHSA-[a-z0-9-]+$/.test(String(e.id ?? ''))) {
      errors.push(`exception invalide (id GHSA attendu) : ${JSON.stringify(e)}`)
      continue
    }
    if (!String(e.package ?? '').trim() || String(e.reason ?? '').trim().length < 20) {
      errors.push(`exception ${e.id} : paquet et raison (20 caractères au moins) obligatoires`)
      continue
    }
    const until = Date.parse(String(e.expires ?? ''))
    if (!Number.isFinite(until)) {
      errors.push(`exception ${e.id} : date d'échéance (expires, AAAA-MM-JJ) obligatoire`)
      continue
    }
    if (until < now.getTime()) {
      expired.push(e.id)
      continue
    }
    valid.set(`${e.package}|${e.id}`, e)
  }
  const blocking = []
  const excepted = []
  for (const a of advisoriesOf(report)) {
    if (rank(a.severity) < rank(level)) continue
    if (valid.has(`${a.pkg}|${a.id}`)) excepted.push(a)
    else blocking.push(a)
  }
  return { blocking, excepted, expired, errors }
}

function main() {
  const level = (process.argv.find((a) => a.startsWith('--level=')) ?? '--level=critical').slice(8)
  const exceptions = JSON.parse(readFileSync(fileURLToPath(new URL('../audit-exceptions.json', import.meta.url)), 'utf8'))
  const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  let report
  try {
    report = JSON.parse(r.stdout)
  } catch {
    console.error("Audit impossible : sortie de `npm audit` illisible.\n" + (r.stderr || r.stdout || '').slice(0, 500))
    process.exit(2)
  }
  if (report.error) {
    console.error(`Audit impossible : ${report.error.summary ?? report.error.code ?? 'erreur npm'}`)
    process.exit(2)
  }
  const res = evaluateAudit(report, exceptions, level)
  for (const a of res.excepted) console.log(`Toléré (exception documentée) : ${a.pkg} ${a.id} [${a.severity}] ${a.title}`)
  for (const id of res.expired) console.error(`Exception ÉCHUE : ${id} (réexaminer, mettre à jour ou retirer de .github/audit-exceptions.json)`)
  for (const e of res.errors) console.error(`Configuration : ${e}`)
  for (const a of res.blocking) console.error(`BLOQUANT : ${a.pkg} ${a.id} [${a.severity}] ${a.title}`)
  if (res.blocking.length || res.errors.length) process.exit(1)
  console.log(`Audit de production : aucun avis ${level} ou plus sans exception documentée.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
