// Audit des dépendances de production : échoue sur toute alerte « high » ou « critical » qui n'est pas dans la liste connue.
// `npm audit` seul ne sait pas ignorer un avis précis ; cette liste, courte et commentée, remplace `continue-on-error`.
import { execFileSync } from 'node:child_process'

/** Avis connus et jugés non exploitables ici. Chaque entrée dit pourquoi, et quand la retirer. Vide depuis la montée de maplibre-gl en 6.x. */
const ACCEPTED = {}

let out
try {
  out = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
} catch (e) {
  out = e.stdout // npm audit sort avec un code non nul dès qu'il y a une alerte : le JSON est quand même sur stdout
}
let report
try {
  report = JSON.parse(out)
} catch {
  console.error("npm audit n'a pas renvoyé de JSON lisible (réseau ?) : échec par prudence.")
  process.exit(2)
}

const blocking = []
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (v.severity !== 'high' && v.severity !== 'critical') continue
  const advisories = (v.via ?? []).filter((x) => typeof x === 'object')
  const ids = advisories.map((x) => (x.url ?? '').split('/').pop()).filter(Boolean)
  // Une alerte indirecte (via un autre paquet) n'a pas d'avis propre : elle est jugée avec le paquet d'origine.
  if (advisories.length === 0) continue
  const unknown = ids.filter((id) => !(id in ACCEPTED))
  if (unknown.length > 0 || ids.length === 0) blocking.push(`${name} (${v.severity}) : ${unknown.join(', ') || 'avis inconnu'}`)
  else console.log(`Toléré : ${name} (${v.severity}) — ${ids.map((id) => `${id} : ${ACCEPTED[id]}`).join(' ; ')}`)
}

if (blocking.length > 0) {
  console.error('Alertes de production non acceptées :\n- ' + blocking.join('\n- '))
  process.exit(1)
}
console.log('Audit de production : aucune alerte high/critical hors liste acceptée.')
