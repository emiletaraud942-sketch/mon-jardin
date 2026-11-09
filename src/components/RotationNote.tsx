import type { RotationWarning } from '../engine/rotation'

/** Avertissement doux de rotation des cultures dans « Où planter ? » : jamais bloquant, rien si `warning` est absent. */
export function RotationNote({ warning }: { warning: RotationWarning | null | undefined }) {
  if (!warning) return null
  return (
    <aside className="rot-note small" role="note" aria-label="Rotation des cultures">
      <strong>Pensez à la rotation des cultures</strong>
      <p>{warning.text}</p>
    </aside>
  )
}
