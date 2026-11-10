// Briques communes des fichiers iCalendar (.ics) : échappement et pliage des lignes. Sans dépendance, chargé par les deux exports.

/** Échappe un texte de propriété iCalendar (RFC 5545 §3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Coupe une ligne à 75 octets UTF-8 (RFC 5545 §3.1) : les lignes suivantes commencent par une espace. */
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  const limit = () => (out.length === 0 ? 75 : 74) // la continuation compte son espace de tête
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > limit()) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}
