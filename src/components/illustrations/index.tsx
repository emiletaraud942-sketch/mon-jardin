// Petit jeu d'illustrations SVG (décor seulement) : légères, sans image. Les couleurs viennent des variables --il-* de :root.
import type { CSSProperties } from 'react'

interface Props {
  /** Largeur en pixels (la hauteur suit). */
  size?: number
  className?: string
  style?: CSSProperties
}

/** Grande forme organique douce, à poser derrière une plante. */
export function Blob({ size = 280, height, className, style }: Props & { height?: number }) {
  return (
    <svg className={'il ' + (className ?? '')} style={style} width={size} height={height ?? (size * 260) / 300} viewBox="0 0 300 260" aria-hidden="true" focusable="false">
      <path className="il-blob" d="M60 40C110-10 230-5 270 60c35 60-5 150-80 185C120 275 30 240 10 160 0 110 20 70 60 40Z" />
    </svg>
  )
}

const TILTS = [-38, -14, 14, 38]
const LEAF_CLASS = ['il-leaf-b', 'il-leaf-a', 'il-leaf-c', 'il-leaf-b']

/** Plante en pot : quatre feuilles et un pot sauge. */
export function PlantPot({ size = 160, tilts = TILTS, className, style }: Props & { tilts?: number[] }) {
  return (
    <svg className={'il ' + (className ?? '')} style={style} width={size} height={size * 1.1} viewBox="0 0 200 220" aria-hidden="true" focusable="false">
      {tilts.map((a, i) => (
        <g key={i} transform={`rotate(${a} 100 150)`}>
          <path className={LEAF_CLASS[i % LEAF_CLASS.length]} d="M100 150C70 112 72 62 100 18C128 62 130 112 100 150Z" />
          <path className="il-vein" d="M100 146C100 110 100 70 100 30" />
        </g>
      ))}
      <path className="il-pot" d="M62 150h76l-8 56H70z" />
      <rect className="il-rim" x="56" y="144" width="88" height="14" rx="7" />
    </svg>
  )
}

/** Une feuille seule, pour les petits états vides et les têtes de rayon. */
export function LeafSprig({ size = 64, className, style }: Props) {
  return (
    <svg className={'il ' + (className ?? '')} style={style} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path className="il-leaf-a" d="M32 58C14 46 12 24 32 6c20 18 18 40 0 52Z" />
      <path className="il-vein" d="M32 54V16M32 40l-8-8M32 32l8-8" />
    </svg>
  )
}

/** Maison avec son jardin : arbre, buisson, clôture. */
export function HouseGarden({ size = 240, className, style }: Props) {
  return (
    <svg className={'il ' + (className ?? '')} style={style} width={size} height={(size * 150) / 240} viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      <ellipse className="il-blob" cx="120" cy="132" rx="116" ry="16" />
      <rect className="il-house" x="62" y="66" width="76" height="62" rx="8" />
      <path className="il-roof" d="M54 70 100 30l46 40Z" />
      <rect className="il-rim" x="88" y="94" width="24" height="34" rx="12" />
      <circle className="il-leaf-b" cx="30" cy="96" r="24" />
      <rect className="il-rim" x="28" y="106" width="4" height="22" rx="2" />
      <circle className="il-leaf-a" cx="186" cy="108" r="18" />
      <circle className="il-leaf-c" cx="208" cy="116" r="12" />
      <path className="il-fence" d="M150 128h84" />
    </svg>
  )
}

/** Plante en pot sur sa forme sauge : illustration des états vides et des en-têtes. */
export function PlantScene({ size = 120, variant = 'pot', className }: { size?: number; variant?: 'pot' | 'house' | 'leaf'; className?: string }) {
  return (
    <div className={'il-scene ' + (className ?? '')} style={{ width: size, height: size * 0.86 }} aria-hidden="true">
      <Blob size={size} className="il-scene-blob" />
      {variant === 'house' ? (
        <HouseGarden size={size * 0.9} className="il-scene-art il-scene-house" />
      ) : variant === 'leaf' ? (
        <LeafSprig size={size * 0.5} className="il-scene-art il-scene-leaf" />
      ) : (
        <PlantPot size={size * 0.62} className="il-scene-art il-scene-pot" />
      )}
    </div>
  )
}
