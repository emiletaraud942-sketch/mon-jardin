import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { Segmented } from '../../components/Segmented'
import { recordWithToast } from '../../lib/history'
import { SOIL_TEST_LIMIT, soilFromAnswers, visibleQuestions, type SoilAnswers } from '../../lib/soilTest'
import { updateGarden } from '../../lib/store'
import type { Garden, SoilTexture } from '../../types'

const SOIL_NAME: Record<SoilTexture, string> = {
  limoneux: 'limoneux',
  argileux: 'argileux',
  sableux: 'sableux',
  calcaire: 'calcaire',
  humifere: 'humifère',
}

type Choice = '' | 'oui' | 'non'

/** « Je ne sais pas quel est mon sol » : le test du boudin, en trois questions. N'écrit rien sans l'appui sur « Utiliser ce résultat ». */
export function SoilHelper({ garden }: { garden: Garden }) {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<SoilAnswers>({})
  const result = soilFromAnswers(answers)

  function use() {
    if (!result) return
    const before = garden.sol
    const after = result.sol
    const apply = (v: SoilTexture | undefined) => updateGarden(garden.id, { sol: v })
    apply(after)
    recordWithToast({ label: 'Nature du sol', undo: () => apply(before), redo: () => apply(after) }, `Sol noté : ${SOIL_NAME[after]}.`)
    setOpen(false)
    setAnswers({})
  }

  return (
    <div className="soil-helper" data-feat="test-sol">
      <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="leaf" size={16} /> Je ne sais pas quel est mon sol
      </button>
      {open && (
        <div className="soil-test">
          <p className="muted">Le test du boudin : trois questions, un peu de terre dans la main.</p>
          <p className="muted">{SOIL_TEST_LIMIT}</p>
          <ol className="soil-steps">
            {visibleQuestions(answers).map((q) => (
              <li key={q.key}>
                <p className="soil-q">{q.question}</p>
                <p className="muted soil-help">{q.help}</p>
                <Segmented<Choice>
                  label={q.question}
                  value={answers[q.key] ?? ''}
                  options={[
                    { id: 'oui', label: 'Oui' },
                    { id: 'non', label: 'Non' },
                  ]}
                  onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v as 'oui' | 'non' }))}
                />
              </li>
            ))}
          </ol>
          {result && (
            <div className="soil-result" role="status">
              <strong>Votre sol est probablement {SOIL_NAME[result.sol]}.</strong>
              <p>{result.phrase}</p>
              {garden.sol === result.sol ? (
                <p className="muted">C’est déjà le sol noté pour ce jardin.</p>
              ) : (
                <button type="button" className="btn primary" onClick={use}>
                  Utiliser ce résultat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
