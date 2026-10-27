// Validation et migration des données (stockage local, import JSON, synchronisation).
// PROPRIÉTAIRE : dev-backend-supabase. La signature de `migrateState` est le contrat ; ne pas la changer.
import type { Building, Garden, Panorama, PanoramaShot, Plant, PlantMeasurement, PlantStatus, SoilTexture, TaskDone, TerrainGrid, XY } from '../types'
import { isoDate } from './dates'
import { isValidCalibration } from './calibration'
import { uid } from './geo'
import { LIMITS } from './security/limits'
import { cleanExtras, clipText, isPhotoId, isSafeId } from './security/sanitize'

/** Version du format stocké. Toute évolution incompatible = +1 et une étape dans `migrateState`. */
export const STATE_VERSION = 2

export interface StateData {
  gardens: Garden[]
  plants: Plant[]
  tasksDone: TaskDone[]
}

export type MigrateResult = { ok: true; data: StateData; warnings: string[] } | { ok: false; error: string }

/** Format d'export / de synchronisation. */
export interface SerializedState extends StateData {
  version: number
  exportedAt: string
}

const STATUSES: ReadonlySet<string> = new Set<PlantStatus>(['projet', 'en-place', 'malade', 'mort'])
const SOILS: ReadonlySet<string> = new Set<SoilTexture>(['argileux', 'limoneux', 'sableux', 'calcaire', 'humifere'])
const DAY_MS = 86_400_000

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isId = (v: unknown): v is string => isSafeId(v)
const inRange = (n: number, max: number) => Math.abs(n) <= max
/** Texte raccourci à `max` caractères (les données importées ne sont pas dignes de confiance). */
const text = (v: string, max: number = LIMITS.shortText) => clipText(v, max)

const GARDEN_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'address', 'center', 'altitudeM', 'parcel', 'parcelRefs', 'areaM2', 'buildings', 'terrain', 'sol', 'lastFrostDoy', 'firstFrostDoy', 'minAbsC', 'calibration', 'panoramas', 'createdAt'])
const PLANT_KEYS: ReadonlySet<string> = new Set(['id', 'gardenId', 'speciesId', 'customName', 'position', 'plantedAt', 'ageAtPlanting', 'status', 'notes', 'photos', 'measurements'])
const TASK_KEYS: ReadonlySet<string> = new Set(['id', 'gardenId', 'taskKey', 'doneAt'])

/** Date ISO plausible : « 2024-03-10 » ou date-heure complète. Rejette « 2024-13-45 ». */
function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return false
  return Number.isFinite(Date.parse(v))
}

function validXY(v: unknown): v is XY {
  return isRec(v) && isNum(v.x) && isNum(v.y) && inRange(v.x, LIMITS.coordM) && inRange(v.y, LIMITS.coordM)
}

/** Anneau d'au moins 3 points tous valides, sinon undefined. */
function validRing(v: unknown): XY[] | undefined {
  if (!Array.isArray(v) || v.length < 3 || v.length > LIMITS.ringPoints || !v.every(validXY)) return undefined
  return v.map((p) => ({ x: p.x, y: p.y }))
}

function validTerrain(v: unknown): TerrainGrid | undefined {
  if (!isRec(v) || !isNum(v.size) || v.size <= 0 || v.size > LIMITS.terrainSizeM || !isNum(v.n) || !Number.isInteger(v.n) || v.n < 2 || v.n > LIMITS.terrainN) return undefined
  if (!Array.isArray(v.heights) || v.heights.length !== v.n * v.n || !v.heights.every(isNum)) return undefined
  return { size: v.size, n: v.n, heights: v.heights as number[] }
}

/** Accumule des compteurs et les transforme en phrases françaises. */
class Report {
  private counts = new Map<string, number>()
  private templates = new Map<string, [string, string]>()
  private order: string[] = []
  add(id: string, one: string, many: string, n = 1) {
    if (!this.templates.has(id)) {
      this.templates.set(id, [one, many])
      this.order.push(id)
    }
    this.counts.set(id, (this.counts.get(id) ?? 0) + n)
  }
  toList(): string[] {
    return this.order.map((id) => {
      const n = this.counts.get(id) ?? 0
      const [one, many] = this.templates.get(id)!
      return (n === 1 ? one : many).replace('{n}', String(n))
    })
  }
}

function sanitizeGarden(raw: unknown, report: Report): Garden | undefined {
  if (!isRec(raw)) {
    report.add('g-invalide', '{n} jardin invalide (sans identifiant ou sans position géographique) a été ignoré.', '{n} jardins invalides (sans identifiant ou sans position géographique) ont été ignorés.')
    return undefined
  }
  const c = raw.center
  const centerOk = isRec(c) && isNum(c.lon) && isNum(c.lat) && Math.abs(c.lon) <= 180 && Math.abs(c.lat) <= 90
  if (!isId(raw.id) || !centerOk) {
    report.add('g-invalide', '{n} jardin invalide (sans identifiant ou sans position géographique) a été ignoré.', '{n} jardins invalides (sans identifiant ou sans position géographique) ont été ignorés.')
    return undefined
  }
  const center = c as { lon: number; lat: number }
  const g: Garden = {
    ...(cleanExtras(raw, GARDEN_KEYS) as unknown as Partial<Garden>),
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? text(raw.name) : 'Mon jardin',
    address: typeof raw.address === 'string' ? text(raw.address) : '',
    center: { lon: center.lon, lat: center.lat },
    createdAt: isValidDate(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
  }

  if (isNum(raw.altitudeM) && inRange(raw.altitudeM, 10_000)) g.altitudeM = raw.altitudeM
  if (isNum(raw.areaM2) && raw.areaM2 >= 0 && raw.areaM2 <= 1e10) g.areaM2 = raw.areaM2
  if (isNum(raw.lastFrostDoy)) g.lastFrostDoy = raw.lastFrostDoy
  if (isNum(raw.firstFrostDoy)) g.firstFrostDoy = raw.firstFrostDoy
  if (isNum(raw.minAbsC) && raw.minAbsC >= -80 && raw.minAbsC <= 50) g.minAbsC = raw.minAbsC
  if (typeof raw.sol === 'string' && SOILS.has(raw.sol)) g.sol = raw.sol as SoilTexture
  if (Array.isArray(raw.parcelRefs)) {
    g.parcelRefs = raw.parcelRefs
      .filter((r): r is string => typeof r === 'string')
      .slice(0, LIMITS.parcelRefs)
      .map((r) => text(r, LIMITS.parcelRefLength))
  }

  if (raw.parcel !== undefined) {
    const ring = validRing(raw.parcel)
    if (ring) g.parcel = ring
    else {
      delete g.parcel
      report.add('parcelle', 'Le contour de la parcelle de {n} jardin était invalide : il a été retiré.', 'Le contour de la parcelle de {n} jardins était invalide : il a été retiré.')
    }
  }

  if (raw.buildings !== undefined) {
    if (!Array.isArray(raw.buildings)) {
      delete g.buildings
      report.add('bati', '{n} bâtiment invalide a été retiré.', '{n} bâtiments invalides ont été retirés.')
    } else {
      const kept: Building[] = []
      if (raw.buildings.length > LIMITS.buildingsPerGarden) report.add('bati-max', 'Des bâtiments en trop ont été ignorés dans {n} jardin.', 'Des bâtiments en trop ont été ignorés dans {n} jardins.')
      for (const b of raw.buildings.slice(0, LIMITS.buildingsPerGarden)) {
        const ring = isRec(b) ? validRing(b.ring) : undefined
        if (isRec(b) && isId(b.id) && ring && isNum(b.heightM) && b.heightM >= 0 && b.heightM <= 1000) kept.push({ id: b.id, ring, heightM: b.heightM })
        else report.add('bati', '{n} bâtiment invalide a été retiré.', '{n} bâtiments invalides ont été retirés.')
      }
      g.buildings = kept
    }
  }

  if (raw.terrain !== undefined) {
    const t = validTerrain(raw.terrain)
    if (t) g.terrain = t
    else {
      delete g.terrain
      report.add('relief', 'Le relief de {n} jardin était invalide : il a été retiré (rechargez-le depuis les réglages).', 'Le relief de {n} jardins était invalide : il a été retiré (rechargez-le depuis les réglages).')
    }
  }

  if (raw.calibration !== undefined) {
    const c = raw.calibration
    const cal = isRec(c) && isNum(c.a) && isNum(c.b) && isNum(c.tx) && isNum(c.ty) && isNum(c.rmsM) && isNum(c.n) && inRange(c.tx, LIMITS.coordM) && inRange(c.ty, LIMITS.coordM) && c.rmsM >= 0 ? { a: c.a, b: c.b, tx: c.tx, ty: c.ty, rmsM: c.rmsM, n: Math.max(0, Math.round(c.n)) } : undefined
    if (cal && isValidCalibration(cal)) g.calibration = cal
    else {
      delete g.calibration
      report.add('calibration', 'Le recalage GPS de {n} jardin était invalide : il a été retiré.', 'Le recalage GPS de {n} jardins était invalide : il a été retiré.')
    }
  }
  if (raw.panoramas !== undefined) {
    const list = sanitizePanoramas(raw.panoramas, report)
    if (list.length > 0) g.panoramas = list
    else delete g.panoramas
  }
  return g
}

/**
 * Points de vue en photos : un point sans position, sans date ou sans aucune photo valide est écarté ;
 * une photo à l'identifiant invalide ou au cap absurde est retirée. 6 points au plus, 12 photos par point.
 * Un identifiant de photo ne sert qu'une fois (sinon supprimer un point effacerait la photo d'un autre).
 */
export function sanitizePanoramas(raw: unknown, report: { add(id: string, one: string, many: string, n?: number): void }): Panorama[] {
  if (!Array.isArray(raw)) {
    report.add('pano', '{n} point de vue en photos invalide a été retiré.', '{n} points de vue en photos invalides ont été retirés.')
    return []
  }
  const out: Panorama[] = []
  const ids = new Set<string>()
  const photoIds = new Set<string>()
  for (const r of raw) {
    if (out.length >= LIMITS.panoramasPerGarden) {
      report.add('pano-max', '{n} point de vue en photos en trop a été ignoré.', '{n} points de vue en photos en trop ont été ignorés.')
      continue
    }
    if (!isRec(r) || !isId(r.id) || ids.has(r.id) || !isNum(r.x) || !isNum(r.y) || !inRange(r.x, LIMITS.coordM) || !inRange(r.y, LIMITS.coordM) || !isValidDate(r.takenAt) || (r.kind !== 'guide' && r.kind !== 'import') || !Array.isArray(r.shots)) {
      report.add('pano', '{n} point de vue en photos invalide a été retiré.', '{n} points de vue en photos invalides ont été retirés.')
      continue
    }
    const shots: PanoramaShot[] = []
    const cap = r.kind === 'import' ? 1 : LIMITS.shotsPerPanorama
    for (const sh of r.shots) {
      if (!isRec(sh) || !isPhotoId(sh.photoId) || photoIds.has(sh.photoId) || !isNum(sh.headingDeg) || !isNum(sh.fovDeg) || sh.fovDeg < 5 || sh.fovDeg > 360 || shots.length >= cap) {
        report.add('pano-photo', '{n} photo de point de vue invalide a été retirée.', '{n} photos de points de vue invalides ont été retirées.')
        continue
      }
      photoIds.add(sh.photoId)
      shots.push({ photoId: sh.photoId, headingDeg: ((sh.headingDeg % 360) + 360) % 360, fovDeg: sh.fovDeg })
    }
    if (shots.length === 0) {
      report.add('pano', '{n} point de vue en photos invalide a été retiré.', '{n} points de vue en photos invalides ont été retirés.')
      continue
    }
    ids.add(r.id)
    const p: Panorama = { id: r.id, x: r.x, y: r.y, takenAt: r.takenAt, shots, kind: r.kind }
    if (r.northOk === false) p.northOk = false
    out.push(p)
  }
  return out
}

const MAX_MEASUREMENTS = 50
const MAX_MEASURE_M = 60

/** Mesures valides (date correcte, nombres finis entre 0 et 60 m, au moins une valeur), 50 au plus. */
function validMeasurements(v: unknown): PlantMeasurement[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: PlantMeasurement[] = []
  for (const m of v) {
    if (out.length >= MAX_MEASUREMENTS) break
    if (!isRec(m) || !isValidDate(m.at)) continue
    const ok = (n: unknown): n is number => isNum(n) && n >= 0 && n <= MAX_MEASURE_M
    const r: PlantMeasurement = { at: m.at }
    if (ok(m.heightM)) r.heightM = m.heightM
    if (ok(m.spreadM)) r.spreadM = m.spreadM
    if (r.heightM !== undefined || r.spreadM !== undefined) out.push(r)
  }
  return out
}

function sanitizePlant(raw: unknown, gardenIds: Set<string>, report: Report): Plant | undefined {
  if (!isRec(raw) || !isId(raw.id)) {
    report.add('p-id', '{n} plante sans identifiant a été ignorée.', '{n} plantes sans identifiant ont été ignorées.')
    return undefined
  }
  if (!isId(raw.gardenId) || !gardenIds.has(raw.gardenId)) {
    report.add('p-jardin', "{n} plante dont le jardin n'existe pas a été ignorée.", "{n} plantes dont le jardin n'existe pas ont été ignorées.")
    return undefined
  }
  if (!validXY(raw.position)) {
    report.add('p-pos', '{n} plante sans position a été ignorée.', '{n} plantes sans position ont été ignorées.')
    return undefined
  }
  if (!isSafeId(raw.speciesId)) {
    report.add('p-espece', '{n} plante sans espèce a été ignorée.', '{n} plantes sans espèce ont été ignorées.')
    return undefined
  }
  const photos = Array.isArray(raw.photos) ? raw.photos.filter(isPhotoId).slice(0, LIMITS.photosPerPlant) : []
  if (Array.isArray(raw.photos) && photos.length !== raw.photos.length) {
    report.add('p-photos', "{n} plante avait une référence de photo invalide : elle a été retirée.", "{n} plantes avaient une référence de photo invalide : elle a été retirée.")
  }
  const p: Plant = {
    ...(cleanExtras(raw, PLANT_KEYS) as unknown as Partial<Plant>),
    id: raw.id,
    gardenId: raw.gardenId,
    speciesId: raw.speciesId,
    position: { x: raw.position.x, y: raw.position.y },
    plantedAt: raw.plantedAt as string,
    status: raw.status as PlantStatus,
    photos,
  }
  if (!isValidDate(raw.plantedAt)) {
    p.plantedAt = isoDate()
    report.add('p-date', "La date de plantation de {n} plante était invalide : celle d'aujourd'hui a été utilisée.", "La date de plantation de {n} plantes était invalide : celle d'aujourd'hui a été utilisée.")
  }
  if (!STATUSES.has(raw.status as string)) {
    p.status = 'en-place'
    report.add('p-statut', '{n} plante avec un statut inconnu a été remise « en place ».', '{n} plantes avec un statut inconnu ont été remises « en place ».')
  }
  if (isNum(raw.ageAtPlanting) && raw.ageAtPlanting >= 0 && raw.ageAtPlanting <= 1000) p.ageAtPlanting = raw.ageAtPlanting
  const meas = validMeasurements(raw.measurements)
  if (meas) {
    if (meas.length > 0) p.measurements = meas
    else delete p.measurements
    if (!Array.isArray(raw.measurements) || meas.length !== raw.measurements.length) {
      report.add('p-mesures', "{n} plante avait des mesures invalides : elles ont été écartées.", "{n} plantes avaient des mesures invalides : elles ont été écartées.")
    }
  } else delete p.measurements
  if (typeof raw.notes === 'string') p.notes = text(raw.notes, LIMITS.longText)
  if (typeof raw.customName === 'string') p.customName = text(raw.customName)
  return p
}

function sanitizeTaskDone(raw: unknown, gardenIds: Set<string>): TaskDone | undefined {
  if (!isRec(raw) || !isSafeId(raw.taskKey, LIMITS.taskKeyLength) || !isValidDate(raw.doneAt)) return undefined
  if (raw.gardenId !== undefined && raw.gardenId !== '' && !(isId(raw.gardenId) && gardenIds.has(raw.gardenId))) return undefined
  const extras = cleanExtras(raw, TASK_KEYS) as unknown as Partial<TaskDone>
  const done: TaskDone = { ...extras, id: isId(raw.id) ? raw.id : uid(), gardenId: raw.gardenId as string, taskKey: raw.taskKey, doneAt: raw.doneAt }
  if (raw.gardenId === undefined) delete (done as Partial<TaskDone>).gardenId
  return done
}

/** Tableau brut plafonné à `max` éléments (les premiers, ou les derniers si `fromEnd`) ; signale ce qui est ignoré. */
function capped(list: unknown, max: number, report: Report, id: string, one: string, many: string, fromEnd = false): unknown[] {
  if (!Array.isArray(list)) return []
  if (list.length <= max) return list
  const extra = list.length - max
  report.add(id, one.replace('{max}', String(max)), many.replace('{max}', String(max)), extra)
  return fromEnd ? list.slice(extra) : list.slice(0, max)
}

/** Retire les doublons d'id (le premier gagne). */
function dedupe<T extends { id: string }>(list: T[], report: Report, id: string, one: string, many: string): T[] {
  const seen = new Set<string>()
  return list.filter((x) => {
    if (seen.has(x.id)) {
      report.add(id, one, many)
      return false
    }
    seen.add(x.id)
    return true
  })
}

/**
 * Accepte n'importe quelle donnée brute (ancien format v1 sans `version`, import, synchro) et renvoie un état sûr :
 * jardins sans centre valide écartés, plantes sans position/jardin existant écartées, dates invalides corrigées,
 * tableaux manquants remplacés par [], doublons d'id supprimés. `warnings` décrit ce qui a été corrigé (en français).
 * `ok:false` seulement si le contenu n'est pas du tout exploitable (ou vient d'une version plus récente de l'appli).
 */
export function migrateState(raw: unknown): MigrateResult {
  if (!isRec(raw)) return { ok: false, error: 'Fichier non reconnu.' }
  if (!Array.isArray(raw.gardens) && !Array.isArray(raw.plants)) return { ok: false, error: 'Fichier non reconnu : aucun jardin ni plante trouvés.' }
  if (isNum(raw.version) && raw.version > STATE_VERSION) {
    return { ok: false, error: "Ces données viennent d'une version plus récente de PermaJardin. Mettez l'application à jour avant de les ouvrir." }
  }

  const report = new Report()
  // v1 (sans `version`) → v2 : même forme ; v2 ajoute seulement `version` et la validation.
  const gardens = dedupe(
    capped(raw.gardens, LIMITS.gardens, report, 'g-max', 'Seuls les {max} premiers jardins ont été gardés ; {n} jardin en trop a été ignoré.', 'Seuls les {max} premiers jardins ont été gardés ; {n} jardins en trop ont été ignorés.').map((g) => sanitizeGarden(g, report)).filter((g): g is Garden => !!g),
    report,
    'g-doublon',
    '{n} jardin en double a été ignoré.',
    '{n} jardins en double ont été ignorés.',
  )
  const gardenIds = new Set(gardens.map((g) => g.id))

  const plants = dedupe(
    capped(raw.plants, LIMITS.plants, report, 'p-max', 'Seules les {max} premières plantes ont été gardées ; {n} plante en trop a été ignorée.', 'Seules les {max} premières plantes ont été gardées ; {n} plantes en trop ont été ignorées.').map((p) => sanitizePlant(p, gardenIds, report)).filter((p): p is Plant => !!p),
    report,
    'p-doublon',
    '{n} plante en double a été ignorée.',
    '{n} plantes en double ont été ignorées.',
  )

  const rawDone = capped(raw.tasksDone, LIMITS.tasksDone, report, 't-max', 'Seules les {max} dernières tâches faites ont été gardées ; {n} tâche en trop a été ignorée.', 'Seules les {max} dernières tâches faites ont été gardées ; {n} tâches en trop ont été ignorées.', true)
  const done = rawDone.map((t) => sanitizeTaskDone(t, gardenIds)).filter((t): t is TaskDone => !!t)
  const tasksDone = dedupe(done, report, 't-doublon', '{n} tâche faite en double a été ignorée.', '{n} tâches faites en double ont été ignorées.')

  return { ok: true, data: { gardens, plants, tasksDone }, warnings: report.toList() }
}

/** Format d'export JSON et de synchronisation. */
export function serializeState(data: StateData): SerializedState {
  // Les points de vue en photos restent sur l'appareil (comme les photos des plantes) : ni export, ni synchronisation.
  const gardens = data.gardens.some((g) => g.panoramas) ? data.gardens.map(({ panoramas: _p, ...g }) => g) : data.gardens
  return { version: STATE_VERSION, exportedAt: new Date().toISOString(), gardens, plants: data.plants, tasksDone: data.tasksDone }
}

const baseOf = (key: string) => key.slice(key.indexOf(':') + 1)

/**
 * Purge de `tasksDone` : supprime ce qui a plus de 400 jours et, au-delà des 30 derniers jours, ne garde que la dernière
 * entrée par tâche (clé sans préfixe de période). Les entrées récentes sont toutes conservées (alertes de gel à venir).
 * Renvoie le même tableau s'il n'y a rien à retirer.
 */
export function compactTasksDone(tasks: TaskDone[], now: Date = new Date()): TaskDone[] {
  const t0 = now.getTime()
  const keepAll = t0 - 30 * DAY_MS
  const latest = new Map<string, number>()
  const stamp = (t: TaskDone) => Date.parse(t.doneAt)
  const bucket = (t: TaskDone) => `${t.gardenId ?? ''}|${baseOf(t.taskKey)}`
  for (const t of tasks) {
    const at = stamp(t)
    if (!Number.isFinite(at) || at >= keepAll) continue
    const b = bucket(t)
    if (at > (latest.get(b) ?? -Infinity)) latest.set(b, at)
  }
  const seenLatest = new Set<string>()
  const out = tasks.filter((t) => {
    const at = stamp(t)
    if (!Number.isFinite(at)) return true
    if (t0 - at > 400 * DAY_MS) return false
    if (at >= keepAll) return true
    const b = bucket(t)
    if (latest.get(b) !== at || seenLatest.has(b)) return false
    seenLatest.add(b)
    return true
  })
  return out.length === tasks.length ? tasks : out
}
