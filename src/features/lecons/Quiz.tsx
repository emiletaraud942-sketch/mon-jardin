import { useState } from 'react'
import { Icon } from '../../components/Icon'
import type { QuizQuestion } from '../../data/lecons'

/** Phrases du quiz : jamais de note chiffrée, jamais « faux ». */
export const QUIZ_TEXT = {
  title: 'Petit quiz',
  intro: 'Trois questions pour vérifier. Aucune note : c’est pour vous.',
  check: 'Voir mes réponses',
  retry: 'Recommencer le quiz',
  missing: 'Répondez aux trois questions, puis touchez « Voir mes réponses ».',
  right: 'Bonne réponse.',
  notYet: 'Pas encore.',
  allRight: 'Bravo : tout est juste.',
  somePending: 'Presque. Relisez les points ci-dessus, puis recommencez quand vous voulez.',
} as const

/**
 * Les explications du contenu commencent par un compliment (« Oui, », « Bravo : », « Bien vu : ») écrit pour une bonne réponse.
 * On le retire pour que la même phrase serve aussi après une réponse à revoir, sans compliment déplacé.
 */
export function plainExplanation(text: string): string {
  const t = text.replace(/^(Oui|Exact|Bravo|Bien vu)\s*[:,]?\s*/u, '')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : text
}

/** Mini-quiz : questions visibles ensemble, choix à la souris, au doigt ou aux flèches, résultat annoncé à voix haute. */
export function Quiz({ lessonId, questions }: { lessonId: string; questions: QuizQuestion[] }) {
  const [picked, setPicked] = useState<(number | undefined)[]>(() => questions.map(() => undefined))
  const [checked, setChecked] = useState(false)
  const [missing, setMissing] = useState(false)
  const correct = questions.map((q, i) => picked[i] === q.bonne)
  const all = correct.every(Boolean)
  const name = (i: number) => `quiz-${lessonId}-${i}`

  const check = () => {
    if (picked.some((p) => p === undefined)) {
      setMissing(true)
      return
    }
    setMissing(false)
    setChecked(true)
  }
  const retry = () => {
    setPicked(questions.map(() => undefined))
    setChecked(false)
    setMissing(false)
  }

  return (
    <section className="lecon-quiz" aria-labelledby={`quiz-${lessonId}-h`}>
      <h2 id={`quiz-${lessonId}-h`}>{QUIZ_TEXT.title}</h2>
      <p className="small muted">{QUIZ_TEXT.intro}</p>
      {questions.map((q, i) => (
        <fieldset key={i} className="lecon-q">
          <legend>
            <span className="lecon-q-n">
              Question {i + 1} sur {questions.length}
            </span>
            {q.question}
          </legend>
          <div className="lecon-choices">
            {q.choix.map((c, j) => (
              <label key={j} className={'lecon-choice' + (picked[i] === j ? ' on' : '')}>
                <input
                  type="radio"
                  name={name(i)}
                  value={j}
                  checked={picked[i] === j}
                  onChange={() => {
                    setPicked((p) => p.map((v, k) => (k === i ? j : v)))
                    setChecked(false) // changer une réponse efface le résultat : on peut réessayer tout de suite
                    setMissing(false)
                  }}
                />
                <span>{c}</span>
              </label>
            ))}
          </div>
          {/* Zone annoncée : toujours dans la page, remplie au moment de la vérification. */}
          <div className="lecon-feedback" aria-live="polite">
            {checked && (
              <p className={correct[i] ? 'lecon-right' : 'lecon-notyet'}>
                <Icon name={correct[i] ? 'check' : 'help'} size={20} />
                <span>
                  <strong>{correct[i] ? QUIZ_TEXT.right : QUIZ_TEXT.notYet}</strong>
                  {!correct[i] && <> La bonne réponse : « {q.choix[q.bonne]} ».</>} {plainExplanation(q.explication)}
                </span>
              </p>
            )}
          </div>
        </fieldset>
      ))}
      <div className="lecon-status" role="status" aria-live="polite">
        {missing && !checked ? <p>{QUIZ_TEXT.missing}</p> : null}
        {checked ? <p className="lecon-summary">{all ? QUIZ_TEXT.allRight : QUIZ_TEXT.somePending}</p> : null}
      </div>
      {checked ? (
        <button type="button" className="btn lecon-btn" onClick={retry}>
          {QUIZ_TEXT.retry}
        </button>
      ) : (
        <button type="button" className="btn primary lecon-btn" onClick={check}>
          {QUIZ_TEXT.check}
        </button>
      )}
    </section>
  )
}
