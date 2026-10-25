import { LegalLink } from '../legal/LegalLinks'
import { GardenCreator } from './GardenCreator'

export function Onboarding() {
  return (
    <div className="hero">
      <div className="card onboarding">
        <div className="row brand-row">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span className="brand-name">PermaJardin</span>
        </div>
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
