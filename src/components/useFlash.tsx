import { useCallback, useEffect, useRef, useState } from 'react'

/** Court retour « Enregistré » : `flash()` l'allume, il s'éteint tout seul. */
export function useFlash(ms = 3000): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = useCallback(() => {
    setOn(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOn(false), ms)
  }, [ms])
  return [on, flash]
}

/** Le mot « Enregistré » à côté d'un champ, annoncé aux lecteurs d'écran. */
export function SavedNote({ show }: { show: boolean }) {
  return (
    <span className="saved-note" role="status" aria-live="polite">
      {show ? '✓ Enregistré' : ''}
    </span>
  )
}
