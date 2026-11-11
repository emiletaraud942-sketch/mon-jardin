// Amène l'écran à une fonction : ouvre les panneaux repliés, fait défiler jusqu'à l'élément `data-feat="…"` et le met en évidence.
// Les écrans qui se chargent à la demande (la carte) peuvent mettre un instant à apparaître : on attend jusqu'à 4 secondes.

const WAIT_MS = 4000
let seq = 0

/** Élément d'un écran, repéré par `data-feat`. */
export const featSelector = (id: string) => `[data-feat="${id}"]`

/** Ouvre les <details> repliés qui contiennent l'élément. */
export function openAncestors(el: Element) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.tagName === 'DETAILS' && !(p as HTMLDetailsElement).open) (p as HTMLDetailsElement).open = true
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const shown = (el: Element) => el.getClientRects().length > 0

async function waitFor(id: string, token: number, until: number): Promise<HTMLElement | undefined> {
  while (Date.now() < until) {
    if (token !== seq) return undefined
    const el = document.querySelector<HTMLElement>(featSelector(id))
    if (el) {
      openAncestors(el)
      if (shown(el)) return el
    }
    await sleep(60)
  }
  return undefined
}

/**
 * Montre la fonction désignée par `path` : chaque élément sauf le dernier est touché pour ouvrir son panneau
 * (sauf s'il est déjà ouvert), le dernier est amené à l'écran et clignote. `activate` : le dernier est aussi touché.
 * Si le dernier élément n'existe pas (aucune tâche, par exemple), on montre le dernier trouvé. Renvoie l'élément montré.
 */
export async function reveal(path: string[], opts: { activate?: boolean } = {}): Promise<HTMLElement | undefined> {
  const token = ++seq
  const until = Date.now() + WAIT_MS
  let found: HTMLElement | undefined
  for (let i = 0; i < path.length; i++) {
    const last = i === path.length - 1
    const el = await waitFor(path[i], token, last && found ? Math.min(until, Date.now() + 1500) : until)
    if (token !== seq) return undefined
    if (!el) break
    found = el
    const open = el.getAttribute('aria-expanded') === 'true' || el.getAttribute('aria-pressed') === 'true'
    if ((!last || opts.activate) && !open) {
      el.click()
      if (!last) await sleep(120)
    }
  }
  if (!found) return undefined
  found.scrollIntoView({ block: 'center', behavior: 'auto' })
  found.classList.remove('feat-flash')
  void found.offsetWidth // relance l'animation
  found.classList.add('feat-flash')
  window.setTimeout(() => found?.classList.remove('feat-flash'), 2600)
  return found
}
