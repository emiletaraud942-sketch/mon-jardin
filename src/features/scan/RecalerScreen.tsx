import { useEffect, useMemo, useReducer, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { applyCalibration, fitCalibration } from '../../lib/calibration'
import { updateGarden } from '../../lib/store'
import { showToast } from '../../lib/toast'
import type { Garden } from '../../types'
import { calibReducer, currentLandmark, initialCalib, MAX_LANDMARKS, stepHelp, stepTitle } from './calibSteps'
import { geolocationPermission, useGps } from './useGps'
import { GpsMeter, GpsProblemNote } from './ScanParts'
import { ScanMap, type MapDot } from './ScanMap'
import { closeScan, openScan } from './scanUi'
import { precisionText } from './trilat'
import type { Sample } from './gps'

/** Précision d'ensemble : l'écart du calcul, sans jamais descendre sous l'incertitude du GPS. */
export function calibrationPrecisionM(rmsM: number, accuracies: number[]): number {
  const mean = accuracies.length ? accuracies.reduce((s, v) => s + v, 0) / accuracies.length : 0
  return Math.max(rmsM, mean / Math.sqrt(Math.max(1, accuracies.length)))
}

export function RecalerScreen({ garden }: { garden: Garden }) {
  const [s, dispatch] = useReducer(calibReducer, undefined, initialCalib)
  const gps = useGps(garden.center)
  const [low, setLow] = useState<Sample>()
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    void geolocationPermission().then((p) => setDenied(p === 'denied'))
  }, [])

  const fit = useMemo(() => (s.phase === 'bilan' ? fitCalibration(s.landmarks.map((l) => ({ measured: l.measured, truth: l.truth }))) : undefined), [s.phase, s.landmarks])
  const precision = fit ? calibrationPrecisionM(fit.rmsM, s.landmarks.map((l) => l.accuracyM)) : undefined

  async function measure() {
    setLow(undefined)
    const sample = await gps.start(8000)
    if (!sample) return
    if (sample.quality === 'faible') setLow(sample)
    else dispatch({ type: 'mesure', measured: { x: sample.x, y: sample.y }, accuracyM: sample.accuracyM })
  }

  const dots: MapDot[] = [
    ...s.landmarks.map((l, i) => ({ id: 'l' + i, pos: l.truth, label: String(i + 1), aria: `Repère ${i + 1}`, tone: 'repere' as const })),
    ...(s.phase === 'carte' && s.truth ? [{ id: 'cur', pos: s.truth, label: String(currentLandmark(s)), aria: `Repère ${currentLandmark(s)}`, tone: 'choix' as const }] : []),
    // Bilan : où le GPS corrigé place chaque repère (doit tomber près du point touché).
    ...(fit ? s.landmarks.map((l, i) => ({ id: 'c' + i, pos: applyCalibration(fit, l.measured), label: '✓', aria: `Repère ${i + 1} après recalage`, tone: 'verite' as const })) : []),
  ]

  const save = () => {
    if (!fit) return
    updateGarden(garden.id, { calibration: fit })
    showToast({ message: `Carte recalée. Précision : ${precisionText(precision ?? fit.rmsM)}.` })
    closeScan()
  }

  return (
    <Modal title={stepTitle(s)} full onClose={closeScan}>
      <div className="scan-layout">
        {s.phase !== 'intro' && (
          <ScanMap
            garden={garden}
            plants={[]}
            label="Carte du jardin : touchez le repère où vous êtes"
            dots={dots}
            onTap={s.phase === 'carte' ? (truth) => dispatch({ type: 'toucher', truth }) : undefined}
          />
        )}
        <div className="scan-panel stack">
          {s.phase === 'intro' && (
            <>
              <p style={{ margin: 0 }}>Le GPS d’un téléphone se trompe parfois de plusieurs mètres. Ce recalage corrige l’écart.</p>
              <ol className="scan-steps">
                <li>
                  <strong>Allez sur un repère.</strong> Coin de maison, portail ou angle de clôture, visible sur la photo aérienne.
                </li>
                <li>
                  <strong>Touchez « Je suis ici ».</strong> Restez immobile 8 secondes.
                </li>
                <li>
                  <strong>Touchez le même point sur la carte.</strong> Faites-le pour 2 ou 3 repères.
                </li>
              </ol>
              <p className="small muted" style={{ margin: 0 }}>Votre position reste sur votre téléphone. Elle n’est envoyée nulle part.</p>
              {garden.calibration && <p className="small" style={{ margin: 0 }}>Un recalage existe déjà. Un nouveau le remplacera.</p>}
              <button className="btn primary big" onClick={() => dispatch({ type: 'commencer' })}>
                Commencer
              </button>
            </>
          )}

          {s.phase === 'gps' && (
            <>
              <p style={{ margin: 0 }}>{stepHelp(s)}</p>
              {gps.state.status === 'repos' && <p className="small muted" style={{ margin: 0 }}>Le téléphone va demander l’accès à votre position. Touchez « Autoriser ».</p>}
              {denied && gps.state.status === 'repos' && <GpsProblemNote problem="refuse" />}
              <GpsMeter state={gps.state} />
              {gps.state.status === 'erreur' && gps.state.problem && <GpsProblemNote problem={gps.state.problem} />}
              {low && (
                <div className="alert small" role="status">
                  <span>
                    <strong>Le signal est faible</strong> (environ {Math.round(low.accuracyM)} m d’erreur). Le recalage sera peu précis.
                  </span>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn" onClick={() => void measure()}>
                      Recommencer
                    </button>
                    <button className="btn" onClick={() => dispatch({ type: 'mesure', measured: { x: low.x, y: low.y }, accuracyM: low.accuracyM })}>
                      Garder quand même
                    </button>
                  </div>
                </div>
              )}
              {gps.state.status === 'mesure' ? (
                <button className="btn" onClick={gps.cancel}>
                  Annuler la mesure
                </button>
              ) : (
                !low && (
                  <button className="btn primary big" onClick={() => void measure()}>
                    <Icon name="pin" /> Je suis ici
                  </button>
                )
              )}
              {s.landmarks.length > 0 && (
                <button className="btn" onClick={() => dispatch({ type: 'annuler-dernier' })}>
                  Retirer le dernier repère
                </button>
              )}
            </>
          )}

          {s.phase === 'carte' && (
            <>
              <p style={{ margin: 0 }}>{stepHelp(s)}</p>
              {s.pending && <p className="small muted" style={{ margin: 0 }}>Position mesurée à environ {Math.round(s.pending.accuracyM)} m près.</p>}
              <button className="btn primary big" disabled={!s.truth} onClick={() => dispatch({ type: 'valider-repere' })}>
                <Icon name="check" /> C’est bien ce point
              </button>
              {!s.truth && <p className="small muted" style={{ margin: 0 }}>Touchez la carte pour continuer.</p>}
              <button className="btn" onClick={() => dispatch({ type: 'refaire-mesure' })}>
                Refaire la mesure
              </button>
            </>
          )}

          {s.phase === 'suite' && (
            <>
              <p style={{ margin: 0 }}>{stepHelp(s)}</p>
              {s.landmarks.length < MAX_LANDMARKS && (
                <button className="btn big" onClick={() => dispatch({ type: 'autre-repere' })}>
                  <Icon name="plus" /> Ajouter un repère
                </button>
              )}
              <button className="btn primary big" onClick={() => dispatch({ type: 'bilan' })}>
                Calculer le recalage
              </button>
            </>
          )}

          {s.phase === 'bilan' && (
            <>
              {fit && precision !== undefined ? (
                <>
                  <p style={{ margin: 0 }}>
                    <strong>Précision estimée : {precisionText(precision)}.</strong>
                  </p>
                  {precision > 3 && <p className="alert small" style={{ margin: 0 }}>Les repères ne concordent pas bien. Recommencez dans un endroit dégagé.</p>}
                  <p className="small muted" style={{ margin: 0 }}>Les points ✓ montrent où la carte placerait chaque repère après correction.</p>
                  <button className="btn primary big" onClick={save}>
                    <Icon name="check" /> Enregistrer
                  </button>
                </>
              ) : (
                <div className="alert error small" role="alert">
                  <strong>Le calcul n’a pas marché.</strong> Les repères sont trop proches, ou l’écart est trop grand. Choisissez des repères éloignés d’au moins 5 m.
                </div>
              )}
              <button className="btn" onClick={() => dispatch({ type: 'annuler-dernier' })}>
                Retirer le dernier repère
              </button>
              <button className="btn" onClick={() => dispatch({ type: 'recommencer' })}>
                Recommencer
              </button>
            </>
          )}

          <div className="row scan-foot">
            <button className="btn ghost" onClick={() => openScan('menu')}>
              Retour au menu du scan
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
