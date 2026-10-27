import { Icon } from './Icon'

/** Remplace la carte quand l'appareil ne sait pas la dessiner (pas de WebGL 2). Aucune donnée n'est perdue. */
export function MapUnsupported({ className }: { className?: string }) {
  return (
    <div className={`map-unsupported alert info ${className ?? ''}`.trim()} role="note" style={{ margin: 12 }}>
      <p style={{ margin: 0 }}>
        <Icon name="info" size={18} /> <strong>La carte ne peut pas s’afficher sur cet appareil.</strong>
      </p>
      <p className="small" style={{ margin: '6px 0 0' }}>
        Il lui manque une fonction d’affichage (WebGL 2). Vos jardins et vos plantes sont intacts. Essayez de mettre à jour votre navigateur ou votre téléphone, ou ouvrez PermaJardin dans un autre navigateur.
      </p>
    </div>
  )
}
