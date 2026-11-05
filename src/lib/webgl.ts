// Détection de WebGL : UNE seule source de vérité, légère (aucun import de three), dans le bundle principal.
//  - `webgl2Supported()` : WebGL 2 existe-t-il, même en rendu logiciel ? C'est la question de MapLibre 6 (carte 2D, qui reste
//    utilisable en SwiftShader : ne jamais lui appliquer « software »). iPhone sous iOS 14 ou moins, très vieux Android, GPU bloqué : faux.
//  - `detectWebGL()` : verdict pour la 3D (three 0.186 n'a plus de repli WebGL 1), avec un cran de plus : ok / software / none.
//    « none » vient toujours de `webgl2Supported()` ; « software » = WebGL 2 existe mais le navigateur annonce un « gros défaut de
//    performance » (failIfMajorPerformanceCaveat) ou un moteur logiciel (SwiftShader, llvmpipe) : la 3D serait trop lente.

let cached: boolean | undefined

/** Le navigateur peut-il créer un contexte WebGL 2 ? Résultat mémorisé (la réponse ne change pas en cours de session). */
export function webgl2Supported(create: () => { getContext(id: string): unknown } | null = () => (typeof document === 'undefined' ? null : document.createElement('canvas'))): boolean {
  if (cached !== undefined) return cached
  try {
    cached = !!create()?.getContext('webgl2')
  } catch {
    cached = false
  }
  return cached
}

/** Pour les tests : oublie la réponse mémorisée (et le verdict de la 3D qui en dépend). */
export function resetWebgl2Cache() {
  cached = undefined
  verdictCache = undefined
}

/** ok : accéléré ; software : rendu logiciel / « gros défaut de performance » (3D trop lente) ; none : WebGL2 absent ou désactivé. */
export type WebGLVerdict = 'ok' | 'software' | 'none'

export interface WebGLProbe {
  /** `getContext('webgl2', { failIfMajorPerformanceCaveat: true })` a réussi. */
  strict: boolean
  /** `getContext('webgl2')` (sans exigence de performance) a réussi. */
  any: boolean
  /** Nom du moteur de rendu (WEBGL_debug_renderer_info), s'il est exposé. */
  renderer?: string
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i

export function isSoftwareRenderer(renderer: string | undefined): boolean {
  return !!renderer && SOFTWARE_RENDERER.test(renderer)
}

/** Pure : verdict d'après les sondes. */
export function classifyWebGL(p: WebGLProbe): WebGLVerdict {
  if (p.strict) return isSoftwareRenderer(p.renderer) ? 'software' : 'ok'
  return p.any ? 'software' : 'none'
}

/** Sonde le navigateur : crée un canvas jetable et libère ses contextes (Chrome n'en admet qu'une quinzaine). */
export function probeWebGL(doc: Pick<Document, 'createElement'> | undefined = typeof document !== 'undefined' ? document : undefined): WebGLProbe {
  const out: WebGLProbe = { strict: false, any: false }
  if (!doc) return out
  const release = (gl: WebGL2RenderingContext | null) => {
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      /* rien à libérer */
    }
  }
  try {
    const strict = doc.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null
    if (strict) {
      out.strict = out.any = true
      try {
        const ext = strict.getExtension('WEBGL_debug_renderer_info')
        const name = ext ? strict.getParameter(ext.UNMASKED_RENDERER_WEBGL) : strict.getParameter(strict.RENDERER)
        if (typeof name === 'string') out.renderer = name
      } catch {
        /* nom indisponible */
      }
      release(strict)
      return out
    }
    const any = doc.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null
    if (any) {
      out.any = true
      release(any)
    }
  } catch {
    /* WebGL lève une erreur : traité comme absent */
  }
  return out
}

let verdictCache: WebGLVerdict | undefined
/**
 * Verdict mis en cache pour la session (la sonde ne tourne qu'une fois). Hors navigateur : ok (rien à bloquer).
 * « none » = exactement le refus de `webgl2Supported()` (même réponse que la carte) ; la sonde stricte ne tourne qu'ensuite.
 */
export function detectWebGL(): WebGLVerdict {
  if (verdictCache) return verdictCache
  if (typeof document === 'undefined') return 'ok'
  verdictCache = webgl2Supported() ? classifyWebGL(probeWebGL()) : 'none'
  return verdictCache
}
/** Pour les tests : oublie le verdict mis en cache (la réponse de `webgl2Supported` est gardée). */
export function resetWebGLCache(): void {
  verdictCache = undefined
}

// ---------- « Essayer quand même » ----------

const FORCE_KEY = 'pj.force3d'
let forced = false
/** L'utilisateur a choisi « Essayer quand même » (valable pour la session ; jamais écrit durablement). */
export function force3dRequested(): boolean {
  if (forced) return true
  try {
    return sessionStorage.getItem(FORCE_KEY) === '1'
  } catch {
    return false
  }
}
export function requestForce3d(): void {
  forced = true
  try {
    sessionStorage.setItem(FORCE_KEY, '1')
  } catch {
    /* la décision ne dure que pour cet affichage */
  }
}
export function clearForce3d(): void {
  forced = false
  try {
    sessionStorage.removeItem(FORCE_KEY)
  } catch {
    /* rien */
  }
}

/** Texte d'explication selon le verdict. */
export function webglExplanation(v: WebGLVerdict): string {
  return v === 'none'
    ? 'Le dessin 3D (WebGL) est absent ou désactivé sur ce navigateur.'
    : 'Cet appareil n’a pas de carte graphique utilisable : la 3D serait très lente.'
}
export const NO_3D_TITLE = 'Votre appareil ne peut pas afficher la 3D'
