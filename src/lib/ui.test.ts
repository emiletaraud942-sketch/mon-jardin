import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faux navigateur minimal : pile d'historique + événements popstate.
type FakeStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void }
const memoryStorage = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}
const brokenStorage: FakeStorage = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

function installBrowser(initialHash: string, storage?: FakeStorage) {
  const entries: { state: unknown; hash: string }[] = [{ state: null, hash: initialHash }]
  let index = 0
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const location = {
    get hash() {
      return entries[index].hash
    },
    search: '',
  }
  const history = {
    get state() {
      return entries[index].state
    },
    pushState(state: unknown, _t: string, url: string) {
      entries.splice(index + 1)
      entries.push({ state, hash: url })
      index++
    },
    replaceState(state: unknown, _t: string, url: string) {
      entries[index] = { state, hash: url }
    },
    back() {
      if (index === 0) return
      index--
      ;(listeners.popstate ?? []).forEach((l) => l({ state: entries[index].state }))
    },
  }
  vi.stubGlobal('location', location)
  vi.stubGlobal('history', history)
  if (storage) vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', {
    addEventListener: (type: string, l: (e: unknown) => void) => (listeners[type] ??= []).push(l),
  })
  return { entries, back: () => history.back(), length: () => entries.length, current: () => entries[index] }
}

async function load(hash = '', storage?: FakeStorage) {
  vi.resetModules()
  const b = installBrowser(hash, storage)
  const ui = await import('./ui')
  return { b, ui }
}

beforeEach(() => vi.unstubAllGlobals())

describe('parseHash', () => {
  it('reconnaît les onglets, ignore le reste', async () => {
    const { ui } = await load()
    expect(ui.parseHash('#plantes')).toBe('plantes')
    expect(ui.parseHash('#reglages#access_token=abc')).toBe('reglages')
    expect(ui.parseHash('#access_token=abc&type=magiclink')).toBeUndefined()
    expect(ui.parseHash('#nimporte')).toBeUndefined()
    expect(ui.parseHash('')).toBeUndefined()
  })
})

describe('onglet Voisins (entraide)', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('absent sans variables : hash ignoré, entrée du menu non proposée', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', '')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', '')
    const { ui } = await load('#voisins')
    expect(ui.tabAvailable('voisins')).toBe(false)
    expect(ui.parseHash('#voisins')).toBeUndefined()
    expect(ui.parseHash('#entraide')).toBeUndefined()
    expect(ui.getUi().tab).toBe('accueil')
    expect(ui.visibleRayons()).toEqual(['jardin', 'afaire', 'planter'])
    expect(ui.rayonAvailable('voisins')).toBe(false)
  })
  it('la clé publique peut aussi venir de VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', '')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN', 'cle')
    const { ui } = await load('#voisins')
    expect(ui.tabAvailable('voisins')).toBe(true)
  })
  it('fonctionne aussi avec les noms sans VITE_ (NEIGHBORS_SUPABASE_URL / NEIGHBORS_SUPABASE_PUBLISHABLE)', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', '')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', '')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_PUBLIC_TOKEN', '')
    vi.stubEnv('NEIGHBORS_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('NEIGHBORS_SUPABASE_PUBLISHABLE', 'cle')
    const { ui } = await load('#voisins')
    expect(ui.tabAvailable('voisins')).toBe(true)
  })
  it('présent quand configuré : #voisins et le retour #entraide ouvrent l’onglet, 4e rayon', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', 'cle')
    const { ui } = await load('#entraide')
    expect(ui.parseHash('#voisins')).toBe('voisins')
    expect(ui.parseHash('#entraide')).toBe('voisins')
    expect(ui.getUi().tab).toBe('voisins')
    expect(ui.rayonOfTab('voisins')).toBe('voisins')
    expect(ui.visibleRayons()).toEqual(['jardin', 'afaire', 'planter', 'voisins'])
  })
})

describe('historique', () => {
  it('ouvre sur l’accueil sans écran mémorisé et écrit le hash', async () => {
    const { b, ui } = await load('')
    expect(ui.getUi().tab).toBe('accueil')
    expect(b.current().hash).toBe('#accueil')
  })

  it('un hash inconnu (lien magique) n’est ni lu ni effacé', async () => {
    const { b, ui } = await load('#access_token=abc&type=magiclink')
    expect(ui.getUi().tab).toBe('accueil')
    expect(b.current().hash).toBe('#access_token=abc&type=magiclink')
  })

  it('chaque changement d’onglet ajoute une entrée et Retour revient', async () => {
    const { b, ui } = await load('#carte')
    ui.setUi({ tab: 'plantes' })
    ui.setUi({ tab: 'entretien' })
    expect(b.length()).toBe(3)
    b.back()
    expect(ui.getUi().tab).toBe('plantes')
    b.back()
    expect(ui.getUi().tab).toBe('carte')
  })

  it('ouvrir une fiche plante ajoute une entrée ; Retour la ferme', async () => {
    const { b, ui } = await load('#carte')
    ui.setUi({ selectedPlantId: 'p1' })
    expect(b.length()).toBe(2)
    b.back()
    expect(ui.getUi().selectedPlantId).toBeUndefined()
    expect(ui.getUi().tab).toBe('carte')
  })

  it('changer de plante sélectionnée remplace l’entrée (pas d’empilement)', async () => {
    const { b, ui } = await load('#carte')
    ui.setUi({ selectedPlantId: 'p1' })
    ui.setUi({ selectedPlantId: 'p2' })
    expect(b.length()).toBe(2)
  })

  it('closePlantSheet revient en arrière au lieu d’empiler', async () => {
    const { b, ui } = await load('#carte')
    ui.setUi({ selectedPlantId: 'p1' })
    ui.closePlantSheet()
    expect(ui.getUi().selectedPlantId).toBeUndefined()
    expect(b.current().hash).toBe('#carte')
    // On est revenu sur la première entrée : un nouveau clic repart proprement.
    ui.setUi({ selectedPlantId: 'p1' })
    expect(b.length()).toBe(2)
  })

  it('une plante ouverte depuis un autre onglet ne ramène pas à cet onglet quand on la ferme', async () => {
    const { ui } = await load('#carte')
    ui.setUi({ tab: 'entretien' })
    ui.setUi({ tab: 'carte', selectedPlantId: 'p1' })
    ui.closePlantSheet()
    expect(ui.getUi().tab).toBe('carte')
    expect(ui.getUi().selectedPlantId).toBeUndefined()
  })

  it('openSpecies empile les fiches vues dans le catalogue', async () => {
    const { b, ui } = await load('#carte')
    ui.openSpecies('pommier')
    ui.openSpecies('poirier')
    expect(b.length()).toBe(3)
    b.back()
    expect(ui.getUi().speciesId).toBe('pommier')
  })

  it('quitter la carte abandonne le placement en cours', async () => {
    const { ui } = await load('#carte')
    ui.startPlacing('pommier')
    expect(ui.getUi().placingSpeciesId).toBe('pommier')
    ui.setUi({ tab: 'plantes' })
    expect(ui.getUi().placingSpeciesId).toBeUndefined()
  })

  it('le placement en série mémorise un compteur et s’arrête avec stopPlacing', async () => {
    const { ui } = await load('#carte')
    ui.startPlacing('pommier', { series: true })
    expect(ui.getUi().placingSeries).toEqual({ count: 0 })
    ui.stopPlacing()
    expect(ui.getUi().placingSeries).toBeUndefined()
    expect(ui.getUi().placingSpeciesId).toBeUndefined()
  })

  it('« Déplacer cette plante » ouvre la carte, remplace un placement et s’arrête avec stopPlacing', async () => {
    const { ui } = await load('#plantes')
    ui.startPlacing('pommier')
    ui.startMoving('p1')
    expect(ui.getUi().tab).toBe('carte')
    expect(ui.getUi().movingPlantId).toBe('p1')
    expect(ui.getUi().placingSpeciesId).toBeUndefined()
    ui.stopPlacing()
    expect(ui.getUi().movingPlantId).toBeUndefined()
    ui.startMoving('p1')
    ui.setUi({ tab: 'plantes' })
    expect(ui.getUi().movingPlantId).toBeUndefined()
  })

  it('une nouvelle plante à placer annule un déplacement en cours', async () => {
    const { ui } = await load('#carte')
    ui.startMoving('p1')
    ui.startPlacing('pommier')
    expect(ui.getUi().movingPlantId).toBeUndefined()
    expect(ui.getUi().placingSpeciesId).toBe('pommier')
  })

  it('les écrans portent les noms du lexique', async () => {
    const { ui } = await load('#carte')
    expect(ui.TAB_LABEL['3d']).toBe('Vue 3D')
    expect(ui.TAB_LABEL.planter).toBe('Où planter ?')
    expect(ui.TAB_LABEL.voisins).toBe('Voisins')
  })
})

describe('rayons', () => {
  it('chaque rayon regroupe ses écrans ; accueil et compte n’en font partie d’aucun', async () => {
    const { ui } = await load()
    expect(ui.RAYON_TABS.jardin).toEqual(['carte', 'plantes', '3d'])
    expect(ui.RAYON_TABS.afaire).toEqual(['entretien'])
    expect(ui.RAYON_TABS.planter).toEqual(['planter', 'catalogue'])
    expect(ui.RAYON_TABS.voisins).toEqual(['voisins'])
    expect(ui.rayonOfTab('accueil')).toBeUndefined()
    expect(ui.rayonOfTab('reglages')).toBeUndefined()
    // Aucun écran ne disparaît : tous sont dans un rayon, sauf l’accueil et le compte.
    for (const t of ui.TABS.filter((x) => x !== 'accueil' && x !== 'reglages')) expect(ui.rayonOfTab(t)).toBeDefined()
    expect(ui.RAYON_LABEL).toEqual({ jardin: 'Mon jardin', afaire: 'À faire', planter: 'Planter', voisins: 'Voisins' })
  })

  it('barre du bas : 3 entrées sans l’entraide, 4 avec', async () => {
    const { ui } = await load()
    expect(ui.visibleRayons(true)).toEqual(['jardin', 'afaire', 'planter', 'voisins'])
    expect(ui.visibleRayons(false)).toEqual(['jardin', 'afaire', 'planter'])
  })

  it('le bouton Accueil de la barre ouvre l’écran à 4 rayons depuis n’importe quel écran', async () => {
    const { ui } = await load()
    ui.setUi({ tab: 'entretien' })
    ui.setUi({ tab: 'accueil' })
    expect(ui.getUi().tab).toBe('accueil')
    expect(ui.rayonOfTab(ui.getUi().tab)).toBeUndefined() // aucun rayon actif : seul « Accueil » l'est
  })

  it('sélecteur segmenté : Carte / Plantes / Vue 3D et Où planter ? / Catalogue seulement', async () => {
    const { ui } = await load()
    expect(ui.subTabs('jardin')).toEqual(['carte', 'plantes', '3d'])
    expect(ui.subTabs('planter')).toEqual(['planter', 'catalogue'])
    expect(ui.subTabs('afaire')).toEqual([])
    expect(ui.subTabs(undefined)).toEqual([])
  })

  it('ouvre l’accueil sans mémoire, même si localStorage est indisponible', async () => {
    const { ui } = await load('', brokenStorage)
    expect(ui.getUi().tab).toBe('accueil')
    ui.setUi({ tab: 'entretien' }) // ne doit pas lever
    expect(ui.getUi().rayon).toBe('afaire')
    ui.setGuide({ stepsHidden: false })
    expect(ui.getUi().guide.stepsHidden).toBe(false)
  })

  it('goRayon ouvre l’écran d’arrivée du rayon, sans rien changer si l’on y est déjà', async () => {
    const { b, ui } = await load('#plantes')
    const len = b.length()
    ui.goRayon('jardin')
    expect(ui.getUi().tab).toBe('plantes')
    expect(b.length()).toBe(len)
    ui.goRayon('afaire')
    expect(ui.getUi()).toMatchObject({ tab: 'entretien', rayon: 'afaire' })
    ui.goRayon('planter')
    expect(ui.getUi().tab).toBe('planter')
    ui.goRayon('jardin')
    expect(ui.getUi().tab).toBe('carte')
  })

  it('le compte et l’accueil gardent le dernier rayon', async () => {
    const { ui } = await load('#entretien')
    ui.setUi({ tab: 'reglages' })
    expect(ui.getUi().rayon).toBe('afaire')
    ui.setUi({ tab: 'accueil' })
    expect(ui.getUi().rayon).toBe('afaire')
  })

  it('Retour restitue l’écran et le rayon', async () => {
    const { b, ui } = await load('#carte')
    ui.setUi({ tab: 'entretien' })
    ui.setUi({ tab: 'carte' })
    b.back()
    expect(ui.getUi()).toMatchObject({ tab: 'entretien', rayon: 'afaire' })
  })

  it('mémorise le dernier rayon et rouvre dessus au lancement suivant', async () => {
    const storage = memoryStorage()
    const first = await load('', storage)
    first.ui.setUi({ tab: 'catalogue' })
    expect(storage.data.get('pj.rayon')).toBe('planter')
    const second = await load('', storage)
    expect(second.ui.getUi()).toMatchObject({ tab: 'planter', rayon: 'planter' })
  })

  it('un hash explicite l’emporte sur le dernier rayon', async () => {
    const storage = memoryStorage({ 'pj.rayon': 'planter' })
    expect((await load('#plantes', storage)).ui.getUi().tab).toBe('plantes')
    expect((await load('#accueil', storage)).ui.getUi().tab).toBe('accueil')
  })

  it('migre l’ancien mode mémorisé (pj.mode) vers un rayon', async () => {
    expect((await load('', memoryStorage({ 'pj.mode': 'entretenir' }))).ui.getUi()).toMatchObject({ tab: 'entretien', rayon: 'afaire' })
    expect((await load('', memoryStorage({ 'pj.mode': 'planifier' }))).ui.getUi().tab).toBe('planter')
    expect((await load('', memoryStorage({ 'pj.mode': 'jardin' }))).ui.getUi().tab).toBe('carte')
    expect((await load('', memoryStorage({ 'pj.mode': 'nimporte', 'pj.guide': '{pas du json' }))).ui.getUi().tab).toBe('accueil')
  })

  it('le rayon Voisins mémorisé est ignoré si l’entraide est désactivée', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', '')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', '')
    const { ui } = await load('', memoryStorage({ 'pj.rayon': 'voisins' }))
    expect(ui.getUi().tab).toBe('accueil')
    vi.unstubAllEnvs()
  })

  it('les anciens liens restent valides (#carte, #plantes, #entretien, #reglages…) et ont des alias', async () => {
    const { ui } = await load()
    for (const t of ['carte', '3d', 'plantes', 'entretien', 'planter', 'catalogue', 'reglages', 'accueil'] as const) {
      expect(ui.fromHash(ui.toHash(t))).toBe(t)
    }
    expect(ui.fromHash('#jardin')).toBe('carte')
    expect(ui.fromHash('#afaire')).toBe('entretien')
    expect(ui.fromHash('#compte')).toBe('reglages')
    expect((await load('#entretien')).ui.getUi()).toMatchObject({ tab: 'entretien', rayon: 'afaire' })
    expect((await load('#reglages')).ui.getUi().rayon).toBeUndefined()
  })
})

describe('parcours d’accueil (état d’interface)', () => {
  it('rien d’enregistré au départ ; l’état est écrit dans localStorage, pas ailleurs', async () => {
    const storage = memoryStorage()
    const { ui } = await load('', storage)
    expect(ui.getUi().guide.onboarding).toBeUndefined()
    ui.noteWelcomed()
    ui.noteStep('adresse', 'done')
    ui.noteStep('terrain', 'skipped')
    expect(ui.getUi().guide.onboarding).toMatchObject({ welcomed: true, done: ['adresse'], skipped: ['terrain'] })
    const again = await load('', storage)
    expect(again.ui.getUi().guide.onboarding).toMatchObject({ welcomed: true, done: ['adresse'], skipped: ['terrain'] })
  })

  it('un état enregistré illisible est ignoré', async () => {
    const { ui } = await load('', memoryStorage({ 'pj.guide': JSON.stringify({ onboarding: 'oui', demoHidden: true }) }))
    expect(ui.getUi().guide.onboarding).toBeUndefined()
    expect(ui.getUi().guide.demoHidden).toBe(true)
  })

  it('« Passer et découvrir l’appli » masque la carte de route', async () => {
    const { ui } = await load()
    ui.hideOnboardingRoute()
    expect(ui.getUi().guide.onboarding?.hidden).toBe(true)
  })

  it('ouvrir le parcours, changer d’écran le ferme ; Revoir la visite le rouvre à la première étape', async () => {
    const { ui } = await load('#accueil')
    ui.openParcours('terrain')
    expect(ui.getUi().parcours).toBe('terrain')
    ui.setUi({ tab: 'carte' })
    expect(ui.getUi().parcours).toBeUndefined()
    ui.noteStep('adresse', 'done')
    ui.restartOnboarding()
    expect(ui.getUi()).toMatchObject({ tab: 'accueil', parcours: 'adresse' })
    expect(ui.getUi().guide.onboarding).toMatchObject({ done: [], skipped: [], hidden: false, welcomed: true })
  })

  it('choisir une plante depuis l’étape « Mes plantes » valide l’étape et quitte le parcours', async () => {
    const { ui } = await load('#accueil')
    ui.openParcours('plantes')
    ui.startPlacing('pommier')
    expect(ui.getUi()).toMatchObject({ tab: 'carte', placingSpeciesId: 'pommier', parcours: undefined })
    expect(ui.getUi().guide.onboarding?.done).toContain('plantes')
  })
})

describe('repères mémorisés (guide)', () => {
  it('noteVisit retient la 3D et Entretien par jardin, sans doublon', async () => {
    const storage = memoryStorage()
    const { ui } = await load('', storage)
    ui.noteVisit('3d', 'g1')
    ui.noteVisit('3d', 'g1')
    ui.noteVisit('entretien', 'g1')
    ui.noteVisit('carte', 'g1')
    expect(ui.getUi().guide.opened3d).toEqual(['g1'])
    expect(ui.getUi().guide.openedEntretien).toEqual(['g1'])
    const again = await load('', storage)
    expect(again.ui.getUi().guide.opened3d).toEqual(['g1'])
  })

  it('« Plus tard » repousse la proposition de 7 jours', async () => {
    const { ui } = await load('')
    const t0 = Date.now()
    ui.setGuide({ nudgeUntil: t0 + ui.NUDGE_SNOOZE_MS })
    expect(ui.getUi().guide.nudgeUntil - t0).toBe(7 * 86400000)
  })
})
