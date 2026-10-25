import { useMemo, useState } from 'react'
import { Tabs, TabPanel } from '../../components/Tabs'
import { SPECIES_BY_ID } from '../../data/species'
import { TASK_ICON, TASK_LABEL } from '../../data/labels'
import { markTaskDone, unmarkTask, useGardenPlants, useStore } from '../../lib/store'
import { enableNotifications, notificationsSupported } from '../../lib/notify'
import { showToast } from '../../lib/toast'
import { uid } from '../../lib/geo'
import { setUi } from '../../lib/ui'
import { MONTH_NAMES } from '../../engine/calendar'
import { waterBalance, yearPlan } from '../../engine/tasks'
import type { Garden, GeneratedTask, TaskType, WeatherBundle } from '../../types'
import { PlaceAction } from '../../components/PlaceAction'
import { useTasks } from './useTasks'
import { doneOnLabel, doneTaskLabel } from './taskLabel'
import { rainWord, weatherSentences } from './weatherText'
import '../../styles/novice-pages.css'

/** Types de tâches dont la faisabilité dépend de la météo : grisés tant qu'elle n'est pas chargée. */
const WEATHER_TYPES = new Set<TaskType>(['arrosage', 'desherbage', 'taille', 'traitement', 'protection'])

function WeatherStrip({ weather }: { weather: WeatherBundle }) {
  const wb = waterBalance(weather)
  return (
    <div className="card">
      <h2>Météo des 7 prochains jours</h2>
      <div className="np-weather">
        {weather.forecast.slice(0, 7).map((d) => (
          <div key={d.date} className={'d' + (d.tMin <= 0 ? ' frost' : d.rainMm >= 0.5 ? ' rain' : '')}>
            <div>{new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</div>
            <strong>{Math.round(d.tMax)}°</strong>
            <div className="muted">{Math.round(d.tMin)}°</div>
            <div>{rainWord(d.rainMm)}</div>
            {d.tMin <= 0 && <div>❄ Gel</div>}
          </div>
        ))}
      </div>
      {weatherSentences(wb).map((s) => (
        <p key={s} style={{ margin: '8px 0 0' }}>
          {s}
        </p>
      ))}
      <details className="np-details">
        <summary>Détails météo</summary>
        <p className="small" style={{ margin: 0 }}>
          Pluie tombée en 7 jours : {wb.rain7.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mm. Eau évaporée : {wb.et07.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mm.
          {wb.deficitMm > 0 ? ` Il manque ${wb.deficitMm.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mm.` : ''} Pluie prévue sous 3 jours : {wb.forecastRain3.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mm.
        </p>
        {weather.forecast.slice(0, 7).map((d) => (
          <p key={d.date} className="small muted" style={{ margin: 0 }}>
            {new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : {Math.round(d.tMin)} à {Math.round(d.tMax)} °C
            {d.rainMm >= 0.5 ? `, ${d.rainMm.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} mm de pluie` : ''}
          </p>
        ))}
        <p className="small muted" style={{ margin: '6px 0 0' }}>Source : Open-Meteo.</p>
      </details>
    </div>
  )
}

function TaskItem({ garden, task, weatherPending }: { garden: Garden; task: GeneratedTask; weatherPending: boolean }) {
  const plants = useGardenPlants(garden.id)
  const names = task.plantIds.length
  return (
    <li className={'task' + (task.blockedBy ? ' blocked' : '') + (weatherPending ? ' weather-pending' : '')}>
      <div className="task-main">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span aria-hidden>{TASK_ICON[task.type]}</span>
            <strong className="task-title">{task.title}</strong>
            {task.priority === 'haute' && !task.blockedBy && <span className="badge warn">À faire vite</span>}
            {task.blockedBy && <span className="badge">{task.blockedBy}</span>}
            {weatherPending && <span className="badge">Météo en attente</span>}
          </div>
          <div className="small">{task.howTo}</div>
          <div className="small muted">
            {task.reason}
            {task.tool ? ` Outil : ${task.tool}.` : ''}
          </div>
          {task.detail && (
            <details className="np-details">
              <summary>Détails météo</summary>
              <p className="small muted" style={{ margin: 0 }}>{task.detail}</p>
            </details>
          )}
        </div>
      </div>
      <div className="np-task-actions">
        <button
          type="button"
          className="btn primary np-done"
          aria-label={`Fait : ${task.title}`}
          onClick={() => {
            markTaskDone({ id: uid(), gardenId: garden.id, taskKey: task.key, doneAt: new Date().toISOString() })
            showToast({ message: `Fait : ${task.title}`, actionLabel: 'Annuler', onAction: () => unmarkTask(garden.id, task.key) })
          }}
        >
          Fait ✓
        </button>
        {names > 0 &&
          task.plantIds.slice(0, 8).map((id) => {
            const p = plants.find((x) => x.id === id)
            return (
              <button key={id} className="btn small ghost" onClick={() => setUi({ tab: 'carte', selectedPlantId: id, focusPlantId: id })}>
                📍 {p?.customName || SPECIES_BY_ID[p?.speciesId ?? '']?.nomCommun || 'plante'}
              </button>
            )
          })}
        {names > 8 && <span className="muted small">+ {names - 8}</span>}
      </div>
    </li>
  )
}

function YearPlan({ garden }: { garden: Garden }) {
  const plants = useGardenPlants(garden.id)
  const plan = yearPlan(plants, SPECIES_BY_ID)
  const current = new Date().getMonth() + 1
  return (
    <div className="grid cols-3">
      {plan.map((m) => (
        <div key={m.month} className="card" style={{ margin: 0, outline: m.month === current ? '2px solid var(--accent)' : undefined }}>
          <h3 style={{ textTransform: 'capitalize' }}>{MONTH_NAMES[m.month - 1]}</h3>
          {m.tasks.length === 0 && <p className="muted small">Rien de prévu.</p>}
          <ul className="list small">
            {m.tasks.slice(0, 12).map((t, i) => (
              <li key={i} style={{ padding: '4px 0' }}>
                {TASK_ICON[t.type]} {TASK_LABEL[t.type]} — {SPECIES_BY_ID[t.speciesId]?.nomCommun ?? t.speciesId}
                {t.count > 1 ? ` (${t.count})` : ''}
              </li>
            ))}
            {m.tasks.length > 12 && <li className="muted">+ {m.tasks.length - 12} autres</li>}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function TasksPage({ garden }: { garden: Garden }) {
  const { tasks, weather, weatherError, weatherLoading } = useTasks(garden)
  const plants = useGardenPlants(garden.id)
  const allDone = useStore((s) => s.tasksDone)
  const done = useMemo(() => allDone.filter((t) => t.gardenId === garden.id), [allDone, garden.id])
  const [view, setView] = useState<'semaine' | 'annee'>('semaine')
  const [notif, setNotif] = useState(notificationsSupported() ? Notification.permission : 'denied')
  const open = tasks.filter((t) => !t.blockedBy)
  const blocked = tasks.filter((t) => t.blockedBy)
  const recent = done.filter((d) => Date.now() - new Date(d.doneAt).getTime() < 14 * 86400000).slice(-10).reverse()

  return (
    <div className="page np-page">
      <h1>Entretien</h1>
      <div className="row" style={{ margin: '4px 0 8px' }}>
        {!notificationsSupported() ? (
          <p className="small muted" style={{ margin: 0 }}>Les rappels ne marchent pas sur cet appareil.</p>
        ) : notif === 'granted' ? (
          <p className="small" style={{ margin: 0 }}>🔔 Les rappels sont activés.</p>
        ) : notif === 'denied' ? (
          <p className="small muted" style={{ margin: 0 }}>Les rappels sont bloqués. Autorisez les notifications dans les réglages de votre programme internet.</p>
        ) : (
          <button className="btn" onClick={async () => setNotif((await enableNotifications()) ? 'granted' : 'denied')}>
            🔔 Me prévenir quand il y a du travail
          </button>
        )}
      </div>
      <Tabs
        idPrefix="entretien"
        label="Vue de l'entretien"
        value={view}
        onChange={setView}
        tabs={[
          { id: 'semaine', label: 'Cette semaine' },
          { id: 'annee', label: "Calendrier de l'année" },
        ]}
      />
      <TabPanel idPrefix="entretien" active={view}>
      {view === 'annee' ? (
        <YearPlan garden={garden} />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {weatherLoading && !weather && (
            <p className="small muted" role="status">
              <span className="spinner" /> Météo en cours de chargement…
            </p>
          )}
          {weather?.stale && (
            <div className="alert small">
              Pas de réseau : météo du {new Date(weather.fetchedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.
            </div>
          )}
          {weather && <WeatherStrip weather={weather} />}
          {weatherError && <div className="alert small">La météo n’est pas disponible. Les tâches ne tiennent pas compte du temps.</div>}
          {plants.length === 0 ? (
            <div className="card empty">
              <p>
                <strong>Entretenir commence quand vos plantes sont placées.</strong>
              </p>
              <p>L’appli vous dira alors quand tailler, désherber, arroser et récolter.</p>
              <PlaceAction>Aller les placer</PlaceAction>
            </div>
          ) : (
            <div className="card">
              <h2>À faire maintenant ({open.length})</h2>
              {open.length === 0 && <p className="muted">Rien d'urgent : profitez du jardin.</p>}
              <ul className="list">
                {open.map((t) => (
                  <TaskItem key={t.key} garden={garden} task={t} weatherPending={!weather && weatherLoading && WEATHER_TYPES.has(t.type)} />
                ))}
              </ul>
              {blocked.length > 0 && (
                <>
                  <h3 style={{ marginTop: 16 }}>À faire plus tard ({blocked.length})</h3>
                  <p className="small muted" style={{ margin: 0 }}>Ces tâches attendent le bon moment.</p>
                  <ul className="list">
                    {blocked.map((t) => (
                      <TaskItem key={t.key} garden={garden} task={t} weatherPending={!weather && weatherLoading && WEATHER_TYPES.has(t.type)} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {recent.length > 0 && (
            <div className="card">
              <h3>Fait ces derniers jours</h3>
              <ul className="list small">
                {recent.map((d) => (
                  <li key={d.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      ✓ {doneTaskLabel(d.taskKey, (id) => SPECIES_BY_ID[id]?.nomCommun)}{' '}
                      <span className="muted">{doneOnLabel(d.doneAt)}</span>
                    </span>
                    <button className="btn small ghost" onClick={() => unmarkTask(garden.id, d.taskKey)}>
                      Annuler
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      </TabPanel>
    </div>
  )
}
