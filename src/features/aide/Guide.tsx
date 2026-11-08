import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { FEATURES, visibleFeatures, type Feature } from '../../lib/features'
import { goHome } from '../../lib/goHome'
import { GUIDE_TITLE, GUIDE_TREE, type GuideBranch, type GuideLeaf } from '../../lib/guideTree'
import { useInertBehind } from '../../lib/inert'
import { guideOpen, toutFaire } from '../../lib/overlays'
import { useBackLayer } from '../../lib/ui'
import { RUN_DELAY_MS } from './ToutFaire'

/** La fonction du registre derrière une réponse finale (rien si elle n'est pas proposée sur cet appareil). */
export function leafFeature(leaf: GuideLeaf, list: Feature[] = visibleFeatures()): Feature | undefined {
  return list.find((f) => f.id === leaf.feature)
}

/** Une réponse finale : ferme le guide, puis lance la fonction. */
export function chooseLeaf(leaf: GuideLeaf) {
  const f = FEATURES.find((x) => x.id === leaf.feature)
  guideOpen.set(false)
  if (f) window.setTimeout(() => f.run(), RUN_DELAY_MS)
}

/**
 * Un calque de Retour par écran du guide : fermé puis rouvert dans le même tour, il réutilise son entrée d'historique.
 * Retour d'Android à la question : revient au départ ; au départ : ferme le guide.
 */
function GuideLayer({ onBack }: { onBack: () => void }) {
  useBackLayer(true, onBack)
  return null
}

/** Mode guidé « Que voulez-vous faire ? » : une question par écran, trois ou quatre gros boutons. */
export function Guide() {
  const ref = useRef<HTMLDivElement>(null)
  const [branchId, setBranchId] = useState<string | undefined>()
  const branch: GuideBranch | undefined = GUIDE_TREE.find((b) => b.id === branchId)
  const back = () => (branch ? setBranchId(undefined) : guideOpen.set(false))
  const backRef = useRef(back)
  backRef.current = back
  useInertBehind(true)
  useEffect(() => ref.current?.focus({ preventScroll: true }), [branchId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && backRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const leaves = branch ? branch.answers.filter((a) => leafFeature(a)) : []
  return (
    <div ref={ref} className="tf-overlay guide" role="dialog" aria-modal="true" aria-label={GUIDE_TITLE} data-feat="guide" tabIndex={-1}>
      <GuideLayer key={branchId ?? 'depart'} onBack={() => backRef.current()} />
      <header className="tf-head">
        <button className="btn tf-top" onClick={back}>
          <Icon name={branch ? 'back' : 'x'} size={18} /> {branch ? 'Retour' : 'Fermer'}
        </button>
        <button className="btn tf-top" onClick={goHome}>
          <Icon name="home" size={18} /> Accueil
        </button>
        <h1>{branch ? branch.question : GUIDE_TITLE}</h1>
        <p className="guide-step">{branch ? 'Question 2 sur 2' : 'Question 1 sur 2'}</p>
      </header>
      <div className="tf-body guide-body">
        {!branch &&
          GUIDE_TREE.map((b) => (
            <button key={b.id} className="guide-btn" data-guide={b.id} onClick={() => setBranchId(b.id)}>
              <span className="guide-btn-text">
                <strong>{b.mot}</strong>
              </span>
              <Icon name="forward" size={22} />
            </button>
          ))}
        {branch &&
          leaves.map((a) => (
            <button key={a.feature} className="guide-btn" data-guide-leaf={a.feature} onClick={() => chooseLeaf(a)}>
              <span className="guide-btn-text">
                <strong>{a.mot}</strong>
                <span>{a.phrase}</span>
              </span>
              <Icon name="forward" size={22} />
            </button>
          ))}
        {!branch && (
          <button
            className="btn guide-all"
            onClick={() => {
              guideOpen.set(false)
              window.setTimeout(() => toutFaire.set(true), RUN_DELAY_MS)
            }}
          >
            <Icon name="list" size={20} /> Autre chose : tout ce que je peux faire
          </button>
        )}
      </div>
    </div>
  )
}
