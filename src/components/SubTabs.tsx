import { useRef, type KeyboardEvent } from 'react'
import { SUB_LABEL, setUi, type Tab } from '../lib/ui'

/** Sélecteur segmenté d'un rayon (Carte / Plantes / Vue 3D, Où planter ? / Catalogue) : onglets ARIA, flèches ←/→, un seul dans l'ordre de tabulation. */
/** `extra` : un bouton d'action à la suite des onglets (il ouvre un écran par-dessus, il n'est pas un onglet). */
export interface SubTabExtra {
  label: string
  name: string
  feat?: string
  onClick: () => void
}

export function SubTabs({ tabs, current, label, extra }: { tabs: Tab[]; current: Tab; label: string; extra?: SubTabExtra }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  function onKey(e: KeyboardEvent, i: number) {
    let j = i
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = tabs.length - 1
    else return
    e.preventDefault()
    setUi({ tab: tabs[j] })
    refs.current[j]?.focus()
  }
  return (
    <div className="seg subtabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t}
          ref={(el) => (refs.current[i] = el)}
          role="tab"
          id={`sub-tab-${t}`}
          aria-controls="main-panel"
          aria-selected={current === t}
          tabIndex={current === t ? 0 : -1}
          onClick={() => setUi({ tab: t })}
          onKeyDown={(e) => onKey(e, i)}
        >
          {SUB_LABEL[t] ?? t}
        </button>
      ))}
      {extra && (
        <button type="button" className="subtab-extra" data-feat={extra.feat} aria-label={extra.name} title={extra.name} onClick={extra.onClick}>
          {extra.label}
        </button>
      )}
    </div>
  )
}
