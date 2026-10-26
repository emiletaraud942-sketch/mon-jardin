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
    expect(ui.getUi().tab).toBe('carte')
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
  it('présent quand configuré : #voisins et le retour #entraide ouvrent l’onglet, dans « Plus »', async () => {
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_NEIGHBORS_SUPABASE_ANON_KEY', 'cle')
    const { ui } = await load('#entraide')
    expect(ui.parseHash('#voisins')).toBe('voisins')
    expect(ui.parseHash('#entraide')).toBe('voisins')
    expect(ui.getUi().tab).toBe('voisins')
    expect(ui.ALWAYS_TABS).toContain('voisins')
    for (const m of ui.MODES) expect(ui.tabInMode(m, 'voisins')).toBe(true)
  })
})

describe('historique', () => {
  it('ouvre sur la carte et écrit le hash', async () => {
    const { b, ui } = await load('')
    expect(ui.getUi().tab).toBe('carte')
    expect(b.current().hash).toBe('#carte')
  })

  it('un hash inconnu (lien magique) n’est ni lu ni effacé', async () => {
    const { b, ui } = await load('#access_token=abc&type=magiclink')
    expect(ui.getUi().tab).toBe('carte')
    expect(b.current().hash).toBe('#access_token=abc&type=magiclink')
  })

  it('chaque changement d’onglet ajoute une entrée et Retour revient', async () => {
    const { b, ui } = await load('')
    ui.setUi({ tab: 'plantes' })
    ui.setUi({ tab: 'entretien' })
    expect(b.length()).toBe(3)
    b.back()
    expect(ui.getUi().tab).toBe('plantes')
    b.back()
    expect(ui.getUi().tab).toBe('carte')
  })

  it('ouvrir une fiche plante ajoute une entrée ; Retour la ferme', async () => {
    const { b, ui } = await load('')
    ui.setUi({ selectedPlantId: 'p1' })
    expect(b.length()).toBe(2)
    b.back()
    expect(ui.getUi().selectedPlantId).toBeUndefined()
    expect(ui.getUi().tab).toBe('carte')
  })

  it('changer de plante sélectionnée remplace l’entrée (pas d’empilement)', async () => {
    const { b, ui } = await load('')
    ui.setUi({ selectedPlantId: 'p1' })
    ui.setUi({ selectedPlantId: 'p2' })
    expect(b.length()).toBe(2)
  })

  it('closePlantSheet revient en arrière au lieu d’empiler', async () => {
    const { b, ui } = await load('')
    ui.setUi({ selectedPlantId: 'p1' })
    ui.closePlantSheet()
    expect(ui.getUi().selectedPlantId).toBeUndefined()
    expect(b.current().hash).toBe('#carte')
    // On est revenu sur la première entrée : un nouveau clic repart proprement.
    ui.setUi({ selectedPlantId: 'p1' })
    expect(b.length()).toBe(2)
  })

  it('une plante ouverte depuis un autre onglet ne ramène pas à cet onglet quand on la ferme', async () => {
    const { ui } = await load('')
    ui.setUi({ tab: 'entretien' })
    ui.setUi({ tab: 'carte', selectedPlantId: 'p1' })
    ui.closePlantSheet()
    expect(ui.getUi().tab).toBe('carte')
    expect(ui.getUi().selectedPlantId).toBeUndefined()
  })

  it('openSpecies empile les fiches vues dans le catalogue', async () => {
    const { b, ui } = await load('')
    ui.openSpecies('pommier')
    ui.openSpecies('poirier')
    expect(b.length()).toBe(3)
    b.back()
    expect(ui.getUi().speciesId).toBe('pommier')
  })

  it('quitter la carte abandonne le placement en cours', async () => {
    const { ui } = await load('')
    ui.startPlacing('pommier')
    expect(ui.getUi().placingSpeciesId).toBe('pommier')
    ui.setUi({ tab: 'plantes' })
    expect(ui.getUi().placingSpeciesId).toBeUndefined()
  })

  it('le placement en série mémorise un compteur et s’arrête avec stopPlacing', async () => {
    const { ui } = await load('')
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
    const { ui } = await load('')
    ui.startMoving('p1')
    ui.startPlacing('pommier')
    expect(ui.getUi().movingPlantId).toBeUndefined()
    expect(ui.getUi().placingSpeciesId).toBe('pommier')
  })

  it('les écrans portent les noms du lexique', async () => {
    const { ui } = await load('')
    expect(ui.TAB_LABEL['3d']).toBe('Vue 3D')
    expect(ui.TAB_LABEL.planter).toBe('Où planter ?')
    expect(ui.TAB_LABEL.voisins).toBe('Entraide')
  })
})

describe('modes', () => {
  it('associe chaque mode à ses onglets, Catalogue et Réglages restant accessibles partout', async () => {
    const { ui } = await load()
    expect(ui.MODE_TABS.jardin).toEqual(['carte', '3d', 'plantes'])
    expect(ui.MODE_TABS.entretenir).toEqual(['entretien', 'plantes'])
    expect(ui.MODE_TABS.planifier).toEqual(['planter', 'catalogue', '3d'])
    for (const m of ui.MODES) {
      expect(ui.tabInMode(m, 'reglages')).toBe(true)
      expect(ui.tabInMode(m, 'catalogue')).toBe(true)
      expect(ui.MODE_TABS[m].length).toBeLessThanOrEqual(5)
    }
    expect(ui.tabInMode('entretenir', 'carte')).toBe(false)
  })

  it('barre du bas du téléphone : 4 entrées + Menu, Entraide seulement si activée', async () => {
    const { ui } = await load()
    expect(ui.mobileBarTabs(true)).toEqual(['carte', 'plantes', 'entretien', 'voisins'])
    expect(ui.mobileBarTabs(false)).not.toContain('voisins')
    expect(ui.mobileBarTabs(true).length + 1).toBeLessThanOrEqual(5)
    expect(ui.mobileMenuTabs(true)).toEqual(expect.arrayContaining(['3d', 'planter', 'catalogue', 'reglages']))
    expect(ui.mobileMenuTabs(false)).not.toContain('voisins')
    for (const t of ui.TABS.filter((x) => ui.tabAvailable(x))) {
      expect(ui.mobileBarTabs().includes(t) || ui.mobileMenuTabs().includes(t)).toBe(true)
    }
  })

  it('mode par défaut : jardin sous 3 plantes, sinon entretenir', async () => {
    const { ui } = await load()
    expect(ui.defaultMode(0)).toBe('jardin')
    expect(ui.defaultMode(2)).toBe('jardin')
    expect(ui.defaultMode(3)).toBe('entretenir')
  })

  it('ouvre sur « jardin » sans mémoire, même si localStorage est indisponible', async () => {
    const { ui } = await load('', brokenStorage)
    expect(ui.getUi().mode).toBe('jardin')
    ui.setMode('entretenir') // ne doit pas lever
    expect(ui.getUi().mode).toBe('entretenir')
    ui.setGuide({ stepsHidden: false })
    expect(ui.getUi().guide.stepsHidden).toBe(false)
  })

  it('fonctionne sans localStorage du tout', async () => {
    const { ui } = await load('')
    ui.setMode('planifier')
    expect(ui.getUi().tab).toBe('planter')
  })

  it('changer de mode choisit l’onglet par défaut et ajoute une entrée d’historique', async () => {
    const { b, ui } = await load('')
    ui.setMode('entretenir')
    expect(ui.getUi()).toMatchObject({ mode: 'entretenir', tab: 'entretien' })
    expect(b.current().hash).toBe('#entretien')
    expect(b.length()).toBe(2)
    ui.setMode('planifier')
    expect(ui.getUi().tab).toBe('planter')
    b.back()
    expect(ui.getUi()).toMatchObject({ mode: 'entretenir', tab: 'entretien' })
    b.back()
    expect(ui.getUi()).toMatchObject({ mode: 'jardin', tab: 'carte' })
  })

  it('cliquer le mode déjà actif sur un de ses onglets ne change rien', async () => {
    const { b, ui } = await load('')
    ui.setUi({ tab: 'plantes' })
    const len = b.length()
    ui.setMode('jardin')
    expect(ui.getUi().tab).toBe('plantes')
    expect(b.length()).toBe(len)
  })

  it('un onglet hors du mode courant bascule dans le bon mode', async () => {
    const { ui } = await load('')
    ui.setMode('entretenir')
    ui.setUi({ tab: 'carte', focusPlantId: 'p1' }) // « Voir sur la carte »
    expect(ui.getUi().mode).toBe('jardin')
    ui.setUi({ tab: 'entretien' })
    expect(ui.getUi().mode).toBe('entretenir')
    ui.setUi({ tab: 'planter' })
    expect(ui.getUi().mode).toBe('planifier')
  })

  it('un onglet commun à deux modes garde le mode courant ; Réglages et Catalogue n’en changent aucun', async () => {
    const { ui } = await load('')
    ui.setMode('planifier')
    ui.setUi({ tab: '3d' })
    expect(ui.getUi().mode).toBe('planifier')
    ui.setUi({ tab: 'reglages' })
    expect(ui.getUi().mode).toBe('planifier')
    ui.setMode('entretenir')
    ui.setUi({ tab: 'plantes' })
    expect(ui.getUi().mode).toBe('entretenir')
    ui.setUi({ tab: 'catalogue' })
    expect(ui.getUi().mode).toBe('entretenir')
  })

  it('le hash d’un lien direct fixe le mode (#entretien, #planter)', async () => {
    expect((await load('#entretien')).ui.getUi().mode).toBe('entretenir')
    expect((await load('#planter')).ui.getUi().mode).toBe('planifier')
    expect((await load('#reglages')).ui.getUi().mode).toBe('jardin')
  })

  it('Retour restitue le mode de l’écran retrouvé', async () => {
    const { b, ui } = await load('')
    ui.setUi({ tab: 'entretien' })
    ui.setUi({ tab: 'carte' })
    expect(ui.getUi().mode).toBe('jardin')
    b.back()
    expect(ui.getUi()).toMatchObject({ tab: 'entretien', mode: 'entretenir' })
  })

  it('mémorise le mode et le relit au lancement suivant', async () => {
    const storage = memoryStorage()
    const first = await load('', storage)
    first.ui.setMode('planifier')
    expect(storage.data.get('pj.mode')).toBe('planifier')
    const second = await load('', storage)
    expect(second.ui.getUi().mode).toBe('planifier')
  })

  it('ignore un mode mémorisé invalide', async () => {
    const { ui } = await load('', memoryStorage({ 'pj.mode': 'nimporte', 'pj.guide': '{pas du json' }))
    expect(ui.getUi().mode).toBe('jardin')
    expect(ui.getUi().guide.stepsHidden).toBe(true)
  })

  it('applyDefaultMode : sans mémoire, choisit selon les plantes et l’écran d’ouverture', async () => {
    const few = await load('', memoryStorage())
    few.ui.applyDefaultMode(1)
    expect(few.ui.getUi()).toMatchObject({ mode: 'jardin', tab: 'carte' })

    const storage = memoryStorage()
    const many = await load('', storage)
    many.ui.applyDefaultMode(8)
    expect(many.ui.getUi()).toMatchObject({ mode: 'entretenir', tab: 'entretien' })
    expect(many.b.current().hash).toBe('#entretien')
    expect(many.b.length()).toBe(1) // remplacement, pas d'empilement
    expect(storage.data.get('pj.mode')).toBe('entretenir')
  })

  it('applyDefaultMode ne touche pas à un mode mémorisé ni à un hash explicite', async () => {
    const kept = await load('', memoryStorage({ 'pj.mode': 'jardin' }))
    kept.ui.applyDefaultMode(20)
    expect(kept.ui.getUi().mode).toBe('jardin')
    const explicit = await load('#plantes', memoryStorage())
    explicit.ui.applyDefaultMode(20)
    expect(explicit.ui.getUi()).toMatchObject({ mode: 'entretenir', tab: 'plantes' })
  })

  it('applyDefaultMode préserve un hash de lien magique', async () => {
    const b = await load('#access_token=abc&type=magiclink', memoryStorage())
    b.ui.applyDefaultMode(20)
    expect(b.b.current().hash).toBe('#access_token=abc&type=magiclink')
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

  it('showFirstSteps rouvre la checklist sur « Mon jardin »', async () => {
    const { ui } = await load('')
    ui.setMode('entretenir')
    ui.showFirstSteps()
    expect(ui.getUi().guide).toMatchObject({ stepsHidden: false, stepsOpen: true })
    expect(ui.getUi()).toMatchObject({ mode: 'jardin', tab: 'carte' })
  })
})
