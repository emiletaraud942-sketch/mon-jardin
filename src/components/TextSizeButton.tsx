import { useState } from 'react'
import { getTextSize, setTextSize, TEXT_SIZE_LABEL, TEXT_SIZES, type TextSize } from '../lib/textSize'

/**
 * « A+ Agrandir le texte » : passe à la taille au-dessus ; à la plus grande, revient à « Normal ».
 * Le nom accessible est le texte visible. Le choix complet reste dans Réglages > Lecture et apparence.
 */
export function TextSizeButton({ className = '' }: { className?: string }) {
  const [size, setSize] = useState<TextSize>(getTextSize())
  const idx = TEXT_SIZES.indexOf(size)
  const last = idx >= TEXT_SIZES.length - 1
  return (
    <button
      type="button"
      className={'btn textsize-btn ' + className}
      onClick={() => {
        const next = last ? TEXT_SIZES[0] : TEXT_SIZES[idx + 1]
        setTextSize(next)
        setSize(next)
      }}
    >
      <span className="textsize-mark" aria-hidden>
        {last ? 'A−' : 'A+'}
      </span>
      <span>{last ? 'Texte normal' : 'Agrandir le texte'}</span>
      <span className="sr-only"> (actuel : {TEXT_SIZE_LABEL[size]})</span>
    </button>
  )
}
