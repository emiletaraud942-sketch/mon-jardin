import { SEASON_CHOICES, type SeasonChoice } from '../engine/season'

interface Props {
  /** Choix affiché comme actif (« aujourdhui » si rien n'est choisi). */
  value: SeasonChoice | undefined
  onChange: (choice: SeasonChoice) => void
  /** Classe des boutons. */
  buttonClass?: string
  className?: string
}

/** Boutons Aujourd'hui · Hiver · Printemps · Été · Automne : un seul choix pour la carte et les photos du jardin. */
export function SeasonPicker({ value, onChange, buttonClass = 'btn small', className = '' }: Props) {
  const current = value ?? 'aujourdhui'
  return (
    <div className={('season-picker ' + className).trim()} role="group" aria-label="Saison du jardin">
      {SEASON_CHOICES.map((c) => (
        <button key={c.id} type="button" className={buttonClass + (current === c.id ? ' primary' : '')} aria-pressed={current === c.id} onClick={() => onChange(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  )
}
