import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { RUBRIQUES, searchFeatures, visibleFeatures, type Feature } from '../../lib/features'
import { goHome } from '../../lib/goHome'
import { useInertBehind } from '../../lib/inert'
import { toutFaire } from '../../lib/overlays'
import { useBackLayer } from '../../lib/ui'
import { setBigTaps, useBigTaps } from '../../lib/bigTaps'

/** Délai entre la fermeture de la page et le lancement de la fonction : le bouton Retour d'Android a fini de retirer son entrée d'historique. */
export const RUN_DELAY_MS = 160

/** Ferme la page, puis lance la fonction (une fenêtre s'ouvre, ou l'écran défile jusqu'à elle). */
export function chooseFeature(f: Feature) {
  toutFaire.set(false)
  window.setTimeout(() => f.run(), RUN_DELAY_MS)
}

/** Une fonction : un gros bouton, son mot et sa phrase. */
export function FeatureButton({ f, onChoose = chooseFeature }: { f: Feature; onChoose?: (f: Feature) => void }) {
  return (
    <button className="tf-item" data-fid={f.id} onClick={() => onChoose(f)}>
      <span className="tf-item-text">
        <strong>{f.mot}</strong>
        <span>{f.phrase}</span>
      </span>
      <Icon name="forward" size={20} />
    </button>
  )
}

/** Les rubriques et leurs fonctions, ou les résultats de la recherche : le même affichage pour la page et les tests. */
export function FeatureList({ query, opened, onToggle, onChoose }: { query: string; opened: ReadonlySet<string>; onToggle: (id: string, open: boolean) => void; onChoose?: (f: Feature) => void }) {
  const all = useMemo(() => visibleFeatures(), [])
  const found = useMemo(() => searchFeatures(query, all), [query, all])
  const searching = query.trim().length > 0
  if (searching && found.length === 0) {
    return (
      <p className="tf-none" role="status">
        Rien ne correspond à « {query.trim()} ». Essayez un seul mot : photo, tailler, sauvegarde, soleil.
      </p>
    )
  }
  return (
    <>
      {searching && (
        <p className="tf-count" role="status">
          {found.length} fonction{found.length > 1 ? 's' : ''} trouvée{found.length > 1 ? 's' : ''}.
        </p>
      )}
      {RUBRIQUES.map((r) => {
        const list = found.filter((f) => f.rubrique === r.id)
        if (list.length === 0) return null
        return (
          <details key={r.id} className="tf-rub" data-rub={r.id} open={searching || opened.has(r.id)} onToggle={(e) => !searching && onToggle(r.id, (e.currentTarget as HTMLDetailsElement).open)}>
            <summary>
              <span className="tf-rub-text">
                <strong>{r.titre}</strong>
                <span>{r.phrase}</span>
              </span>
              <span className="tf-rub-count" aria-hidden>
                {list.length}
              </span>
              <span className="fold-chev" aria-hidden>
                <Icon name="chevron" size={20} />
              </span>
            </summary>
            <div className="tf-items">
              {list.map((f) => (
                <FeatureButton key={f.id} f={f} onChoose={onChoose} />
              ))}
            </div>
          </details>
        )
      })}
    </>
  )
}

/**
 * « Tout ce que je peux faire » : toutes les fonctions de l'appli, rangées par rubrique (la première est ouverte),
 * avec un champ de recherche. Une ligne mène à la fonction en un appui, depuis n'importe quel écran.
 */
export function ToutFaire() {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const bigTaps = useBigTaps()
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([RUBRIQUES[0].id]))
  useInertBehind(true)
  useBackLayer(true, () => toutFaire.set(false))
  useEffect(() => ref.current?.focus({ preventScroll: true }), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && toutFaire.set(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div ref={ref} className="tf-overlay" role="dialog" aria-modal="true" aria-label="Tout ce que je peux faire" tabIndex={-1}>
      <header className="tf-head">
        <button className="btn tf-top" onClick={() => toutFaire.set(false)}>
          <Icon name="back" size={18} /> Retour
        </button>
        <h1>Tout ce que je peux faire</h1>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
      </header>
      <div className="tf-search">
        <Icon name="search" size={20} />
        <input
          className="input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Chercher : photo, tailler…"
          aria-label="Chercher une fonction"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <label className="check-row tf-taps" data-feat="grandes-touches-tout">
        <input type="checkbox" checked={bigTaps} onChange={(e) => setBigTaps(e.target.checked)} />
        <span>Grandes touches : des boutons plus hauts.</span>
      </label>
      <div className="tf-body">
        <FeatureList
          query={query}
          opened={opened}
          onToggle={(id, open) =>
            setOpened((s) => {
              const next = new Set(s)
              if (open) next.add(id)
              else next.delete(id)
              return next
            })
          }
        />
      </div>
    </div>
  )
}
