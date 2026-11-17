import { useEffect, useState } from 'react'
import { PHOTO_IDS } from '../data/species/photoIds'

/** Miniature ronde d'une espèce : sa photo libre si on en a une, sinon un point de sa couleur. */
export function SpeciesThumb({ id, color, size = 'md', children }: { id: string; color?: string; size?: 'sm' | 'md' | 'lg'; children?: React.ReactNode }) {
  const [broken, setBroken] = useState(false)
  const photo = PHOTO_IDS.has(id) && !broken
  return (
    <span className={'plant-thumb' + (size === 'md' ? '' : ' ' + size)} aria-hidden="true">
      {children ??
        (photo ? (
          <img src={`/plantes/${id}.jpg`} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className="dot" style={{ width: size === 'sm' ? 12 : 16, height: size === 'sm' ? 12 : 16, background: color ?? 'var(--accent-2)' }} />
        ))}
    </span>
  )
}

interface Credit {
  f: string
  a: string
  l: string
}
let credits: Promise<Record<string, Credit>> | null = null
function loadCredits() {
  credits ??= fetch('/plantes/credits.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return credits
}

/** Grande photo en tête d'une fiche espèce, avec son crédit et sa licence. Rien si l'espèce n'a pas de photo. */
export function SpeciesHero({ id, name }: { id: string; name: string }) {
  const [credit, setCredit] = useState<Credit | null>(null)
  const [broken, setBroken] = useState(false)
  const has = PHOTO_IDS.has(id) && !broken
  useEffect(() => {
    let live = true
    if (has) void loadCredits().then((c) => live && setCredit(c[id] ?? null))
    return () => {
      live = false
    }
  }, [id, has])
  if (!has) return null
  return (
    <figure style={{ margin: 0 }}>
      <div className="species-hero">
        <img src={`/plantes/${id}.jpg`} alt={`Photo : ${name}`} decoding="async" onError={() => setBroken(true)} />
      </div>
      {credit && (
        <figcaption className="species-credit">
          Photo : {credit.a} · {credit.l} · Wikimedia Commons
        </figcaption>
      )}
    </figure>
  )
}

/** Crédit d'une photo (auteur, licence) : petite ligne posée sur une photo ou sous elle. Rien sans photo. */
export function SpeciesCredit({ id, className }: { id: string; className?: string }) {
  const [credit, setCredit] = useState<Credit | null>(null)
  const has = PHOTO_IDS.has(id)
  useEffect(() => {
    let live = true
    if (has) void loadCredits().then((c) => live && setCredit(c[id] ?? null))
    return () => {
      live = false
    }
  }, [id, has])
  if (!has || !credit) return null
  return (
    <span className={className}>
      Photo : {credit.a} · {credit.l}
    </span>
  )
}

export const hasSpeciesPhoto = (id: string) => PHOTO_IDS.has(id)
