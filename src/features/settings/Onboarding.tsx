import { LegalLink } from '../legal/LegalLinks'
import { GardenCreator } from './GardenCreator'

/** Petit jardin stylisé : maison, arbres, fleurs, limite de parcelle en pointillés. Décor seulement. */
function GardenIllustration() {
  return (
    <svg className="ill" viewBox="0 0 330 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect className="ill-grass" width="330" height="190" />
      <rect className="ill-house-edge" x="24" y="28" width="128" height="84" rx="12" />
      <rect className="ill-house" x="24" y="22" width="128" height="84" rx="12" />
      <path className="ill-roof" d="M24 52V34a12 12 0 0 1 12-12h104a12 12 0 0 1 12 12v18Z" />
      <circle className="ill-tree-shade" cx="225" cy="69" r="35" />
      <circle className="ill-tree" cx="221" cy="65" r="32" />
      <circle className="ill-bush-shade" cx="289" cy="119" r="27" />
      <circle className="ill-bush" cx="286" cy="116" r="24" />
      <circle className="ill-fruit-shade" cx="79" cy="151" r="19" />
      <circle className="ill-fruit" cx="76" cy="148" r="16" />
      <circle className="ill-wheat-shade" cx="145" cy="155" r="15" />
      <circle className="ill-wheat" cx="143" cy="153" r="12" />
      <rect className="ill-fence" x="12" y="12" width="306" height="166" rx="20" />
    </svg>
  )
}

export function Onboarding() {
  return (
    <div className="hero onboarding-hero">
      <div className="card onboarding">
        <div className="row brand-row">
          <img src="/icon.svg" alt="" width={52} height={52} />
          <span className="brand-name">PermaJardin</span>
        </div>
        <GardenIllustration />
        <h1>Où est votre jardin ?</h1>
        <p>Placez vos plantes sur la photo de votre jardin. Sachez quoi faire chaque semaine.</p>
        <p className="muted small">Gratuit, sans compte. Vos données restent sur cet appareil.</p>
        <GardenCreator allowDemo />
        <p className="muted small legal-accept">
          En continuant, vous acceptez les <LegalLink id="cgu" label="conditions d’utilisation" /> et la{' '}
          <LegalLink id="confidentialite" label="politique de confidentialité" />.
        </p>
      </div>
    </div>
  )
}
